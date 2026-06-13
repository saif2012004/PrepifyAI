"""
Load past papers from repo JSON (past_papers/**) into past_papers + past_papers_questions.
Idempotent: skips (subject, year, board) already in the DB.

Usage from repo root: python load_past_papers_json.py
Requires DATABASE_URL (e.g. app/.env).
"""

import asyncio
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root))

try:
    from dotenv import load_dotenv

    load_dotenv(root / "app" / ".env")
except ImportError:
    pass

from app.database import AsyncSessionLocal
from app.services.past_paper_json_loader import import_json_past_papers


async def main():
    async with AsyncSessionLocal() as db:
        summary = await import_json_past_papers(db)
        print(summary)


if __name__ == "__main__":
    asyncio.run(main())
