from app.services.performance_service import PerformanceService


def test_short_score_partial():
    svc = PerformanceService(db=None)  # db not needed for pure scoring helpers
    score = svc._short_score("ATP and NADPH are produced", "ATP is produced")
    assert score > 0.0
    assert score <= 100.0


def test_short_score_empty():
    svc = PerformanceService(db=None)
    assert svc._short_score("Some correct answer", "") == 0.0

