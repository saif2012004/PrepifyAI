from app.services.gamification_service import compute_xp_for_attempt, level_from_xp


def test_level_from_xp():
    assert level_from_xp(0) == 1
    assert level_from_xp(249) == 1
    assert level_from_xp(250) == 2
    assert level_from_xp(500) == 3


def test_compute_xp_mcq_correct():
    xp = compute_xp_for_attempt(
        question_type="MCQ",
        is_correct=True,
        score_percentage=100.0,
        time_taken=10,
    )
    assert xp >= 20


def test_compute_xp_short_partial():
    xp = compute_xp_for_attempt(
        question_type="Short",
        is_correct=False,
        score_percentage=40.0,
        time_taken=None,
    )
    assert xp >= 1
