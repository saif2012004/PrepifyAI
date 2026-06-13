import pytest
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.performance_service import PerformanceService
from app.schemas.student_performance import PerformanceCreate, PerformanceAnalytics
from app.schemas.generated_question import QuestionAnswerSubmission, QuestionAnswerResponse
from app.models.student_performance import StudentPerformance
from app.models.generated_question import GeneratedQuestion
from datetime import datetime, timezone


@pytest.fixture
def mock_db():
    """Fixture to mock AsyncSession"""
    db = AsyncMock(spec=AsyncSession)
    return db


@pytest.fixture
def performance_service(mock_db):
    """Fixture to create PerformanceService with mocked db"""
    return PerformanceService(mock_db)


@pytest.mark.asyncio
async def test_record_performance(performance_service, mock_db):
    """Test recording performance"""
    performance_data = PerformanceCreate(
        user_id=1,
        subject_id=1,
        question_id=1,
        user_answer="Answer",
        is_correct=True,
        time_taken=10.0,
        score_percentage=100.0
    )

    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    # Mock the returned performance after refresh
    mock_performance = StudentPerformance(**performance_data.model_dump())
    mock_db.refresh.side_effect = lambda obj: setattr(obj, 'performance_id', 1)

    result = await performance_service.record_performance(performance_data)

    assert result.user_id == performance_data.user_id
    assert result.subject_id == performance_data.subject_id
    assert result.question_id == performance_data.question_id
    assert result.is_correct == performance_data.is_correct
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once()


@pytest.mark.asyncio
async def test_evaluate_answer_correct_mcq(performance_service, mock_db):
    """Test evaluating correct MCQ answer"""
    user_id = 1
    answer_submission = QuestionAnswerSubmission(
        question_id=1,
        user_answer="A",
        time_taken=5.0
    )

    mock_question = GeneratedQuestion(
        question_id=1,
        subject_id=1,
        correct_answer="A",
        question_type="MCQ",
        explanation="Correct"
    )

    # Mock db.execute for question
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_question
    mock_db.execute.return_value = mock_result

    # Mock record_performance
    performance_service.record_performance = AsyncMock()

    result = await performance_service.evaluate_answer(user_id, answer_submission)

    assert result.is_correct is True
    assert result.score_percentage == 100.0
    assert result.explanation == "Correct"
    assert result.correct_answer == "A"
    performance_service.record_performance.assert_called_once()


@pytest.mark.asyncio
async def test_evaluate_answer_incorrect_mcq(performance_service, mock_db):
    """Test evaluating incorrect MCQ answer"""
    user_id = 1
    answer_submission = QuestionAnswerSubmission(
        question_id=1,
        user_answer="B",
        time_taken=5.0
    )

    mock_question = GeneratedQuestion(
        question_id=1,
        subject_id=1,
        correct_answer="A",
        question_type="MCQ",
        explanation="Incorrect"
    )

    # Mock db.execute for question
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_question
    mock_db.execute.return_value = mock_result

    # Mock record_performance
    performance_service.record_performance = AsyncMock()

    result = await performance_service.evaluate_answer(user_id, answer_submission)

    assert result.is_correct is False
    assert result.score_percentage == 0.0
    performance_service.record_performance.assert_called_once()


@pytest.mark.asyncio
async def test_evaluate_answer_short_question(performance_service, mock_db):
    """Test evaluating short question answer"""
    user_id = 1
    answer_submission = QuestionAnswerSubmission(
        question_id=1,
        user_answer="The answer is correct",
        time_taken=10.0
    )

    mock_question = GeneratedQuestion(
        question_id=1,
        subject_id=1,
        correct_answer="correct",
        question_type="Short",
        explanation="Good"
    )

    # Mock db.execute for question
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_question
    mock_db.execute.return_value = mock_result

    # Mock record_performance
    performance_service.record_performance = AsyncMock()

    result = await performance_service.evaluate_answer(user_id, answer_submission)

    assert result.is_correct is True  # Since "correct" is in "The answer is correct"
    assert result.score_percentage == 100.0
    performance_service.record_performance.assert_called_once()


