"""
Seed subjects + textbook_chunks from FYP_JSON_DATASET/books_chunks.json.

The shipped data loaders expect folders that are not in this repo; this seeds the
DB straight from the bundled RAG dataset so the app has subjects and content.

Idempotent: if subjects already exist it does nothing.

Usage (from FYP-Backend-main): python scripts/seed_from_books_chunks.py
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND_ROOT / "app" / ".env")
except ImportError:
    pass

from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.models.subject import Subject
from app.models.textbook_chunk import TextbookChunk

DATA_PATH = _BACKEND_ROOT / "FYP_JSON_DATASET" / "FYP_JSON_DATASET" / "books_chunks.json"

BOARD_MAP = {"fbise": "FBISE", "punjab": "Punjab Board"}
SUBJECT_MAP = {
    "biology": "Biology",
    "chemistry": "Chemistry",
    "physics": "Physics",
    "math": "Mathematics",
    "computer": "Computer Science",
}
BOOK_VERSION = "2023"


def _class_level(raw: str) -> str:
    m = re.search(r"\d+", raw or "")
    return m.group(0) if m else (raw or "")


def _chapter_topic(text: str, fallback: str) -> tuple[str, str]:
    m = re.search(r"CHAPTER\s+\d+\s+([A-Z][A-Za-z0-9 ,&'/\-]{2,60})", text or "")
    if m:
        name = re.sub(r"\s+", " ", m.group(1)).strip(" -:;,.")
        if name:
            return name[:200], name[:200]
    return fallback, fallback


async def seed() -> None:
    if not DATA_PATH.exists():
        print(f"[seed] dataset not found: {DATA_PATH}")
        return

    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(func.count(Subject.subject_id)))).scalar() or 0
        if existing > 0:
            print(f"[seed] subjects already present ({existing}); nothing to do.")
            return

        records = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        print(f"[seed] loaded {len(records)} chunks")

        # 1) Create subjects for each distinct (board, class, subject).
        combos: dict[tuple[str, str, str], Subject] = {}
        for r in records:
            key = (r.get("board"), r.get("class"), r.get("subject"))
            if key in combos:
                continue
            board, cls, subj = key
            combos[key] = Subject(
                class_level=_class_level(cls),
                board=BOARD_MAP.get((board or "").lower(), (board or "").title()),
                subject_name=SUBJECT_MAP.get((subj or "").lower(), (subj or "").title()),
                book_version=BOOK_VERSION,
            )
        db.add_all(list(combos.values()))
        await db.flush()  # assign subject_id
        print(f"[seed] created {len(combos)} subjects")

        # 2) Create textbook chunks linked to their subject.
        chunks: list[TextbookChunk] = []
        for r in records:
            key = (r.get("board"), r.get("class"), r.get("subject"))
            subject = combos.get(key)
            if subject is None:
                continue
            text = (r.get("text") or "").strip()
            if len(text) < 100:
                continue
            subj_label = SUBJECT_MAP.get((r.get("subject") or "").lower(), "General")
            chapter, topic = _chapter_topic(text, subj_label)
            chunks.append(
                TextbookChunk(
                    chunk_id=str(r.get("chunk_id")),
                    subject_id=subject.subject_id,
                    chapter_name=chapter,
                    topic_name=topic,
                    text_content=text,
                    token_count=len(text.split()),
                )
            )
        db.add_all(chunks)
        await db.commit()
        print(f"[seed] inserted {len(chunks)} textbook chunks")
        print("[seed] done.")


if __name__ == "__main__":
    asyncio.run(seed())
