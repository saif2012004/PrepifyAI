"""
Load textbook data from Extracted text books JSON files into the database.
Run this script before using question generation.

Usage: python load_textbooks.py
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.subject import Subject
from app.models.textbook_chunk import TextbookChunk

EXTRACTED_DIR = Path(__file__).parent / "Extracted text books"
# Minimum characters per chunk body (matches ingestion validation).
MIN_CHUNK_TEXT_CHARS = 100
SUBJECT_MAP = {
    "biology": "Biology",
    "chemistry": "Chemistry",
    "physics": "Physics",
    "math": "Mathematics",
    "computer": "Computer Science",
}


def _clean_title(raw: str) -> str:
    title = re.sub(r"\s+", " ", (raw or "").strip())
    return title.strip(" -:;,.")


def extract_chapter_page_map(content: str) -> list[dict]:
    """
    Parse chapter -> start_page hints from textbook content.
    Expected patterns in TOC like:
    "Chapter 1 Fundamentals of chemistry 6"
    """
    if not content:
        return []

    pattern = re.compile(
        r"chapter\s*(\d+)\s+([a-z][a-z0-9 ,&()'/-]{2,}?)\s+(\d{1,3})\b",
        flags=re.IGNORECASE,
    )

    seen = set()
    chapter_map: list[dict] = []
    for m in pattern.finditer(content):
        chapter_no = int(m.group(1))
        title = _clean_title(m.group(2))
        page = int(m.group(3))
        if page <= 0 or page > 1500 or not title:
            continue
        key = (chapter_no, title.lower(), page)
        if key in seen:
            continue
        seen.add(key)
        chapter_map.append(
            {
                "chapter_no": chapter_no,
                "title": title.title(),
                "start_page": page,
            }
        )

    chapter_map.sort(key=lambda x: x["start_page"])
    return chapter_map


def chapter_for_page(page_num: int, chapter_map: list[dict]) -> tuple[str, str]:
    """
    Resolve chapter/topic names for a page number.
    Returns (chapter_name, topic_name).
    """
    if not chapter_map:
        return ("Chapter 1", "Introduction")

    selected = chapter_map[0]
    for ch in chapter_map:
        if page_num >= ch["start_page"]:
            selected = ch
        else:
            break

    chapter_name = f"Chapter {selected['chapter_no']}: {selected['title']}"
    topic_name = selected["title"]
    return (chapter_name[:200], topic_name[:200])


def infer_topic_from_text(text: str) -> tuple[str, str] | None:
    """
    Heuristic fallback when chapter-page map is missing.
    Tries to extract chapter/topic from page text.
    """
    if not text:
        return None

    snippet = re.sub(r"\s+", " ", text).strip()
    if not snippet:
        return None

    m = re.search(
        r"\bchapter\s*(\d+)\s*[:.\-]?\s*([a-z][a-z0-9 ,&()'/-]{3,80})",
        snippet,
        flags=re.IGNORECASE,
    )
    if m:
        ch_no = int(m.group(1))
        title = _clean_title(m.group(2)).title()
        if title:
            return (f"Chapter {ch_no}: {title}"[:200], title[:200])

    # Look for all-caps heading phrases near start of page.
    head = snippet[:600]
    caps = re.search(r"\b([A-Z][A-Z\s]{8,80})\b", head)
    if caps:
        raw = _clean_title(caps.group(1))
        bad = {
            "NOT FOR SALE",
            "NATIONAL BOOK FOUNDATION",
            "FEDERAL TEXTBOOK BOARD",
            "ISLAMABAD",
            "CONTENTS",
            "TITLE PAGE",
        }
        if raw and raw.upper() not in bad:
            title = raw.title()
            return (f"Chapter 1: {title}"[:200], title[:200])

    return None


def get_subject_name(filename: str) -> str:
    """Map filename to subject name"""
    base = Path(filename).stem.lower()
    return SUBJECT_MAP.get(base, base.title())


async def get_or_create_subject(session, board: str, class_level: str, subject_name: str) -> Subject:
    """Get existing subject or create new one"""
    result = await session.execute(
        select(Subject).where(
            Subject.board == board,
            Subject.class_level == str(class_level).replace("class", ""),
            Subject.subject_name == subject_name,
        )
    )
    subject = result.scalar_one_or_none()
    if subject:
        return subject
    subject = Subject(
        board=board,
        class_level=str(class_level).replace("class", ""),
        subject_name=subject_name,
        book_version="2023",
    )
    session.add(subject)
    await session.flush()  # Get subject_id
    return subject


def chunk_content(content: str, max_chunk_size: int = 2000) -> list[dict]:
    """Split content into chunks. Prefer splitting by page markers."""
    if not content or len(content.strip()) < MIN_CHUNK_TEXT_CHARS:
        return []
    chunks = []
    chapter_map = extract_chapter_page_map(content)
    current_chapter = "Chapter 1"
    current_topic = "Introduction"
    # Split by page markers: --- Page N ---
    parts = re.split(r"---\s*Page\s*(\d+)\s*---", content, flags=re.IGNORECASE)
    current_page = 1
    for i in range(1, len(parts), 2):
        page_num = int(parts[i]) if i < len(parts) else current_page
        text = parts[i + 1].strip() if i + 1 < len(parts) else ""
        if not text or len(text) < MIN_CHUNK_TEXT_CHARS:
            continue
        if chapter_map:
            chapter_name, topic_name = chapter_for_page(page_num, chapter_map)
        else:
            inferred = infer_topic_from_text(text)
            if inferred:
                current_chapter, current_topic = inferred
            chapter_name, topic_name = current_chapter, current_topic
        if len(text) > max_chunk_size:
            for j in range(0, len(text), max_chunk_size):
                sub = text[j : j + max_chunk_size]
                if len(sub.strip()) >= MIN_CHUNK_TEXT_CHARS:
                    chunks.append({
                        "chapter_name": chapter_name,
                        "topic_name": topic_name,
                        "text_content": sub.strip(),
                        "page_start": page_num,
                        "page_end": page_num,
                    })
        else:
            if len(text.strip()) >= MIN_CHUNK_TEXT_CHARS:
                chunks.append({
                    "chapter_name": chapter_name,
                    "topic_name": topic_name,
                    "text_content": text,
                    "page_start": page_num,
                    "page_end": page_num,
                })
        current_page = page_num
    if not chunks:
        # No page markers - split by size
        for i in range(0, len(content), max_chunk_size):
            sub = content[i : i + max_chunk_size].strip()
            if len(sub) >= MIN_CHUNK_TEXT_CHARS:
                chunks.append({
                    "chapter_name": "Chapter 1",
                    "topic_name": "Introduction",
                    "text_content": sub,
                    "page_start": None,
                    "page_end": None,
                })
    return chunks


async def load_textbook(session, json_path: Path) -> tuple[int, int, int]:
    """Load one textbook JSON file. Returns (chunks_added, chunks_skipped, subject_id)."""
    try:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        print(f"  [SKIP] Cannot read {json_path.name}: {e}")
        return 0, 0, 0
    board = data.get("board", "FBISE")
    class_level = str(data.get("class", "9")).replace("class", "")
    subject_key = Path(json_path).stem.lower()
    subject_name = SUBJECT_MAP.get(subject_key, subject_key.title())
    content = data.get("cleaned_content") or data.get("content", "")
    if not content or len(content) < 200:
        print(f"  [SKIP] {json_path.name}: no content")
        return 0, 0, 0
    subject = await get_or_create_subject(session, board, class_level, subject_name)
    chunks_data = chunk_content(content)
    added = 0
    updated = 0
    skipped = 0
    for idx, c in enumerate(chunks_data):
        tc = (c.get("text_content") or "").strip()
        chn = (c.get("chapter_name") or "").strip()
        tpn = (c.get("topic_name") or "").strip()
        if len(tc) < MIN_CHUNK_TEXT_CHARS or not chn or not tpn:
            skipped += 1
            continue
        chunk_id = f"{board}_{class_level}_{subject_name}_{subject.subject_id}_{idx}"
        result = await session.execute(
            select(TextbookChunk).where(TextbookChunk.chunk_id == chunk_id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            # Backfill old "Page N" labels with meaningful chapter/topic names.
            if (
                (existing.topic_name or "").lower().startswith("page ")
                or (existing.chapter_name or "").lower().startswith("page ")
                or (existing.topic_name or "").strip().lower() in {"introduction", "chapter 1"}
            ):
                existing.chapter_name = c["chapter_name"][:200]
                existing.topic_name = c["topic_name"][:200]
                existing.page_start = c.get("page_start")
                existing.page_end = c.get("page_end")
                updated += 1
            continue
        chunk = TextbookChunk(
            chunk_id=chunk_id,
            subject_id=subject.subject_id,
            chapter_name=c["chapter_name"][:200],
            topic_name=c["topic_name"][:200],
            text_content=c["text_content"],
            page_start=c.get("page_start"),
            page_end=c.get("page_end"),
            token_count=len(c["text_content"].split()),
        )
        session.add(chunk)
        added += 1
    if updated:
        print(f"  Updated {json_path.parent.name}/{json_path.name}: {updated} chunks relabeled")
    if skipped:
        print(
            f"  [SKIP] {json_path.name}: skipped {skipped} chunk(s) "
            f"(need chapter_name, topic_name, text_content >= {MIN_CHUNK_TEXT_CHARS} chars)"
        )
    return added, skipped, int(subject.subject_id)


async def main():
    if not EXTRACTED_DIR.exists():
        print(f"[ERROR] Extracted text books directory not found: {EXTRACTED_DIR}")
        return
    total_added = 0
    total_files = 0
    per_subject: dict[int, int] = {}
    async with AsyncSessionLocal() as session:
        for board_dir in EXTRACTED_DIR.iterdir():
            if not board_dir.is_dir():
                continue
            for json_file in board_dir.glob("*.json"):
                total_files += 1
                added, skipped, sid = await load_textbook(session, json_file)
                total_added += added
                if sid and added > 0:
                    per_subject[sid] = per_subject.get(sid, 0) + added
                if added > 0:
                    print(f"  Loaded {json_file.parent.name}/{json_file.name}: {added} chunks")
                elif skipped > 0:
                    print(f"  {json_file.name}: 0 inserted, {skipped} skipped (validation)")
        await session.commit()
    print()
    print(f"[DONE] Processed {total_files} files, added {total_added} textbook chunks.")
    if per_subject:
        print(f"[DONE] Chunks inserted per subject_id: {dict(sorted(per_subject.items()))}")
    if total_added > 0:
        print("Question generation should work now.")
        print('Try: {"subject_name": "Biology", "board_name": "FBISE", "class_level": "9", "topic_name": "any", "count": 3}')


if __name__ == "__main__":
    asyncio.run(main())
