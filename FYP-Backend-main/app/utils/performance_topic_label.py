"""
Display labels for student performance rows when ``topic_name`` was not stored.
"""

from typing import Any, Optional, Tuple

DEFAULT_PRACTICE_TOPIC_LABEL = "General syllabus practice"


def topic_chapter_from_generated_question(question: Any) -> Tuple[Optional[str], Optional[str]]:
    """
    Prefer linked textbook chunks; else ``generation_topic`` from the question row (Groq /q pipeline, adaptive).
    Returns (topic_name, chapter_name) for StudentPerformance / aggregates.
    """
    chunks = list(getattr(question, "source_chunks", None) or [])
    for ch in chunks:
        tn = (getattr(ch, "topic_name", None) or "").strip()
        if tn:
            cn = (getattr(ch, "chapter_name", None) or "").strip() or None
            return (tn[:200], (cn[:200] if cn else None))
    gen = (getattr(question, "generation_topic", None) or "").strip()
    if gen:
        return (gen[:200], None)
    return (None, None)


def label_for_performance_topic(
    topic_name: str | None,
    chapter_name: str | None = None,
) -> str:
    """
    Prefer stored topic; else chapter title; else a clear syllabus-wide bucket (never the literal "Unknown").
    """
    t = (topic_name or "").strip()
    if t:
        return t
    c = (chapter_name or "").strip()
    if c:
        return c
    return DEFAULT_PRACTICE_TOPIC_LABEL
