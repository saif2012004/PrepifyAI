import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, os.path.dirname(__file__))

import asyncio
from sqlalchemy import text
from app.database import engine
from app.models.base import Base
from app.models import *

async def init_db():
    async with engine.begin() as conn:
        # Ensure pgvector extension exists for VECTOR columns.
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)
    print("Database initialized successfully!")

if __name__ == "__main__":
    asyncio.run(init_db())
