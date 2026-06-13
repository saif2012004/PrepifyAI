from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv
import os


load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from core.config import settings


def _alembic_sync_url(url: str) -> str:
    """Use psycopg v3 (sync) for migrations — plain postgresql:// defaults to missing psycopg2."""
    u = (url or "").strip()
    if "+psycopg_async://" in u:
        return u.replace("+psycopg_async://", "+psycopg://", 1)
    if "+psycopg://" in u:
        return u
    if u.startswith("postgresql://"):
        return u.replace("postgresql://", "postgresql+psycopg://", 1)
    return u


# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = None

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        {},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        url=_alembic_sync_url(settings.DATABASE_URL),
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
