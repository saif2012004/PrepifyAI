import pytest
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.past_paper import PastPaperService
from app.schemas.past_paper import PastPaperUpdate
from app.models.past_paper import PastPaper
from app.models.past_paper_question import PastPaperQuestion


@pytest.fixture
def mock_db():
    """Fixture to mock AsyncSession"""
    db = AsyncMock(spec=AsyncSession)
    return db


@pytest.mark.asyncio
async def test_get_all_past_papers(mock_db):
    """Test getting all past papers"""
    mock_papers = [
        PastPaper(paper_id=1, subject_id=1, year=2023, board="FBISE"),
        PastPaper(paper_id=2, subject_id=1, year=2022, board="FBISE")
    ]

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalars.return_value.unique.return_value.all.return_value = mock_papers
    mock_db.execute.return_value = mock_result

    result = await PastPaperService.get_all_past_papers(mock_db)

    assert len(result) == 2
    assert result == mock_papers


@pytest.mark.asyncio
async def test_get_all_past_papers_with_filters(mock_db):
    """Test getting all past papers with subject and year filters"""
    subject_id = 1
    year = 2023

    mock_papers = [
        PastPaper(paper_id=1, subject_id=subject_id, year=year, board="FBISE")
    ]

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalars.return_value.unique.return_value.all.return_value = mock_papers
    mock_db.execute.return_value = mock_result

    result = await PastPaperService.get_all_past_papers(mock_db, subject_id=subject_id, year=year)

    assert len(result) == 1
    assert result[0].subject_id == subject_id
    assert result[0].year == year


@pytest.mark.asyncio
async def test_get_past_paper_by_id(mock_db):
    """Test getting past paper by ID"""
    paper_id = 1
    mock_paper = PastPaper(paper_id=paper_id, subject_id=1, year=2023, board="FBISE")

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_paper
    mock_db.execute.return_value = mock_result

    result = await PastPaperService.get_past_paper_by_id(mock_db, paper_id)

    assert result == mock_paper


@pytest.mark.asyncio
async def test_get_past_paper_by_id_not_found(mock_db):
    """Test getting past paper by ID when not found"""
    paper_id = 999

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    result = await PastPaperService.get_past_paper_by_id(mock_db, paper_id)

    assert result is None


@pytest.mark.asyncio
async def test_update_past_paper(mock_db):
    """Test updating a past paper"""
    paper_id = 1
    updates = PastPaperUpdate(year=2024, board="Updated Board")

    mock_paper = PastPaper(paper_id=paper_id, subject_id=1, year=2023, board="FBISE")

    # Mock the execute result for select
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_paper
    mock_db.execute.return_value = mock_result

    # Mock commit and refresh
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    result = await PastPaperService.update_past_paper(mock_db, paper_id, updates)

    assert result.year == 2024
    assert result.board == "Updated Board"
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once()


@pytest.mark.asyncio
async def test_update_past_paper_not_found(mock_db):
    """Test updating a past paper that doesn't exist"""
    paper_id = 999
    updates = PastPaperUpdate(year=2024)

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    result = await PastPaperService.update_past_paper(mock_db, paper_id, updates)

    assert result is None


@pytest.mark.asyncio
async def test_delete_past_paper(mock_db):
    """Test deleting a past paper"""
    paper_id = 1
    mock_paper = PastPaper(paper_id=paper_id, subject_id=1, year=2023, board="FBISE")

    mock_result_select = MagicMock()
    mock_result_select.scalar_one_or_none.return_value = mock_paper
    mock_db.execute = AsyncMock(
        side_effect=[
            mock_result_select,
            MagicMock(),
            MagicMock(),
            MagicMock(),
        ]
    )
    mock_db.commit = AsyncMock()

    result = await PastPaperService.delete_past_paper(mock_db, paper_id)

    assert result is True
    assert mock_db.execute.await_count == 4
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_delete_past_paper_not_found(mock_db):
    """Test deleting a past paper that doesn't exist"""
    paper_id = 999

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    result = await PastPaperService.delete_past_paper(mock_db, paper_id)

    assert result is False


