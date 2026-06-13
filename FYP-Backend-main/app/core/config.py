import os
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# app/core/config.py → app/ is parent.parent; FYP-Backend-main is parent.parent.parent
_APP_DIR = Path(__file__).resolve().parent.parent
_BACKEND_ROOT = _APP_DIR.parent
_ENV_PATH = _APP_DIR / ".env"
_BACKEND_ENV_PATH = _BACKEND_ROOT / ".env"

# Load env files so GROQ_API_KEY etc. resolve whether they live in app/.env or backend root .env
try:
    from dotenv import load_dotenv

    # Backend root first; then app/.env overrides (DATABASE_URL, secrets usually stay in app/.env)
    load_dotenv(_BACKEND_ENV_PATH, override=False)
    load_dotenv(_ENV_PATH, override=True)
except Exception:
    pass

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_PATH))

    PROJECT_NAME: str = "PrepifyAI"
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: str

    # Embedding Storage
    USE_PGVECTOR: bool = True

    # Security
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    # File Storage
    UPLOAD_DIR: str
    MAX_FILE_SIZE: int

    # OCR Settings
    TESSERACT_PATH: str
    POPPLER_PATH: Optional[str] = None

    # Optional: subject list / read-only aggregates cache (see app.core.redis_cache)
    REDIS_URL: Optional[str] = None
    # When true (and REDIS_URL is set), identical generate-questions requests return cached JSON.
    QUESTION_GENERATION_CACHE_ENABLED: bool = True

    # When false, POST /questions/generate-questions/ and async jobs return empty results with a notice (no Groq/RAG).
    QUESTION_GENERATION_ENABLED: bool = False

    # Optional: Groq API for LLM question generation (POST .../questions/generate-questions/)
    GROQ_API_KEY: Optional[str] = None
    # Faster default: llama-3.1-8b-instant. For higher quality (slower): llama-3.3-70b-versatile
    GROQ_QUESTION_MODEL: str = "llama-3.1-8b-instant"
    # When true, Groq uses JSON object mode (fewer malformed responses / fewer 502s from parse errors).
    GROQ_JSON_OBJECT_MODE: bool = True
    # Base seconds for /questions/generate-questions/ (used with HARD_CAP below).
    QUESTION_GENERATION_TIMEOUT_SEC: int = 180
    # Hard ceiling (seconds) for Groq+RAG work in the request thread (bilingual MCQ batches need headroom).
    QUESTION_GENERATION_HARD_CAP_SEC: int = 300
    # Below this many characters of combined chunk text, use conceptual/synoptic fallback instead of failing.
    QUESTION_GENERATION_CONTEXT_MIN_CHARS: int = 80
    # Optional extra cap on asyncio wait (0 = use only HARD_CAP). Rarely needed if HARD_CAP is set.
    QUESTION_GENERATION_LIVE_MAX_SEC: int = 0
    # Redis TTL for identical generate-questions payloads (see question generation cache key).
    QUESTION_GENERATION_REDIS_TTL_SEC: int = 600
    # When true, use fewer syllabus chunks and a smaller Groq prompt cap for lower latency (slightly less recall).
    QUESTION_GENERATION_FAST_MODE: bool = True
    # With FAST_MODE, syllabus retrieval uses at most this many chunks (after RAG_TOP_K is applied).
    RAG_TOP_K_FAST: int = 3
    # With FAST_MODE, Groq prompt context is capped at min(GROQ_CONTEXT_MAX_CHARS, this).
    GROQ_CONTEXT_FAST_MAX_CHARS: int = 8000
    # Maximum MCQs per Groq call (smaller = more reliable JSON; 8 MCQs → two calls when set to 4).
    MCQ_LLM_BATCH_SIZE: int = 4
    # Cache FAISS retrieval context by topic for lower repeat latency.
    RETRIEVAL_CACHE_TTL_SEC: int = 300
    RETRIEVAL_CACHE_MAX_ENTRIES: int = 256
    # Truncate RAG context sent to Groq (raise when syllabus chunks are large).
    GROQ_CONTEXT_MAX_CHARS: int = 16000
    # Cap completion tokens so Groq returns faster (raise if long papers truncate mid-JSON).
    GROQ_MAX_OUTPUT_TOKENS: int = 4096
    # Chunks retrieved for question generation (syllabus pool / retrieval breadth).
    RAG_TOP_K: int = 8
    # Startup warmup for retriever can consume CPU/RAM and slow auth/requests on low-end machines.
    RETRIEVER_WARMUP_ON_STARTUP: bool = False
    # When true, load SentenceTransformer + FAISS in lifespan before serving traffic — can delay login/health for minutes.
    # Default false: API accepts requests immediately; first RAG/question-gen may be slower while a background thread warms up.
    # Set true in production if you prefer paying startup cost once instead of on first AI request.
    RETRIEVER_BLOCKING_WARMUP: bool = False

    # Seed past_papers / past_papers_questions from repo JSON on server start (idempotent).
    # Set PAST_PAPERS_JSON_AUTOLOAD=false in app/.env to disable.
    PAST_PAPERS_JSON_AUTOLOAD: bool = False

    # When true, AI-generated questions start as ``pending`` until an admin approves them.
    REQUIRE_GENERATED_QUESTION_APPROVAL: bool = False

    # When true, JSON error responses may include DB/exception hints (never enable in production).
    DEBUG_API: bool = False

    # Default admin bootstrap (dev convenience).
    # If the admin user is missing (or has the wrong role/password), the server will create/update it.
    ADMIN_EMAIL: str = "admin@prepifyai.com"
    ADMIN_PASSWORD: str = "admin123"
    ENSURE_DEFAULT_ADMIN: bool = True

    # When true, duplicate (board, class_level, subject_name) rows raise instead of picking lowest id.
    SUBJECT_DUPLICATE_STRICT: bool = False

    # When true, RAG context for question generation is loaded only from ``textbook_chunks`` for the
    # resolved subject_id (no global books_chunks.json retrieval — avoids cross-subject leakage).
    QUESTION_GENERATION_STRICT_SYLLABUS: bool = False
    # If a chunk row has empty ``text_content`` but chapter/topic names exist, build a short syllabus
    # line from metadata so generation can still run (re-ingest full book text for best quality).
    SYLLABUS_USE_METADATA_WHEN_TEXT_EMPTY: bool = True
    # Minimum combined body (+ optional metadata) character count before strict syllabus generation runs.
    SYLLABUS_MIN_COMBINED_CHARS: int = 50

    def backend_root(self) -> Path:
        """``FYP-Backend-main`` (parent of the ``app`` package). Same anchor as ``app/main.py``."""
        # app/core/config.py -> parents[2] == FYP-Backend-main
        return Path(__file__).resolve().parent.parent.parent

    def upload_dir_abs(self) -> Path:
        """
        Absolute upload root. Relative ``UPLOAD_DIR`` values are resolved against ``backend_root``,
        not ``Path.cwd()`` (uvicorn cwd varies and broke past-paper / book PDF saves vs downloads).
        """
        p = Path(self.UPLOAD_DIR)
        if p.is_absolute():
            return p.resolve()
        return (self.backend_root() / p).resolve()


settings = Settings()

