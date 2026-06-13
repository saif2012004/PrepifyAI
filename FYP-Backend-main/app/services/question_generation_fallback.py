"""Legacy module: timeout stub questions were removed (API returns 504; jobs fail with error)."""

from __future__ import annotations

from typing import Any

from app.schemas.question_schema import GeneratedQuestionsResponse, QuestionRequest, RetrievalSourceItem


def build_timeout_fallback_response(
    req: QuestionRequest,
    normalized_topic: str,
    prebuilt_sources: list[dict[str, Any]] | None,
    effective_timeout_sec: int,
) -> GeneratedQuestionsResponse:
    """Backward-compatible name only — returns no placeholder questions."""
    rs_items: list[RetrievalSourceItem] = []
    if prebuilt_sources:
        for s in prebuilt_sources:
            if isinstance(s, dict):
                try:
                    rs_items.append(RetrievalSourceItem(**s))
                except Exception:
                    continue
    return GeneratedQuestionsResponse(
        questions=[],
        retrieval_sources=rs_items,
        generation_fallback_notice=(
            f"Generation exceeded {effective_timeout_sec}s; no stub questions are returned. "
            "Retry with a higher QUESTION_GENERATION_HARD_CAP_SEC or use POST /questions/generation-jobs/."
        ),
    )
