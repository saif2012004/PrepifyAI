"""Tests for predictability evaluation (mocked DB + TopicPredictionService)."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.past_paper import PastPaper
from app.services import prediction_accuracy_service as pas


def test_topics_match_exact_and_fuzzy():
    assert pas._topics_match("Photosynthesis", "photosynthesis  ")
    assert pas._topics_match("Linear Equations", "linear equations")
    assert not pas._topics_match("", "x")
    assert not pas._topics_match("A", "B")


def test_precision_recall_f1_perfect_overlap():
    f = {"a", "b"}
    a = {"a", "b"}
    inter = {"a", "b"}
    p, r, f1 = pas._precision_recall_f1(f, a, inter)
    assert p == 1.0 and r == 1.0 and f1 == 1.0


def test_precision_recall_f1_empty_both():
    p, r, f1 = pas._precision_recall_f1(set(), set(), set())
    assert p == 1.0 and r == 1.0 and f1 == 1.0


def test_precision_recall_f1_partial():
    f = {"a", "b", "c"}
    a = {"a", "d"}
    inter = {"a"}
    p, r, f1 = pas._precision_recall_f1(f, a, inter)
    assert p == pytest.approx(1 / 3)
    assert r == pytest.approx(0.5)
    assert 0 < f1 < 1


def test_intersection_fuzzy_matches_near_duplicate():
    forecast = {"Algebra Basics"}
    actual = {"algebra basics"}
    inter = pas._intersection_fuzzy(forecast, actual)
    assert inter == {"Algebra Basics"}


@pytest.mark.asyncio
async def test_evaluate_paper_not_found():
    mock_db = AsyncMock()
    r1 = MagicMock()
    r1.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=r1)
    mock_svc = MagicMock()
    with pytest.raises(ValueError, match="Past paper not found"):
        await pas.evaluate_paper_vs_historical_forecast(
            mock_db, mock_svc, paper_id=999, class_level="9"
        )


@pytest.mark.asyncio
async def test_evaluate_success_writes_predictions():
    target = PastPaper(paper_id=10, subject_id=5, year=2024, board="FBISE")

    r_target = MagicMock()
    r_target.scalar_one_or_none.return_value = target

    r_hist_ids = MagicMock()
    r_hist_ids.fetchall.return_value = [(1,)]

    r_topics = MagicMock()
    r_topics.fetchall.return_value = [("Algebra",), ("Geometry",)]

    r_hist_q = MagicMock()
    r_hist_q.fetchall.return_value = [
        ("What is a linear equation?",),
        ("Define a triangle.",),
    ]

    r_act_q = MagicMock()
    r_act_q.fetchall.return_value = [("Solve quadratic by formula.",)]

    r_delete = MagicMock()

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(
        side_effect=[r_target, r_hist_ids, r_topics, r_hist_q, r_act_q, r_delete]
    )
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    class MockPredSvc:
        models: dict = {}

        def is_ready(self) -> bool:
            return False

        def batch_predict_topics(
            self,
            questions,
            class_level,
            top_k=5,
            confidence_threshold=0.1,
            topic_candidates=None,
        ):
            out = []
            for _ in questions:
                out.append(
                    [
                        {"topic_name": "Algebra", "confidence": 0.85},
                        {"topic_name": "Geometry", "confidence": 0.2},
                    ]
                )
            return out

    meta = await pas.evaluate_paper_vs_historical_forecast(
        mock_db, MockPredSvc(), paper_id=10, class_level="9", top_n_forecast=10, top_n_actual=10
    )

    assert meta["exam_year"] == 2024
    assert meta["subject_id"] == 5
    assert meta["target_paper_id"] == 10
    assert meta["historical_paper_count"] == 1
    assert "f1" in meta and meta["f1"] >= 0.0
    assert mock_db.execute.await_count == 6  # target, hist ids, topics, hist q, actual q, delete
    mock_db.add.assert_called()
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_evaluate_no_historical_papers():
    target = PastPaper(paper_id=10, subject_id=5, year=2024, board="FBISE")
    r_target = MagicMock()
    r_target.scalar_one_or_none.return_value = target
    r_hist_ids = MagicMock()
    r_hist_ids.fetchall.return_value = []

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(side_effect=[r_target, r_hist_ids])

    with pytest.raises(ValueError, match="No older past papers"):
        await pas.evaluate_paper_vs_historical_forecast(
            mock_db, MagicMock(), paper_id=10, class_level="9"
        )


@pytest.mark.asyncio
async def test_list_accuracy_runs_dedupes_by_subject_year():
    t = datetime.now(timezone.utc)
    row_a = MagicMock()
    row_a.subject_id = 1
    row_a.exam_year = 2024
    row_a.predictability_score = 0.75
    row_a.created_at = t
    row_a.bertopic_metadata = {"precision": 0.6, "recall": 0.9, "f1": 0.72}

    row_b = MagicMock()
    row_b.subject_id = 1
    row_b.exam_year = 2024
    row_b.predictability_score = 0.75
    row_b.created_at = t
    row_b.bertopic_metadata = {"precision": 0.6}

    r = MagicMock()
    r.scalars.return_value.all.return_value = [row_a, row_b]

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=r)

    items = await pas.list_accuracy_runs(mock_db, subject_id=1, limit=10)
    assert len(items) == 1
    assert items[0]["subject_id"] == 1
    assert items[0]["exam_year"] == 2024
    assert items[0]["precision"] == 0.6
