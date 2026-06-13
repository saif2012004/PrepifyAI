"""
Import past papers from repo JSON files (past_papers/.../Processed/*.json etc.)
into past_papers + past_papers_questions so students can browse them via API.

Idempotent: skips (subject_id, year, board) rows that already exist.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.embedding_storage import embedding_to_storage_format
from app.utils.text_embeddings import encode_texts_batch
from app.models.past_paper import PastPaper
from app.models.past_paper_question import PastPaperQuestion
from app.models.subject import Subject

logger = logging.getLogger(__name__)

SUBJECT_FOLDER_MAP = {
    "math": "Mathematics",
    "mathematics": "Mathematics",
    "biology": "Biology",
    "chemistry": "Chemistry",
    "physics": "Physics",
    "computer": "Computer Science",
    "computerscience": "Computer Science",
}


def _norm_board(raw: str) -> str:
    s = (raw or "").strip().lower()
    if s == "fbise":
        return "FBISE"
    if s == "punjab":
        return "punjab"
    return (raw or "FBISE").strip() or "FBISE"


def _class_from_folder(name: str) -> Optional[str]:
    m = re.match(r"class\s*(\d+)", (name or "").lower().replace(" ", ""))
    if m:
        return m.group(1)
    return None


def _guess_question_type(text: str) -> str:
    t = text.lower()
    if ("(a)" in t and "(b)" in t) or re.search(r"\b[abcd]\)\s", t):
        return "MCQ"
    if len(text) > 900:
        return "Long"
    return "Short"


def _extract_items(data: Dict[str, Any]) -> List[Tuple[str, str, Optional[float]]]:
    """
    Return list of (question_type, question_text, marks_or_none).
    """
    out: List[Tuple[str, str, Optional[float]]] = []

    if isinstance(data.get("questions"), list) and data["questions"]:
        for q in data["questions"]:
            title = (q.get("question_title") or "").strip()
            body = (q.get("content") or "").strip()
            if not body and not title:
                continue
            text = f"{title}\n{body}".strip() if title else body
            if len(text) < 12:
                continue
            qt = _guess_question_type(text)
            out.append((qt, text, None))
        return out

    for sec in data.get("sections") or []:
        sec_marks = sec.get("marks")
        questions = sec.get("questions") or []
        per_q_marks: Optional[float] = None
        if isinstance(sec_marks, (int, float)) and questions:
            try:
                per_q_marks = float(sec_marks) / max(len(questions), 1)
            except Exception:
                per_q_marks = None
        for q in questions:
            parts: List[str] = []
            c = (q.get("content") or "").strip()
            if c and len(c) > 2:
                parts.append(c)
            for sq in q.get("sub_questions") or []:
                pn = (sq.get("part_number") or "").strip()
                sc = (sq.get("content") or "").strip()
                if sc:
                    parts.append(f"{pn} {sc}".strip() if pn else sc)
            text = "\n".join(parts).strip()
            if len(text) < 12:
                continue
            qt = _guess_question_type(text)
            out.append((qt, text, per_q_marks))

    return out


async def _get_or_create_subject(
    db: AsyncSession, board: str, class_level: str, subject_name: str
) -> Subject:
    from app.utils.subject_query import get_or_create_subject_triple

    return await get_or_create_subject_triple(
        db,
        board=board,
        class_level=class_level,
        subject_name=subject_name,
        book_version="2023",
    )


async def import_json_past_papers(
    db: AsyncSession,
    base_dir: Optional[Path] = None,
) -> Dict[str, int]:
    """
    Walk past_papers/class*/{board}/{subject}/{Processed|Cleaned_JSON|Extracted_JSON}/*.json
    and insert missing papers + questions.
    """
    root = base_dir or Path(__file__).resolve().parent.parent.parent / "past_papers"
    stats = {"files_seen": 0, "papers_created": 0, "questions_created": 0, "skipped_existing": 0, "errors": 0}

    if not root.is_dir():
        logger.warning("Past papers directory not found: %s", root)
        return stats

    stages = ("Processed", "Cleaned_JSON", "Extracted_JSON")
    seen_keys: set[Tuple[str, str, str, int]] = set()

    for class_dir in sorted(root.iterdir()):
        if not class_dir.is_dir() or not class_dir.name.lower().startswith("class"):
            continue
        cl = _class_from_folder(class_dir.name)
        if not cl:
            continue
        for board_dir in sorted(class_dir.iterdir()):
            if not board_dir.is_dir():
                continue
            board_norm = _norm_board(board_dir.name)
            for subj_dir in sorted(board_dir.iterdir()):
                if not subj_dir.is_dir():
                    continue
                key_folder = subj_dir.name.lower()
                subject_name = SUBJECT_FOLDER_MAP.get(
                    key_folder, subj_dir.name.replace("_", " ").title()
                )
                for stage in stages:
                    stage_dir = subj_dir / stage
                    if not stage_dir.is_dir():
                        continue
                    for jf in sorted(stage_dir.glob("*.json")):
                        stats["files_seen"] += 1
                        year_str = jf.stem
                        if not year_str.isdigit():
                            continue
                        year = int(year_str)
                        dedup = (board_norm, cl, subject_name, year)
                        if dedup in seen_keys:
                            continue
                        try:
                            with open(jf, encoding="utf-8") as f:
                                data = json.load(f)
                        except Exception as e:
                            logger.warning("Skip unreadable JSON %s: %s", jf, e)
                            stats["errors"] += 1
                            continue

                        items = _extract_items(data)
                        if not items:
                            continue

                        sub = await _get_or_create_subject(db, board_norm, cl, subject_name)

                        ex = await db.execute(
                            select(PastPaper).where(
                                PastPaper.subject_id == sub.subject_id,
                                PastPaper.year == year,
                                PastPaper.board == board_norm,
                            )
                        )
                        if ex.scalar_one_or_none():
                            stats["skipped_existing"] += 1
                            seen_keys.add(dedup)
                            continue

                        try:
                            paper = PastPaper(
                                subject_id=sub.subject_id,
                                year=year,
                                board=board_norm,
                                is_published=True,
                            )
                            db.add(paper)
                            await db.flush()

                            texts = [t[1] for t in items]
                            vectors = encode_texts_batch(texts)

                            for i, (qt, qtext, marks_hint) in enumerate(items):
                                vec = vectors[i] if i < len(vectors) else [0.0] * 384
                                stored = embedding_to_storage_format(vec)
                                pq = PastPaperQuestion(
                                    paper_id=paper.paper_id,
                                    question_text=qtext[:65000],
                                    question_type=qt,
                                    embedding=stored,
                                    topic=None,
                                    marks=marks_hint,
                                )
                                db.add(pq)
                                stats["questions_created"] += 1

                            stats["papers_created"] += 1
                            seen_keys.add(dedup)
                            await db.commit()
                        except Exception as e:
                            await db.rollback()
                            logger.warning("Import failed for %s: %s", jf, e)
                            stats["errors"] += 1

    return stats
