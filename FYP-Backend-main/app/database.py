import asyncio
import os

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.core import config as app_config
from typing import AsyncGenerator
from app.models.base import Base
from app.models import *

#
# Windows compatibility:
# psycopg async does not work with the default ProactorEventLoop.
# Force a compatible SelectorEventLoop policy before SQLAlchemy engine creation.
#
if os.name == "nt":
    selector_policy = getattr(asyncio, "WindowsSelectorEventLoopPolicy", None)
    if selector_policy is not None:
        asyncio.set_event_loop_policy(selector_policy())

def _async_database_url(url: str) -> str:
    if "+psycopg_async://" in url or "+asyncpg://" in url:
        return url
    return url.replace("postgresql://", "postgresql+psycopg_async://", 1)


settings = app_config.settings
DATABASE_URL = _async_database_url(settings.DATABASE_URL)

# SQL echo adds heavy I/O on every query; enable only when debugging API issues.
# pool_pre_ping: recover stale connections; connect_timeout avoids long hangs when DB is down.
_engine_kwargs: dict = {
    "echo": bool(getattr(settings, "DEBUG_API", False)),
    "pool_pre_ping": True,
    "connect_args": {"connect_timeout": int(getattr(settings, "DB_CONNECT_TIMEOUT", 10) or 10)},
}
engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)