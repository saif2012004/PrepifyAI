import pytest
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.past_paper_question import (
    get_all_past_paper_questions,
    get_past_paper_question_by_id,
    update_past_paper_question,
    delete_past_paper_question,
)
from app.schemas.past_paper_question import PastPaperQuestionUpdate
from app.models.past_paper_question import PastPaperQuestion
from app.core.embedding_storage import embedding_from_storage_format
import json


@pytest.fixture
def mock_db():
    """Fixture to mock AsyncSession"""
    db = AsyncMock(spec=AsyncSession)
    return db


# Removed test_add_past_paper_question - POST endpoint no longer exists
# Questions are now created only through PDF upload


@pytest.mark.asyncio
async def test_get_all_past_paper_questions(mock_db):
    """Test getting all past paper questions"""
    mock_questions = [
        PastPaperQuestion(
            question_id=1,
            paper_id=1,
            source_chunk_id=1,
            question_text="Question 1",
            question_type="MCQ",
            embedding=json.dumps([0.1, 0.2]),
            topic="Topic1",
            marks=5.0
        ),
        PastPaperQuestion(
            question_id=2,
            paper_id=1,
            source_chunk_id=2,
            question_text="Question 2",
            question_type="Short",
            embedding=json.dumps([0.3, 0.4]),
            topic="Topic2",
            marks=10.0
        )
    ]

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = mock_questions
    mock_db.execute.return_value = mock_result

    result = await get_all_past_paper_questions(mock_db)

    assert len(result) == 2
    assert result == mock_questions


@pytest.mark.asyncio
async def test_get_past_paper_question_by_id(mock_db):
    """Test getting past paper question by ID"""
    question_id = 1
    mock_question = PastPaperQuestion(
        question_id=question_id,
        paper_id=1,
        source_chunk_id=1,
        question_text="Question 1",
        question_type="MCQ",
        embedding=json.dumps([0.1, 0.2]),
        topic="Topic1",
        marks=5.0
    )

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_question
    mock_db.execute.return_value = mock_result

    result = await get_past_paper_question_by_id(mock_db, question_id)

    assert result == mock_question


@pytest.mark.asyncio
async def test_get_past_paper_question_by_id_not_found(mock_db):
    """Test getting past paper question by ID when not found"""
    question_id = 999

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    result = await get_past_paper_question_by_id(mock_db, question_id)

    assert result is None


@pytest.mark.asyncio
async def test_update_past_paper_question(mock_db):
    """Test updating a past paper question"""
    question_id = 1
    updates = PastPaperQuestionUpdate(
        question_text="Updated Question",
        question_type="Short",
        embedding=[0.5, 0.6],
        topic="Updated Topic",
        marks=15.0
    )

    mock_question = PastPaperQuestion(
        question_id=question_id,
        paper_id=1,
        source_chunk_id=1,
        question_text="Old Question",
        question_type="MCQ",
        embedding=json.dumps([0.1, 0.2]),
        topic="Old Topic",
        marks=5.0
    )

    # Mock the execute result for select
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_question
    mock_db.execute.return_value = mock_result

    # Mock commit and refresh
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    result = await update_past_paper_question(mock_db, question_id, updates)

    assert result.question_text == "Updated Question"
    assert result.question_type == "Short"
    # Storage may be pgvector list or JSON ``{"values": [...]}`` depending on USE_PGVECTOR
    assert embedding_from_storage_format(result.embedding) == [0.5, 0.6]
    assert result.topic == "Updated Topic"
    assert result.marks == 15.0
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once()


@pytest.mark.asyncio
async def test_update_past_paper_question_not_found(mock_db):
    """Test updating a past paper question that doesn't exist"""
    question_id = 999
    updates = PastPaperQuestionUpdate(question_text="Updated")

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    result = await update_past_paper_question(mock_db, question_id, updates)

    assert result is None


@pytest.mark.asyncio
async def test_delete_past_paper_question(mock_db):
    """Test deleting a past paper question"""
    question_id = 1
    mock_question = PastPaperQuestion(
        question_id=question_id,
        paper_id=1,
        source_chunk_id=1,
        question_text="Question 1",
        question_type="MCQ",
        embedding=json.dumps([0.1, 0.2]),
        topic="Topic1",
        marks=5.0
    )

    # Mock the execute result for select
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_question
    mock_db.execute.return_value = mock_result

    # Mock delete and commit
    mock_db.delete = AsyncMock()
    mock_db.commit = AsyncMock()

    result = await delete_past_paper_question(mock_db, question_id)

    assert result == mock_question
    mock_db.delete.assert_called_once_with(mock_question)
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_delete_past_paper_question_not_found(mock_db):
    """Test deleting a past paper question that doesn't exist"""
    question_id = 999

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    result = await delete_past_paper_question(mock_db, question_id)

    assert result is None