@pytest.mark.asyncio
async def test_get_paper_statistics(mock_db):
    """Test getting paper statistics"""
    paper_id = 1
    mock_paper = PastPaper(paper_id=paper_id, subject_id=1, year=2023, board="FBISE")

    mock_questions = [
        PastPaperQuestion(question_id=1, paper_id=paper_id, question_type="MCQ", marks=2.0, topic="Topic1"),
        PastPaperQuestion(question_id=2, paper_id=paper_id, question_type="Short", marks=5.0, topic="Topic2"),
        PastPaperQuestion(question_id=3, paper_id=paper_id, question_type="MCQ", marks=2.0, topic=None)
    ]

    # Mock the execute result for paper select
    mock_paper_result = MagicMock()
    mock_paper_result.scalar_one_or_none.return_value = mock_paper
    mock_db.execute.side_effect = [mock_paper_result, MagicMock()]  # First for paper, second for questions

    # Mock the execute result for questions select
    mock_qs_result = MagicMock()
    mock_qs_result.scalars.return_value.all.return_value = mock_questions
    mock_db.execute.side_effect = [mock_paper_result, mock_qs_result]

    result = await PastPaperService.get_paper_statistics(mock_db, paper_id)

    assert result["paper_id"] == paper_id
    assert result["total_questions"] == 3
    assert result["total_marks"] == 9.0
    assert result["average_marks_per_question"] == 3.0
    assert result["questions_by_type"]["MCQ"] == 2
    assert result["questions_by_type"]["Short"] == 1
    assert result["total_topics"] == 2
    assert result["questions_with_topics"] == 2
    assert result["questions_without_topics"] == 1


@pytest.mark.asyncio
async def test_get_topic_distribution(mock_db):
    """Test getting topic distribution"""
    subject_id = 1
    mock_papers = [
        PastPaper(paper_id=1, subject_id=subject_id, year=2023, board="FBISE"),
        PastPaper(paper_id=2, subject_id=subject_id, year=2022, board="FBISE")
    ]

    mock_questions = [
        PastPaperQuestion(question_id=1, paper_id=1, topic="Topic1", marks=2.0),
        PastPaperQuestion(question_id=2, paper_id=1, topic="Topic1", marks=3.0),
        PastPaperQuestion(question_id=3, paper_id=2, topic="Topic2", marks=5.0)
    ]

    # Mock the execute result for papers select
    mock_papers_result = MagicMock()
    mock_papers_result.scalars.return_value.all.return_value = mock_papers
    mock_db.execute.side_effect = [mock_papers_result, MagicMock()]  # First for papers, second for questions

    # Mock the execute result for questions select
    mock_qs_result = MagicMock()
    mock_qs_result.scalars.return_value.all.return_value = mock_questions
    mock_db.execute.side_effect = [mock_papers_result, mock_qs_result]

    result = await PastPaperService.get_topic_distribution(mock_db, subject_id)

    assert result["subject_id"] == subject_id
    assert result["total_topics"] == 2
    assert result["total_questions_with_topics"] == 3
    assert len(result["topics"]) == 2
    # Check if topics are sorted by count descending
    assert result["topics"][0]["topic"] == "Topic1"
    assert result["topics"][0]["count"] == 2


@pytest.mark.asyncio
async def test_get_marks_by_topic(mock_db):
    """Test getting marks by topic"""
    subject_id = 1
    mock_papers = [
        PastPaper(paper_id=1, subject_id=subject_id, year=2023, board="FBISE")
    ]

    mock_questions = [
        PastPaperQuestion(question_id=1, paper_id=1, topic="Topic1", marks=5.0),
        PastPaperQuestion(question_id=2, paper_id=1, topic="Topic1", marks=10.0),
        PastPaperQuestion(question_id=3, paper_id=1, topic="Topic2", marks=20.0)
    ]

    # Mock the execute result for papers select
    mock_papers_result = MagicMock()
    mock_papers_result.scalars.return_value.all.return_value = mock_papers
    mock_db.execute.side_effect = [mock_papers_result, MagicMock()]  # First for papers, second for questions

    # Mock the execute result for questions select
    mock_qs_result = MagicMock()
    mock_qs_result.scalars.return_value.all.return_value = mock_questions
    mock_db.execute.side_effect = [mock_papers_result, mock_qs_result]

    result = await PastPaperService.get_marks_by_topic(mock_db, subject_id)

    assert result["subject_id"] == subject_id
    assert result["total_marks"] == 35.0
    assert len(result["by_topic"]) == 2
    # Check if sorted by marks descending
    assert result["by_topic"][0]["topic"] == "Topic2"
    assert result["by_topic"][0]["marks"] == 20.0
    assert result["by_topic"][1]["topic"] == "Topic1"
    assert result["by_topic"][1]["marks"] == 15.0
