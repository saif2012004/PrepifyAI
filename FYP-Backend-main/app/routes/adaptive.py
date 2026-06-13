"""
Adaptive next-question API for logged-in students.
Includes smart-practice session planning endpoint.
"""

import asyncio
import json
import os
from typing import Any, Optional, List, Dict, Tuple
import math
import random
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from pydantic import BaseModel, Field

from app.core.config import settings
from app.database import get_db
from app.models.user import User
from app.models.generated_question import GeneratedQuestion
from app.models.student_performance import StudentPerformance
from app.models.subject import Subject
from app.models.textbook_chunk import TextbookChunk
from app.models.past_paper import PastPaper
from app.models.past_paper_question import PastPaperQuestion
from app.services.performance_service import PerformanceService
from app.core.security import get_current_user, get_optional_user
from app.utils.retriever import retrieve_context_and_sources
from app.utils.performance_topic_label import label_for_performance_topic


router = APIRouter()


def _is_fbise_board(board: Optional[str]) -> bool:
    return "fbise" in (board or "").strip().lower()


def _clean_past_paper_text(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    # Remove common OCR/page noise
    t = re.sub(r"https?://\S+", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"---\s*Page\s*\d+\s*---", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"\b(ROLL NUMBER|SECTION [ABC]|Time allowed|Answer Sheet No\.?)\b", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"[|]{2,}", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _looks_like_usable_question(text: str) -> bool:
    if not text:
        return False
    if len(text) < 20 or len(text) > 420:
        return False
    lower = text.lower()
    noisy_markers = ["invigilator sign", "candidate sign", "answer sheet", "version no", "roll number"]
    if any(m in lower for m in noisy_markers):
        return False
    instruction_markers = [
        "answer any",
        "all parts carry equal marks",
        "section a is compulsory",
        "answer the following questions briefly",
        "time allowed",
        "(11 x 3 = 33)",
        "(11x 3 = 33)",
    ]
    if any(m in lower for m in instruction_markers):
        return False
    # Require at least one interrogative/question marker.
    if "?" not in text and not re.search(r"\b(what|why|how|define|differentiate|compare|describe|explain|write)\b", lower):
        return False
    # Reject strings with too many symbols/digits vs letters (typical OCR tables).
    letters = sum(ch.isalpha() for ch in text)
    non_letters = sum((not ch.isalpha()) and (not ch.isspace()) for ch in text)
    if letters == 0 or non_letters > letters:
        return False
    return True


def _build_fallback_model_answer_and_explanation(
    question_text: str,
    subject_name: str,
    topic: Optional[str],
) -> tuple[str, str]:
    focus = (topic or "the asked concept").strip() or "the asked concept"
    model_answer = (
        f"Model answer ({subject_name}):\n"
        f"1) Define {focus} clearly.\n"
        f"2) Explain its role/process in the context of the question.\n"
        f"3) Add one FBISE-style example or labeled point.\n"
        f"4) Conclude with the key outcome/effect."
    )
    explanation = (
        "How to score well: write in short structured points, use correct terms from the chapter, "
        "and connect your explanation directly to the asked situation."
    )
    return model_answer, explanation


def _sync_llm_model_answer(
    *,
    question_text: str,
    subject_name: str,
    class_level: str,
    topic: Optional[str],
    context_text: str,
) -> tuple[str, str]:
    key = (getattr(settings, "GROQ_API_KEY", None) or os.environ.get("GROQ_API_KEY") or "").strip()
    if not key:
        raise ValueError("GROQ key missing")
    from groq import Groq

    client = Groq(api_key=key)
    prompt = (
        "You are an FBISE exam tutor. Produce a correct, concise model answer.\n"
        f"Subject: {subject_name}\n"
        f"Class: {class_level}\n"
        f"Topic hint: {topic or 'N/A'}\n"
        f"Question: {question_text}\n"
        f"Reference context: {context_text[:1800]}\n\n"
        "Return JSON only with keys: model_answer (string), explanation (string)."
    )
    model = (getattr(settings, "GROQ_QUESTION_MODEL", None) or "llama-3.1-8b-instant").strip()
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=420,
    )
    content = (resp.choices[0].message.content or "").strip()
    start = content.find("{")
    end = content.rfind("}") + 1
    if start >= 0 and end > start:
        import json
        data = json.loads(content[start:end])
        model_answer = str(data.get("model_answer", "")).strip()
        explanation = str(data.get("explanation", "")).strip()
        if model_answer:
            return model_answer, (explanation or "Review chapter terminology and key points.")
    raise ValueError("LLM output parse failed")


async def _build_model_answer_and_explanation(
    *,
    question_text: str,
    subject_name: str,
    class_level: str,
    topic: Optional[str],
    context_text: str,
) -> tuple[str, str] | None:
    # Strict mode: do not fabricate fallback answers when context/LLM is unavailable.
    if not context_text.strip():
        return None
    try:
        return await asyncio.to_thread(
            _sync_llm_model_answer,
            question_text=question_text,
            subject_name=subject_name,
            class_level=class_level,
            topic=topic,
            context_text=context_text,
        )
    except Exception:
        return None


def _target_difficulty(recent_accuracy: float, current: str) -> str:
    current = current or "Medium"
    order = ["Easy", "Medium", "Hard"]
    idx = order.index(current) if current in order else 1
    if recent_accuracy >= 80.0 and idx < 2:
        return order[idx + 1]
    if recent_accuracy < 50.0 and idx > 0:
        return order[idx - 1]
    return current


def _pick_smart_practice_qtype() -> Tuple[str, str]:
    """
    Random mix for one-at-a-time smart practice.
    Returns (generator_qtype, db_question_type) with generator_qtype in mcq|short|long.
    """
    r = random.random()
    if r < 0.36:
        return ("mcq", "MCQ")
    if r < 0.72:
        return ("short", "Short")
    return ("long", "Long")


_BOOK_CONTEXT_PREFIX = (
    "The following blocks are direct excerpts from the student's indexed textbook for this subject. "
    "They may come from different chapters or topics. Generate exactly ONE short FBISE-style question "
    "whose answer is fully supported by these excerpts only. Do not rely on facts not stated here.\n\n"
)


async def _fetch_random_book_passages_context(
    db: AsyncSession,
    subject_id: int,
    *,
    n_passages: int = 6,
    max_chars: int = 9500,
) -> str:
    """
    Random in-book passages from ``textbook_chunks`` for this subject (any topic/chapter).
    Used so smart-practice questions are grounded in the uploaded book, not only global FAISS JSON.
    """
    id_res = await db.execute(
        select(TextbookChunk.chunk_id).where(TextbookChunk.subject_id == subject_id)
    )
    ids = [row[0] for row in id_res.fetchall()]
    if not ids:
        return ""
    k = min(max(1, n_passages), len(ids))
    sample_ids = random.sample(ids, k)
    chunk_res = await db.execute(
        select(
            TextbookChunk.text_content,
            TextbookChunk.chapter_name,
            TextbookChunk.topic_name,
        ).where(TextbookChunk.chunk_id.in_(sample_ids))
    )
    rows = list(chunk_res.fetchall())
    random.shuffle(rows)
    parts: List[str] = []
    total = 0
    for text_content, chapter_name, topic_name in rows:
        body = (text_content or "").strip()
        if not body:
            continue
        cn = (chapter_name or "").strip()
        tn = (topic_name or "").strip()
        label = f"{cn} / {tn}".strip(" /") or "textbook excerpt"
        block = f"[{label}]\n{body}"
        if total + len(block) + 8 > max_chars:
            remain = max_chars - total - 8
            if remain < 200:
                break
            block = f"[{label}]\n{body[:remain]}"
        parts.append(block)
        total += len(block) + 8
        if total >= max_chars:
            break
    return "\n\n---\n\n".join(parts)


def _sync_generate_smart_question(
    *,
    subject_name: str,
    class_level: str,
    board: str,
    topic_name: str,
    difficulty: str,
    book_context: Optional[str] = None,
    qtype: str = "short",
) -> dict:
    # Use same generation path as /questions/generate-questions/ (RAG + LLM).
    from app.services.generator import generate_questions

    exam = f"{board} Class {class_level}"
    if (book_context or "").strip():
        context = book_context.strip()
    else:
        context, _sources = retrieve_context_and_sources(
            topic_name, k=max(1, min(int(getattr(settings, "RAG_TOP_K", 5) or 5), 20))
        )
    qt = (qtype or "short").strip().lower()
    if qt not in ("mcq", "short", "long"):
        qt = "short"
    return generate_questions(
        topic=topic_name,
        subject=subject_name,
        exam=exam,
        difficulty=difficulty.lower(),
        qtype=qt,
        num_questions=1,
        context=context,
    )[0]


def _topic_title_is_vague(name: str) -> bool:
    t = (name or "").strip().lower()
    if len(t) < 3:
        return True
    if t in ("unknown", "n/a", "na", "none", "-", "misc", "other", "introduction"):
        return True
    if re.match(r"^(core concepts?|general syllabus practice)\b", t):
        return True
    if t.endswith("core concepts") and len(t) < 48:
        return True
    if t.startswith("unknown"):
        return True
    if t == "general syllabus practice":
        return True
    return False


def _clean_topic_pool(topic_pool: List[str]) -> List[str]:
    return [p for p in (topic_pool or []) if p and not _topic_title_is_vague(str(p).strip())]


def _refine_smart_topic_for_practice(
    smart_topic: str,
    topic_pool: List[str],
    *,
    subject_name: str,
    class_level: str,
) -> str:
    """
    Avoid placeholder labels (e.g. 'core concepts', 'Unknown') for RAG and fallback stems:
    prefer a real indexed textbook topic when available.
    """
    clean = _clean_topic_pool(topic_pool)
    s = (smart_topic or "").strip()
    if clean and (not s or _topic_title_is_vague(s)):
        return random.choice(clean)
    if s and not _topic_title_is_vague(s):
        return s
    if clean:
        return random.choice(clean)
    return f"FBISE Class {class_level} {subject_name} (mixed syllabus)"


def _fast_fallback_smart(
    subject_name: str,
    class_level: str,
    topic_name: str,
    difficulty: str,
    gen_qtype: str,
) -> dict:
    """Template when the LLM path fails; ``gen_qtype`` is mcq | short | long."""
    td = (topic_name or "").strip() or f"{subject_name} Class {class_level}"
    diff = (difficulty or "").lower()
    qt = (gen_qtype or "short").strip().lower()
    if qt == "mcq":
        stem = f"{subject_name} (Class {class_level}), topic «{td}». Choose the best answer."
        opts = {
            "A": "The definition or explanation that matches the textbook treatment of this topic.",
            "B": "A related but imprecise statement that omits a key part of the idea.",
            "C": "A common misconception that contradicts the correct concept.",
            "D": "An idea that belongs to a different unit and does not answer the focus.",
        }
        lines = "\n".join(f"{k}) {v}" for k, v in opts.items())
        return {
            "question": f"{stem}\n{lines}",
            "answer": "A",
            "mcq_stem": stem,
            "mcq_options": opts,
            "marks": 1,
        }
    if qt == "long":
        marks = 8 if diff != "hard" else 10
        return {
            "question": (
                f"{subject_name} (Class {class_level}), topic «{td}». Write a long FBISE-style answer: "
                "brief introduction with definition, at least two developed paragraphs with examples or applications, "
                "and a short conclusion. Aim for exam depth suitable for higher marks."
            ),
            "answer": (
                f"A model response defines the topic, develops main ideas with correct terminology and examples, "
                f"and concludes clearly ({marks} marks)."
            ),
            "marks": marks,
        }
    marks = 5 if diff != "hard" else 8
    return {
        "question": (
            f"{subject_name} (Class {class_level}), topic focus: {td}. "
            "Answer in FBISE short-note style: (1) definition or key statement, "
            "(2) brief explanation of the main idea, (3) one concrete example or application from this topic."
        ),
        "answer": (
            f"A strong answer names the key terms for this topic, explains the main idea or process clearly, "
            f"and ends with one correct example suitable for {subject_name} Class {class_level}."
        ),
        "marks": marks,
    }


class SmartPracticeSessionRequest(BaseModel):
    subject_id: int
    total_questions: int = Field(12, ge=6, le=30)
    recent_score: Optional[float] = Field(default=None, ge=0, le=100)
    weak_topics: List[str] = Field(default_factory=list)
    moderate_topics: List[str] = Field(default_factory=list)
    strong_topics: List[str] = Field(default_factory=list)


class SmartPracticeQuestionItem(BaseModel):
    question_id: int
    question_text: str
    question_type: str
    difficulty_level: str
    concept_tested: str
    feedback_status: str
    short_explanation: str
    hint_on_incorrect: str
    # MCQ: structured choices so clients do not fall back to placeholder labels.
    stem: Optional[str] = None
    options: Optional[Dict[str, str]] = None
    correct_answer: Optional[str] = None


def _alloc_counts(total: int) -> Dict[str, int]:
    weak = max(1, int(round(total * 0.60)))
    moderate = max(1, int(round(total * 0.25)))
    strong = max(1, total - weak - moderate)
    while weak + moderate + strong > total:
        if strong > 1:
            strong -= 1
        elif moderate > 1:
            moderate -= 1
        else:
            weak -= 1
    while weak + moderate + strong < total:
        weak += 1
    return {"weak": weak, "moderate": moderate, "strong": strong}


def _question_mix(total: int) -> Dict[str, int]:
    mcq = max(1, int(round(total * 0.45)))
    short = max(1, int(round(total * 0.35)))
    concept = max(1, total - mcq - short)
    while mcq + short + concept > total:
        if concept > 1:
            concept -= 1
        elif short > 1:
            short -= 1
        else:
            mcq -= 1
    while mcq + short + concept < total:
        mcq += 1
    return {"MCQ": mcq, "Short": short, "Concept": concept}


def _pick_weighted_topic(
    weak_topics: List[str],
    moderate_topics: List[str],
    strong_topics: List[str],
    fallback_pool: List[str],
) -> str:
    """
    Mix syllabus-wide practice with performance-weighted review.

    With probability ``overall_frac``, pick a random indexed textbook topic so the
    student still sees general curriculum, not only weak areas. The remainder is
    split roughly 60% weak / 25% moderate / 15% strong among performance buckets.
    """
    raw_pool = [t.strip() for t in (fallback_pool or []) if t and str(t).strip()]
    pool_clean = _clean_topic_pool(raw_pool)
    pool = pool_clean if pool_clean else raw_pool
    has_perf = bool(weak_topics or moderate_topics or strong_topics)
    overall_frac = 0.30
    if not weak_topics and has_perf:
        overall_frac = 0.40
    elif not has_perf:
        overall_frac = 1.0

    r = random.random()
    if pool and r < overall_frac:
        return random.choice(pool)

    r2 = random.random()
    if weak_topics and r2 < 0.60:
        return random.choice(weak_topics)
    if moderate_topics and r2 < 0.85:
        return random.choice(moderate_topics)
    if strong_topics:
        return random.choice(strong_topics)
    if weak_topics:
        return random.choice(weak_topics)
    if moderate_topics:
        return random.choice(moderate_topics)
    if pool:
        return random.choice(pool)
    return ""


def _question_weak_topic_score(question_text: Optional[str], weak_topics: List[str]) -> int:
    text = (question_text or "").lower()
    score = 0
    for w in weak_topics:
        wn = (w or "").strip().lower()
        if not wn:
            continue
        if wn in text:
            score += 10
            continue
        for token in re.split(r"[\s,;/]+", wn):
            tok = token.strip()
            if len(tok) >= 4 and tok in text:
                score += 2
    return score


def _order_bank_for_smart_practice(bank: List[GeneratedQuestion], weak_topics: List[str]) -> List[GeneratedQuestion]:
    if not bank:
        return bank
    if not weak_topics:
        out = list(bank)
        random.shuffle(out)
        return out
    scored = [(_question_weak_topic_score(q.question_text, weak_topics), q) for q in bank]
    scored.sort(key=lambda x: -x[0])
    high = [q for s, q in scored if s > 0]
    low = [q for s, q in scored if s == 0]
    random.shuffle(high)
    random.shuffle(low)
    return high + low


def _concept_labels_for_session(
    total: int,
    weak_topics: List[str],
    moderate_topics: List[str],
    strong_topics: List[str],
    syllabus_pool: List[str],
) -> List[str]:
    """One label per planned question slot, matching _alloc_counts weak/moderate/strong mix."""
    split = _alloc_counts(total)
    fb = [t for t in (syllabus_pool or []) if t and str(t).strip()] or ["Core concept"]
    wl = weak_topics if weak_topics else fb
    ml = moderate_topics if moderate_topics else fb
    sl = strong_topics if strong_topics else fb
    seq: List[str] = []
    for _ in range(split["weak"]):
        seq.append(random.choice(wl))
    for _ in range(split["moderate"]):
        seq.append(random.choice(ml))
    for _ in range(split["strong"]):
        seq.append(random.choice(sl))
    random.shuffle(seq)
    return seq


@router.get("/next-question")
async def get_next_question(
    subject_id: int,
    topic_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Suggest the next best question for the logged-in user based on recent performance.
    """
    subj_res = await db.execute(select(Subject).where(Subject.subject_id == subject_id))
    subject = subj_res.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    if not _is_fbise_board(subject.board):
        raise HTTPException(status_code=400, detail="Only FBISE subjects are supported for smart practice.")

    # Recent performances (last 50)
    recents = []
    if current_user is not None:
        q = (
            select(StudentPerformance)
            .where(
                StudentPerformance.user_id == current_user.user_id,
                StudentPerformance.subject_id == subject_id,
            )
            .order_by(StudentPerformance.attempted_on.desc())
            .limit(50)
        )
        if topic_name:
            q = q.where(StudentPerformance.topic_name == topic_name)

        result = await db.execute(q)
        recents = result.scalars().all()

    if recents:
        correct = sum(1 for p in recents if p.is_correct)
        recent_accuracy = (correct / len(recents)) * 100
        # Avoid lazy-loading relationship in async route (can trigger MissingGreenlet).
        last_qid = recents[0].question_id
        last_diff = "Medium"
        if last_qid:
            q_last_res = await db.execute(
                select(GeneratedQuestion.difficulty_level).where(
                    GeneratedQuestion.question_id == last_qid
                )
            )
            last_diff = q_last_res.scalar_one_or_none() or "Medium"
        target_diff = _target_difficulty(recent_accuracy, last_diff)
    else:
        recent_accuracy = 0.0
        target_diff = "Easy"

    # Build weak/moderate/strong topic buckets from student's attempted performance.
    weak_topics: List[str] = []
    moderate_topics: List[str] = []
    strong_topics: List[str] = []
    if recents:
        by_topic: Dict[str, Dict[str, int]] = {}
        for row in recents:
            t = label_for_performance_topic(row.topic_name, row.chapter_name)
            if t not in by_topic:
                by_topic[t] = {"attempts": 0, "correct": 0}
            by_topic[t]["attempts"] += 1
            if row.is_correct:
                by_topic[t]["correct"] += 1
        for t, s in by_topic.items():
            acc = (s["correct"] / max(1, s["attempts"])) * 100
            if acc < 50:
                weak_topics.append(t)
            elif acc <= 75:
                moderate_topics.append(t)
            else:
                strong_topics.append(t)

    # Generate a fresh smart-practice question each time.
    smart_topic = (topic_name or "").strip()
    t_res = await db.execute(
        select(TextbookChunk.topic_name)
        .where(
            TextbookChunk.subject_id == subject_id,
            TextbookChunk.topic_name.isnot(None),
        )
        .distinct()
        .limit(120)
    )
    topic_rows = [((r[0] or "").strip()) for r in t_res.fetchall()]
    topic_pool = [t for t in topic_rows if t]
    if not smart_topic:
        smart_topic = _pick_weighted_topic(weak_topics, moderate_topics, strong_topics, topic_pool)
    smart_topic = _refine_smart_topic_for_practice(
        smart_topic,
        topic_pool,
        subject_name=subject.subject_name,
        class_level=str(subject.class_level),
    )

    book_body = await _fetch_random_book_passages_context(db, subject_id)
    book_context: Optional[str] = None
    if book_body.strip():
        book_context = _BOOK_CONTEXT_PREFIX + book_body.strip()
    # When using random in-book passages, tell the model to anchor on excerpts, not only the focus label.
    topic_for_llm = (
        f"Textbook excerpts (practice focus hint: {smart_topic})" if book_context else smart_topic
    )

    gen_qtype, db_qtype = _pick_smart_practice_qtype()
    # Allow slow first Groq + RAG + large in-book context; client uses a longer timeout for this route.
    gen_timeout = 85.0 if gen_qtype == "long" else 75.0

    try:
        raw = await asyncio.wait_for(
            asyncio.to_thread(
                _sync_generate_smart_question,
                subject_name=subject.subject_name,
                class_level=str(subject.class_level),
                board=subject.board,
                topic_name=topic_for_llm,
                difficulty=target_diff,
                book_context=book_context,
                qtype=gen_qtype,
            ),
            timeout=gen_timeout,
        )
    except Exception:
        # Keep endpoint responsive if model/retriever is temporarily unavailable.
        raw = _fast_fallback_smart(
            subject_name=subject.subject_name,
            class_level=str(subject.class_level),
            topic_name=smart_topic,
            difficulty=target_diff,
            gen_qtype=gen_qtype,
        )

    q_text = (raw.get("question", "") or "").strip()
    if not q_text and db_qtype == "MCQ":
        q_text = (raw.get("mcq_stem") or "").strip()
    if not q_text:
        raw = _fast_fallback_smart(
            subject_name=subject.subject_name,
            class_level=str(subject.class_level),
            topic_name=smart_topic,
            difficulty=target_diff,
            gen_qtype=gen_qtype,
        )
        q_text = (raw.get("question", "") or "").strip()

    options_json: Optional[str] = None
    response_opts: Optional[Dict[str, str]] = None
    response_stem: Optional[str] = None
    if db_qtype == "MCQ":
        mo = raw.get("mcq_options")
        if isinstance(mo, dict):
            norm_opts: Dict[str, str] = {}
            for k, v in mo.items():
                ku = str(k).strip().upper()
                if ku in ("A", "B", "C", "D") and str(v).strip():
                    norm_opts[ku] = str(v).strip()
            if len(norm_opts) >= 4:
                options_json = json.dumps(norm_opts)
                response_opts = norm_opts
        response_stem = (raw.get("mcq_stem") or "").strip() or None

    try:
        marks_raw = raw.get("marks")
        marks_int = int(marks_raw) if marks_raw is not None else 0
    except (TypeError, ValueError):
        marks_int = 0
    if db_qtype == "MCQ" and marks_int < 1:
        marks_int = 1
    elif db_qtype == "Long" and marks_int < 1:
        marks_int = 8
    elif marks_int < 1:
        marks_int = 5

    _gen_top = (smart_topic or "").strip()[:200] if (smart_topic or "").strip() else None
    question = GeneratedQuestion(
        subject_id=subject.subject_id,
        question_text=q_text,
        question_type=db_qtype,
        difficulty_level=target_diff,
        options=options_json,
        correct_answer=(raw.get("answer", "") or "").strip(),
        explanation=None,
        marks=marks_int,
        is_approved="approved",
        generation_topic=_gen_top,
    )
    db.add(question)
    await db.flush()
    await db.commit()

    built = await _build_model_answer_and_explanation(
        question_text=question.question_text,
        subject_name=subject.subject_name,
        class_level=str(subject.class_level),
        topic=smart_topic,
        context_text="",
    )
    if built is None:
        model_answer = (question.correct_answer or "").strip() or "Model answer unavailable for this question right now."
        explanation = "Answer generated from smart-practice engine."
    else:
        model_answer, explanation = built

    return {
        "question_id": question.question_id,
        "question_text": question.question_text,
        "question_type": question.question_type,
        "difficulty_level": question.difficulty_level,
        "marks": question.marks or 5,
        "stem": response_stem,
        "options": response_opts,
        "correct_answer": model_answer,
        "explanation": explanation,
        "source": "generated",
    }


@router.get("/revision-plan")
async def get_revision_plan(
    subject_id: int,
    horizon_days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Build a simple multi-day revision outline from weak/strong topics and recent trend.
    """
    svc = PerformanceService(db)
    analytics = await svc.get_user_analytics(current_user.user_id, subject_id)
    weak = list(analytics.weak_topics or [])
    strong = list(analytics.strong_topics or [])
    days = max(1, min(horizon_days, 30))

    daily_focus = []
    for i, topic in enumerate(weak[:10]):
        daily_focus.append(
            {
                "day_index": i % days,
                "topic": topic,
                "priority": "high" if i < 4 else "medium",
                "suggested_practice_questions": 6 if i < 3 else 4,
                "rationale": "Below 60% accuracy in recent attempts",
            }
        )

    maintenance = [
        {"topic": t, "suggested_practice_questions": 2, "priority": "low"}
        for t in strong[:6]
    ]

    strategies = []
    if analytics.accuracy_percentage is not None and analytics.accuracy_percentage < 55:
        strategies.append("Increase easy/medium drills before hard questions.")
    if analytics.recent_trend == "declining":
        strategies.append("Shorter sessions with more frequent review may help retention.")
    if not weak:
        strategies.append("Maintain streak with mixed-topic mixed-difficulty practice.")

    return {
        "subject_id": subject_id,
        "horizon_days": days,
        "accuracy_percentage": analytics.accuracy_percentage,
        "recent_trend": analytics.recent_trend,
        "weak_topics": weak,
        "strong_topics": strong,
        "daily_focus": daily_focus,
        "maintenance_topics": maintenance,
        "strategies": strategies,
    }


@router.get("/revision-plan-whole-book")
async def get_revision_plan_whole_book(
    class_level: str = Query(..., description="Class level, e.g. 9,10,11,12"),
    horizon_days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Build a whole-book revision plan across ALL subjects in the selected class,
    using textbook topics (not only attempted-performance topics).
    """
    # Subjects for class
    s_res = await db.execute(
        select(Subject).where(Subject.class_level == class_level).order_by(Subject.subject_name.asc())
    )
    subjects = s_res.scalars().all()
    if not subjects:
        return {
            "subject_id": -1,
            "horizon_days": horizon_days,
            "accuracy_percentage": None,
            "recent_trend": "stable",
            "weak_topics": [],
            "strong_topics": [],
            "daily_focus": [],
            "maintenance_topics": [],
            "strategies": ["No subjects found for this class. Add catalog/textbook chunks first."],
        }

    # Gather unique textbook topics per subject
    topics_by_subject: dict[int, list[str]] = {}
    for s in subjects:
        t_res = await db.execute(
            select(TextbookChunk.topic_name)
            .where(
                TextbookChunk.subject_id == s.subject_id,
                TextbookChunk.topic_name.isnot(None),
            )
            .distinct()
            .order_by(TextbookChunk.topic_name.asc())
        )
        rows = t_res.fetchall()
        uniq = []
        seen = set()
        for r in rows:
            t = (r[0] or "").strip()
            if not t:
                continue
            k = t.lower()
            if k in seen:
                continue
            seen.add(k)
            uniq.append(t)
        # Fallback 1: derive topics from past-paper extracted topic labels.
        if not uniq:
            p_res = await db.execute(
                select(PastPaperQuestion.topic)
                .join(PastPaper, PastPaper.paper_id == PastPaperQuestion.paper_id)
                .where(
                    PastPaper.subject_id == s.subject_id,
                    PastPaper.is_published.is_(True),
                    PastPaperQuestion.topic.isnot(None),
                )
                .distinct()
                .order_by(PastPaperQuestion.topic.asc())
            )
            p_rows = p_res.fetchall()
            for r in p_rows:
                t = (r[0] or "").strip()
                if not t:
                    continue
                k = t.lower()
                if k in seen:
                    continue
                seen.add(k)
                uniq.append(t)

        # Fallback 2: guarantee each subject contributes to planner even with no indexed topics.
        if not uniq:
            uniq = [
                "Core concepts",
                "Important definitions",
                "Past-paper practice",
            ]
        topics_by_subject[s.subject_id] = uniq[:120]

    # Compose daily focus by round-robin over subjects/topics
    days = max(1, min(horizon_days, 30))
    daily_focus = []
    weak_topics = []
    strong_topics = []
    maintenance_topics = []

    # Choose focus topics: first ~35% topics from each subject as high-priority foundation.
    all_focus_items = []
    for s in subjects:
        topics = topics_by_subject.get(s.subject_id, [])
        if not topics:
            continue
        pivot = max(1, int(len(topics) * 0.35))
        focus = topics[:pivot]
        maintain = topics[pivot : min(len(topics), pivot + 10)]
        for t in focus:
            labeled = f"{s.subject_name}: {t}"
            weak_topics.append(labeled)
            all_focus_items.append(
                {
                    "subject": s.subject_name,
                    "topic": t,
                    "priority": "high",
                    "suggested_practice_questions": 5,
                    "rationale": "Core textbook topic from whole-book plan",
                }
            )
        for t in maintain:
            strong_topics.append(f"{s.subject_name}: {t}")
            maintenance_topics.append(
                {"topic": f"{s.subject_name}: {t}", "suggested_practice_questions": 2, "priority": "low"}
            )

    for i, item in enumerate(all_focus_items):
        daily_focus.append(
            {
                "day_index": i % days,
                "topic": f"{item['subject']}: {item['topic']}",
                "priority": item["priority"],
                "suggested_practice_questions": item["suggested_practice_questions"],
                "rationale": item["rationale"],
            }
        )

    strategies = [
        "Cover foundation topics first across all subjects, then move to mixed-topic practice.",
        "Use spaced revision: revisit each subject topic within 2-3 days.",
        "After completing daily plan, attempt a mixed mini-test for retention.",
    ]

    return {
        "subject_id": -1,
        "horizon_days": days,
        "accuracy_percentage": None,
        "recent_trend": "stable",
        "weak_topics": weak_topics[:80],
        "strong_topics": strong_topics[:80],
        "daily_focus": daily_focus,
        "maintenance_topics": maintenance_topics[:120],
        "strategies": strategies,
    }


@router.post("/smart-practice-session")
async def build_smart_practice_session(
    req: SmartPracticeSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Build a structured, adaptive smart-practice session plan.
    """
    subj_res = await db.execute(select(Subject).where(Subject.subject_id == req.subject_id))
    subject = subj_res.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    if not _is_fbise_board(subject.board):
        raise HTTPException(status_code=400, detail="Only FBISE subjects are supported for smart practice.")

    # Build topic buckets from user performance if client did not pass them.
    perf_res = await db.execute(
        select(StudentPerformance).where(
            StudentPerformance.user_id == current_user.user_id,
            StudentPerformance.subject_id == req.subject_id,
        )
    )
    perf_rows = perf_res.scalars().all()
    by_topic: Dict[str, Dict[str, int]] = {}
    total_attempts = len(perf_rows)
    total_mistakes = 0
    for r in perf_rows:
        t = label_for_performance_topic(r.topic_name, r.chapter_name)
        if t not in by_topic:
            by_topic[t] = {"attempts": 0, "correct": 0}
        by_topic[t]["attempts"] += 1
        if r.is_correct:
            by_topic[t]["correct"] += 1
        else:
            total_mistakes += 1

    weak_topics = list(req.weak_topics)
    moderate_topics = list(req.moderate_topics)
    strong_topics = list(req.strong_topics)
    if not (weak_topics or moderate_topics or strong_topics):
        for topic, s in by_topic.items():
            acc = (s["correct"] / s["attempts"]) * 100 if s["attempts"] else 0
            if acc < 50:
                weak_topics.append(topic)
            elif acc <= 75:
                moderate_topics.append(topic)
            else:
                strong_topics.append(topic)

    if not weak_topics and by_topic:
        # Always keep at least one focus topic.
        sorted_topics = sorted(
            by_topic.items(),
            key=lambda kv: (kv[1]["correct"] / max(kv[1]["attempts"], 1)),
        )
        weak_topics = [sorted_topics[0][0]]

    recent_score = req.recent_score
    if recent_score is None:
        if total_attempts:
            recent_score = (
                sum(1 for r in perf_rows if r.is_correct) / max(total_attempts, 1)
            ) * 100
        else:
            recent_score = 0.0
    failed = recent_score < 50
    difficulty_flow = "Easy -> Medium" if failed else "Medium -> Hard"
    practice_goal = (
        "Improve weak topics and reinforce core concepts before re-attempting the test."
        if failed
        else "Consolidate performance and push accuracy with challenge-level practice."
    )

    split = _alloc_counts(req.total_questions)
    mix = _question_mix(req.total_questions)

    t_res = await db.execute(
        select(TextbookChunk.topic_name)
        .where(
            TextbookChunk.subject_id == req.subject_id,
            TextbookChunk.topic_name.isnot(None),
        )
        .distinct()
        .limit(120)
    )
    syllabus_pool = [((r[0] or "").strip()) for r in t_res.fetchall() if ((r[0] or "").strip())]

    # Pull approved subject questions and map to adaptive session.
    q_res = await db.execute(
        select(GeneratedQuestion).where(
            GeneratedQuestion.subject_id == req.subject_id,
            or_(
                GeneratedQuestion.is_approved == "approved",
                GeneratedQuestion.is_approved.is_(None),
            ),
        )
    )
    from app.services.generator import coalesce_mcq_for_client_response

    bank = q_res.scalars().all()
    bank = _order_bank_for_smart_practice(list(bank), weak_topics)

    # Build lightweight latest correctness map for "instant feedback" status.
    latest_perf_by_qid: Dict[int, bool] = {}
    for row in perf_rows:
        if row.question_id and row.question_id not in latest_perf_by_qid:
            latest_perf_by_qid[row.question_id] = bool(row.is_correct)

    # Assemble balanced question list from the bank.
    questions: List[SmartPracticeQuestionItem] = []
    concept_labels = _concept_labels_for_session(
        req.total_questions,
        weak_topics,
        moderate_topics,
        strong_topics,
        syllabus_pool,
    )

    type_need = {"MCQ": mix["MCQ"], "Short": mix["Short"], "Concept": mix["Concept"]}
    for q in bank:
        qt = (q.question_type or "Short").strip().lower()
        bucket = "MCQ" if qt == "mcq" else "Short"
        if type_need.get(bucket, 0) <= 0 and type_need.get("Concept", 0) <= 0:
            continue
        if bucket == "MCQ" and type_need["MCQ"] <= 0:
            continue
        if bucket == "Short" and type_need["Short"] <= 0 and type_need["Concept"] <= 0:
            continue

        concept = concept_labels[len(questions)] if len(questions) < len(concept_labels) else random.choice(
            weak_topics or moderate_topics or strong_topics or syllabus_pool or ["Core concept"]
        )
        status = "correct" if latest_perf_by_qid.get(q.question_id) else "needs_practice"
        explanation = (q.explanation or q.correct_answer or "Review core concept and method.").strip()
        qt_row = (q.question_type or "Short").strip()
        mcq_pack: Dict[str, Any] = {}
        if qt_row.lower() == "mcq":
            mcq_pack = coalesce_mcq_for_client_response(
                q.question_text or "",
                q.options,
                (q.correct_answer or "").strip() or None,
            )
        questions.append(
            SmartPracticeQuestionItem(
                question_id=q.question_id,
                question_text=(q.question_text or "").strip(),
                question_type=q.question_type or "Short",
                difficulty_level=q.difficulty_level or ("Easy" if failed else "Medium"),
                concept_tested=concept,
                feedback_status=status,
                short_explanation=explanation[:180],
                hint_on_incorrect="Re-read the concept, solve step-by-step, and retry a similar question.",
                stem=mcq_pack.get("stem"),
                options=mcq_pack.get("options"),
                correct_answer=mcq_pack.get("correct_answer"),
            )
        )
        if bucket == "MCQ":
            type_need["MCQ"] -= 1
        elif type_need["Short"] > 0:
            type_need["Short"] -= 1
        else:
            type_need["Concept"] -= 1
        if len(questions) >= req.total_questions:
            break

    improved_topics = min(max(len(strong_topics), 0), 2)
    weak_remaining = len(weak_topics)

    feedback_loop = (
        [
            "Step 1: Start with concept-reinforcement questions (easy level).",
            "Step 2: Gradually increase difficulty.",
            "Step 3: Provide hints for incorrect answers.",
            "Step 4: After practice, re-attempt a new test (adaptive: easy -> medium).",
            "You need to reattempt after practice to improve your performance.",
        ]
        if failed
        else [
            "Focus on improving moderate and weak topics first.",
            "Include challenge questions after stable medium-level accuracy.",
            "Use optional timed practice blocks for exam stamina.",
        ]
    )

    next_step = (
        "Reattempt test"
        if failed
        else (
            "Continue practice on specific topic"
            if weak_remaining > 0
            else "Reattempt test"
        )
    )

    return {
        "practice_goal": practice_goal,
        "performance_context": {
            "recent_score": round(float(recent_score), 1),
            "attempts": total_attempts,
            "mistakes": total_mistakes,
            "difficulty_flow": difficulty_flow,
        },
        "topic_prioritization": {
            "weak_topics": weak_topics,
            "moderate_topics": moderate_topics,
            "strong_topics": strong_topics,
            "distribution": {
                "weak": "60%",
                "moderate": "25%",
                "strong": "15%",
                "syllabus_exploration": "~30% of next-question picks from full textbook topic index",
                "performance_weighted": {"weak": "60%", "moderate": "25%", "strong": "15%"},
            },
            "question_counts": split,
            "session_bank_ordering": "Questions whose text matches weak-topic keywords appear earlier in the list.",
        },
        "question_generation": {
            "mix": {
                "mcq": mix["MCQ"],
                "short": mix["Short"],
                "concept_based": mix["Concept"],
            },
            "syllabus_alignment": f"{subject.board} Class {subject.class_level} - {subject.subject_name}",
            "adaptive_difficulty": difficulty_flow,
            "questions": [q.model_dump() for q in questions],
        },
        "adaptive_practice_flow": feedback_loop,
        "weak_topic_reinforcement": {
            "improved_topics_count": improved_topics,
            "still_need_attention": weak_topics[:5],
        },
        "next_best_actions": [
            f"Practice at least {max(6, split['weak'])} questions from weak topics.",
            "Review notes/formulas for the two weakest concepts before next session.",
            "Complete one timed mini-quiz and analyze mistakes immediately.",
            "Track incorrect attempts and retry those concepts within 24 hours.",
        ],
        "next_step_recommendation": next_step,
        "engagement": {
            "progress_indicator": f"You improved in {improved_topics} topics.",
            "encouragement": "Keep going - consistent focused practice will raise your score.",
        },
    }