@pytest.mark.asyncio
async def test_evaluate_answer_long_question_uses_partial_credit(performance_service, mock_db):
    """Long answers use the same semantic partial-credit path as Short."""
    user_id = 1
    answer_submission = QuestionAnswerSubmission(
        question_id=1,
        user_answer="The answer is correct",
        time_taken=10.0,
    )

    mock_question = GeneratedQuestion(
        question_id=1,
        subject_id=1,
        correct_answer="correct",
        question_type="Long",
        explanation="Good",
    )

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_question
    mock_db.execute.return_value = mock_result

    performance_service.record_performance = AsyncMock()

    result = await performance_service.evaluate_answer(user_id, answer_submission)

    assert result.is_correct is True
    assert result.score_percentage == 100.0
    performance_service.record_performance.assert_called_once()


@pytest.mark.asyncio
async def test_evaluate_answer_question_not_found(performance_service, mock_db):
    """Test evaluating answer when question not found"""
    user_id = 1
    answer_submission = QuestionAnswerSubmission(
        question_id=999,
        user_answer="Answer",
        time_taken=5.0
    )

    # Mock db.execute for question
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    with pytest.raises(ValueError, match="Question not found"):
        await performance_service.evaluate_answer(user_id, answer_submission)


@pytest.mark.asyncio
async def test_get_user_analytics_with_performances(performance_service, mock_db):
    """Test getting user analytics with performances"""
    user_id = 1
    mock_performances = [
        StudentPerformance(
            performance_id=1,
            user_id=user_id,
            subject_id=1,
            question_id=1,
            user_answer="A",
            is_correct=True,
            time_taken=10.0,
            score_percentage=100.0,
            attempted_on=datetime.now(timezone.utc),
            topic_name="Topic1"
        ),
        StudentPerformance(
            performance_id=2,
            user_id=user_id,
            subject_id=1,
            question_id=2,
            user_answer="B",
            is_correct=False,
            time_taken=15.0,
            score_percentage=0.0,
            attempted_on=datetime.now(timezone.utc),
            topic_name="Topic2"
        )
    ]

    # Mock db.execute
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = mock_performances
    mock_db.execute.return_value = mock_result

    result = await performance_service.get_user_analytics(user_id)

    assert result.total_attempts == 2
    assert result.correct_answers == 1
    assert result.accuracy_percentage == 50.0
    assert result.average_time == 12.5
    assert "Topic1" in result.strong_topics
    assert "Topic2" in result.weak_topics
    assert result.subject_wise_performance == {"1": 50.0}


@pytest.mark.asyncio
async def test_get_user_analytics_no_performances(performance_service, mock_db):
    """Test getting user analytics with no performances"""
    user_id = 1

    # Mock db.execute
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    result = await performance_service.get_user_analytics(user_id)

    assert result.total_attempts == 0
    assert result.correct_answers == 0
    assert result.accuracy_percentage == 0.0
    assert result.strong_topics == []
    assert result.weak_topics == []
    assert result.subject_wise_performance == {}


@pytest.mark.asyncio
async def test_get_user_performance_history(performance_service, mock_db):
    """Test getting user performance history"""
    user_id = 1
    days = 30

    mock_performances = [
        StudentPerformance(
            performance_id=1,
            user_id=user_id,
            subject_id=1,
            question_id=1,
            user_answer="A",
            is_correct=True,
            time_taken=10.0,
            score_percentage=100.0,
            attempted_on=datetime.now(timezone.utc),
        )
    ]

    # Mock db.execute
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = mock_performances
    mock_db.execute.return_value = mock_result

    result = await performance_service.get_user_performance_history(user_id, days=days)

    assert len(result) == 1
    assert result[0].user_id == user_id
