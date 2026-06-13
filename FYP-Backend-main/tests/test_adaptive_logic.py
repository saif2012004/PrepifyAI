from app.routes.adaptive import _target_difficulty


def test_target_difficulty_increase():
    assert _target_difficulty(85.0, "Easy") == "Medium"
    assert _target_difficulty(90.0, "Medium") == "Hard"


def test_target_difficulty_decrease():
    assert _target_difficulty(30.0, "Hard") == "Medium"
    assert _target_difficulty(40.0, "Medium") == "Easy"


def test_target_difficulty_stable():
    assert _target_difficulty(65.0, "Medium") == "Medium"
    assert _target_difficulty(79.9, "Easy") == "Easy"

