import os
import sys

# Psycopg async + SQLAlchemy require SelectorEventLoop on Windows (Proactor breaks DB requests).
import asyncio

if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

from pathlib import Path

# Ensure FYP-Backend-main is on sys.path (uvicorn main:app from app/ otherwise breaks "from app.*").
_backend_root = Path(__file__).resolve().parent.parent
_root_str = str(_backend_root)
if _root_str not in sys.path:
    sys.path.insert(0, _root_str)

# Load .env into os.environ (must run before ``from app.core.config import settings``)
try:
    from dotenv import load_dotenv

    _app_dir = Path(__file__).resolve().parent
    _backend_root = _app_dir.parent
    load_dotenv(_backend_root / ".env", override=False)
    load_dotenv(_app_dir / ".env", override=True)
except ImportError:
    pass

from fastapi import Depends, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
from contextlib import asynccontextmanager
import logging
from sqlalchemy import text, select
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import engine, get_db, AsyncSessionLocal
import uvicorn
from app.core.config import settings
from app.route_registry import register_all_routes
from app.core.password_utils import get_password_hash, verify_password
from app.models.user import User

# Initialize security
security = HTTPBearer()


def _is_connection_refused(e: Exception) -> bool:
    """True if error is database/connection refused (e.g. PostgreSQL not running)."""
    if isinstance(e, ConnectionRefusedError):
        return True
    if isinstance(e, OSError) and getattr(e, "winerror", None) == 1225:
        return True
    if isinstance(e, OSError) and getattr(e, "errno", None) == 111:
        return True
    return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    import threading
    try:
        root = settings.upload_dir_abs()
        root.mkdir(parents=True, exist_ok=True)
        (root / "past_papers").mkdir(parents=True, exist_ok=True)
        (root / "library").mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logging.getLogger("prepifyai.api").warning("Could not create upload directories: %s", e)

    # Preload SentenceTransformer + FAISS once (singleton in retriever.py + init lock) so requests do not reload weights.
    log_api = logging.getLogger("prepifyai.api")
    try:
        if getattr(settings, "RETRIEVER_BLOCKING_WARMUP", False):
            from app.utils.retriever import warmup as retriever_warmup

            await asyncio.to_thread(retriever_warmup)
            log_api.info("Retriever blocking warmup finished (SentenceTransformer + FAISS ready if dataset present).")
        else:

            def _start_retriever_warmup(reason: str) -> None:
                def _warmup() -> None:
                    try:
                        from app.utils.retriever import warmup as retriever_warmup

                        retriever_warmup()
                    except Exception:
                        pass

                threading.Thread(target=_warmup, daemon=True).start()
                log_api.info("Retriever warmup thread started (%s).", reason)

            if settings.RETRIEVER_WARMUP_ON_STARTUP:
                _start_retriever_warmup("RETRIEVER_WARMUP_ON_STARTUP=true")
            elif (getattr(settings, "GROQ_API_KEY", None) or "").strip():
                _start_retriever_warmup("GROQ_API_KEY set (first question gen stays fast)")
    except Exception:
        log_api.warning("Retriever warmup failed; first RAG request may be slow.", exc_info=True)

    def _load_past_papers_json():
        if not settings.PAST_PAPERS_JSON_AUTOLOAD:
            return
        import asyncio

        log = logging.getLogger("prepifyai.past_papers")

        async def _run():
            from app.database import AsyncSessionLocal
            from app.services.past_paper_json_loader import import_json_past_papers

            async with AsyncSessionLocal() as db:
                try:
                    summary = await import_json_past_papers(db)
                    log.info("Past paper JSON autoload: %s", summary)
                except OperationalError as e:
                    log.warning(
                        "Past paper JSON autoload skipped — PostgreSQL not reachable: %s. "
                        "From Complete_FYP run: docker compose up -d (port 5433).",
                        e.orig if getattr(e, "orig", None) else e,
                    )
                except Exception:
                    log.exception("Past paper JSON autoload failed")

        try:
            asyncio.run(_run())
        except OperationalError as e:
            logging.getLogger("prepifyai.past_papers").warning(
                "Past paper autoload runner: DB unavailable (%s).",
                e.orig if getattr(e, "orig", None) else e,
            )
        except Exception:
            logging.getLogger("prepifyai.past_papers").exception(
                "Past paper JSON autoload runner failed"
            )

    if settings.PAST_PAPERS_JSON_AUTOLOAD:
        threading.Thread(target=_load_past_papers_json, daemon=True).start()

    async def _bootstrap_default_admin() -> None:
        """
        Dev convenience: ensures `ADMIN_EMAIL` exists in DB and is authorized as admin.
        Fixes cases where admin login/authorization fails due to missing/wrong admin row.
        """
        if not settings.ENSURE_DEFAULT_ADMIN:
            return

        email = (settings.ADMIN_EMAIL or "").strip()
        password = settings.ADMIN_PASSWORD or ""
        expected_role = "admin"

        if not email or not password:
            print(
                "[prepifyai] Default admin bootstrap skipped: ADMIN_EMAIL/ADMIN_PASSWORD not configured"
            )
            return

        # bcrypt hash is CPU-heavy; run in thread so startup does not block request handling.
        expected_hash = await asyncio.to_thread(get_password_hash, password)
        created_new = False
        updated_existing = False

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(User).where(User.email == email))
                user = result.scalar_one_or_none()

                if user is None:
                    db.add(
                        User(
                            name="Admin",
                            email=email,
                            password_hash=expected_hash,
                            role=expected_role,
                            class_level=None,
                        )
                    )
                    await db.commit()
                    created_new = True
                    return

                role_is_admin = (user.role or "").strip().lower() == expected_role
                password_is_correct = await asyncio.to_thread(
                    verify_password, password, user.password_hash
                )
                if not role_is_admin or not password_is_correct:
                    user.role = expected_role
                    user.password_hash = expected_hash
                    await db.commit()
                    updated_existing = True
        except OperationalError as e:
            print(
                "[prepifyai] Default admin bootstrap skipped — PostgreSQL not reachable:",
                e.orig if getattr(e, "orig", None) else e,
            )
        except Exception:
            print("[prepifyai] Default admin bootstrap failed (see logs/traceback).")
            logging.getLogger("prepifyai.api").exception("Default admin bootstrap failed")
        else:
            print(
                f"[prepifyai] Default admin bootstrap completed for {email} (created={created_new}, updated={updated_existing})"
            )

    # Do not block server startup on default admin bootstrapping.
    # In some environments (Windows psycopg event-loop quirks / DB cold start),
    # this can hang and prevents the API from becoming reachable.
    asyncio.create_task(_bootstrap_default_admin())
    _bind_host = os.environ.get("UVICORN_HOST", "0.0.0.0")
    _bind_port = int(os.environ.get("UVICORN_PORT", "8001"))
    _startup_msg = f"Server running on {_bind_host}:{_bind_port}"
    print(f"[prepifyai] {_startup_msg} (localhost, LAN, Android emulator via 10.0.2.2)", flush=True)
    logging.getLogger("prepifyai.api").info("%s (reachable from PC, LAN, and emulator)", _startup_msg)
    yield
    if os.getenv("ENV") == "test":
        async with engine.begin() as conn:
            # Disable triggers (optional for cascade)
            await conn.execute(text("SET session_replication_role = 'replica';"))
            
            # Get all user tables in public schema except migration tables if any
            tables_result = await conn.execute(text("""
              SELECT tablename FROM pg_tables
              WHERE schemaname = 'public'
              AND tablename NOT LIKE 'alembic_%';
            """))
            tables = [row[0] for row in tables_result]
            
            # Truncate all tables cascade
            if tables:
                sql = "TRUNCATE TABLE " + ", ".join(tables) + " CASCADE;"
                await conn.execute(text(sql))
            
            # Re-enable triggers
            await conn.execute(text("SET session_replication_role = 'origin';"))
            
            await conn.commit()

