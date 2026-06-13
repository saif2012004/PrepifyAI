"""Feature toggle for AI question generation (Groq + RAG pipeline)."""

from app.core.config import settings

DISABLED_MESSAGE = "Feature disabled temporarily."


def is_question_generation_enabled() -> bool:
    """When false, routes return empty payloads with ``feature_disabled_notice``; no LLM/RAG runs."""
    return bool(getattr(settings, "QUESTION_GENERATION_ENABLED", False))
