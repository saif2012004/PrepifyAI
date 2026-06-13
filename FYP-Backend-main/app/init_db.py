import asyncio
import logging
from database import engine
from app.models.base import Base
from app.models import *

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def init_db():
    """Create all tables in the database"""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Tables created successfully!")
    except Exception as e:
        logger.error(f"An error occurred while creating tables: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(init_db())