def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        description="AI-Powered Preparation Assistant for FBISE Matric FSc and Entry Tests",
        version="1.0.0",
        lifespan=lifespan
    )

    # Set all CORS enabled origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        # JWT is sent via Authorization header, not cookies — False avoids * + cookies CORS issues.
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_all_routes(app)

    @app.get("/health/db", tags=["root"])
    async def health_database(db: AsyncSession = Depends(get_db)):
        """Verify PostgreSQL connectivity (same pool as auth/register)."""
        await db.execute(text("SELECT 1"))
        return {"database": "ok"}

    @app.get("/", tags=["root"])
    def _root():
        return {
            "app": "PrepifyAI",
            "docs": "/docs",
            "sections": [
                "authentication",
                "users",
                "subjects",
                "past paper questions",
                "past papers",
                "question generation",
                "prediction",
                "analyzer",
                "chatbot",
                "gamification",
            ],
        }

    @app.exception_handler(ConnectionRefusedError)
    @app.exception_handler(OSError)
    async def connection_refused_handler(request: Request, exc: Exception):
        if _is_connection_refused(exc):
            logging.getLogger("prepifyai.api").exception("Connection refused to dependency on %s", request.url.path)
            return JSONResponse(
                status_code=503,
                content={"detail": "Service is temporarily unavailable. Please try again in a few moments."},
            )
        raise exc

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        logging.getLogger("prepifyai.api").exception("IntegrityError on %s", request.url.path)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "detail": (
                    "This conflicts with existing data (for example the email may already be registered). "
                    "Try logging in or use another email."
                )
            },
        )

    @app.exception_handler(OperationalError)
    async def operational_error_handler(request: Request, exc: OperationalError):
        log = logging.getLogger("prepifyai.api")
        orig = getattr(exc, "orig", None)
        orig_txt = (str(orig) if orig is not None else str(exc)).strip()
        log.exception("OperationalError on %s (orig=%s)", request.url.path, orig_txt[:500] if orig_txt else "")
        # Never expose connection strings, ports, or docker hints to app users (including students).
        public = "Service is temporarily unavailable. Please try again in a few moments."
        return JSONResponse(status_code=503, content={"detail": public})

    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
        log = logging.getLogger("prepifyai.api")
        log.exception("SQLAlchemyError on %s", request.url.path)
        # Full traceback stays in server logs only — never tell mobile users to read API terminals.
        public = "Something went wrong. Please try again in a few moments."
        detail = public
        if settings.DEBUG_API:
            orig = getattr(exc, "orig", None)
            tail = (repr(orig) if orig is not None else repr(exc))[:400]
            detail = f"{public} (dev: {type(exc).__name__}: {tail})"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": detail},
        )

    def custom_openapi():
        """Make Swagger "Try it out" use the same host as /docs (fixes many Failed to fetch / bad URLs)."""
        if app.openapi_schema:
            return app.openapi_schema
        openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        openapi_schema["servers"] = [{"url": "/"}]
        app.openapi_schema = openapi_schema
        return app.openapi_schema

    app.openapi = custom_openapi

    return app

app = create_application()

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        # 0.0.0.0 so Expo Go / physical devices on LAN can reach this PC (127.0.0.1 only would time out).
        host=os.environ.get("UVICORN_HOST", "0.0.0.0"),
        port=int(os.environ.get("UVICORN_PORT", "8001")),
        reload=True,
    )
