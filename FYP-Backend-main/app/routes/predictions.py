"""
API routes for topic predictions using DistilBERT.

Endpoints:
- POST /api/predictions/topics: Predict topics for a question
- GET /api/predictions/status: Check service status
- POST /api/predictions/batch: Predict topics for exam
- GET /api/predictions/history: Get user's prediction history
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from ..database import get_db
from ..core.security import require_admin_user
from ..services.prediction_service import (
    TopicPredictionService,
    TopicSelectionService,
    TextbookChunkMatcher
)
from ..schemas.prediction import (
    PredictionRequest,
    TopicPrediction,
    TopicPredictionResponse,
    BatchPredictionRequest,
    BatchPredictionResponse,
    TopicRecommendationResponse
)
from ..core.security import get_current_user
from ..models.user import User
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize prediction service (singleton)
prediction_service = None

def get_prediction_service() -> TopicPredictionService:
    """Get or initialize prediction service"""
    global prediction_service
    if prediction_service is None:
        prediction_service = TopicPredictionService()
    return prediction_service


@router.get("/status")
async def get_prediction_status():
    """
    Check if prediction service is ready.
    
    Returns:
        - status: "ready" or "not_ready"
        - available_classes: List of classes for which models are loaded
        - device: "cuda" or "cpu"
    """
    service = get_prediction_service()
    
    models_loaded = len(service.models)
    status = "ready" if models_loaded > 0 else "fallback_ready"
    return {
        "status": status,
        "available_classes": service.get_available_classes(),
        "device": "cuda" if getattr(service, "device", "cpu") == "cuda" else "cpu",
        "models_loaded": models_loaded,
        "prediction_mode": "distilbert" if models_loaded > 0 else "fallback_semantic_keyword",
    }


@router.post("/topics", response_model=TopicPredictionResponse)
async def predict_topics(
    request: PredictionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Predict topics for a given question.
    
    Request body:
    {
        "class_level": "10",
        "question_text": "What is photosynthesis?",
        "subject_id": 1,
        "top_k": 5,
        "confidence_threshold": 0.1
    }
    
    Response:
    {
        "predicted_topics": [
            {
                "topic_name": "Photosynthesis",
                "confidence": 0.95,
                "label_id": 5
            }
        ],
        "top_prediction": "Photosynthesis",
        "confidence": 0.95,
        "model_version": "distilbert-class10-v1"
    }
    """
    service = get_prediction_service()
    
    try:
        # Candidate topics are used only for fallback predictions.
        # If DistilBERT models for the requested class are available, we don't need them.
        topic_candidates: List[str] = []
        if request.subject_id is not None:
            from ..models.textbook_chunk import TextbookChunk
            stmt_topics = select(TextbookChunk.topic_name).where(
                TextbookChunk.subject_id == request.subject_id,
                TextbookChunk.topic_name.isnot(None),
            ).distinct().limit(200)
            result_topics = await db.execute(stmt_topics)
            topic_candidates = [r[0] for r in result_topics.fetchall() if r and r[0]]

            # If the requested subject has no textbook chunks seeded yet,
            # fall back to *any* known topic names so the prediction endpoint still works.
            if not topic_candidates:
                stmt_all_topics = select(TextbookChunk.topic_name).where(
                    TextbookChunk.topic_name.isnot(None),
                ).distinct().limit(300)
                result_all = await db.execute(stmt_all_topics)
                topic_candidates = [r[0] for r in result_all.fetchall() if r and r[0]]

        use_distilbert = request.class_level in service.models and service.is_ready()

        # Get predictions from model
        predictions = service.predict_topics(
            question_text=request.question_text,
            class_level=request.class_level,
            top_k=request.top_k,
            confidence_threshold=request.confidence_threshold,
            topic_candidates=(topic_candidates if not use_distilbert else None),
        )
        
        if not predictions:
            raise HTTPException(status_code=400, detail="No topics predicted with given threshold")
        
        # Top prediction
        top_pred = predictions[0]
        
        logger.info(
            f"User {current_user.user_id} predicted topic '{top_pred['topic_name']}' "
            f"for class {request.class_level} with confidence {top_pred['confidence']:.2%}"
        )
        
        distilbert_version = (
            f"distilbert-class{request.class_level}" if use_distilbert else "fallback-sentence-transformer"
        )

        typed_topics = [
            TopicPrediction(
                topic_name=p["topic_name"],
                confidence=float(p["confidence"]),
                label_id=int(p["label_id"]),
            )
            for p in predictions
        ]

        return TopicPredictionResponse(
            predicted_topics=typed_topics,
            top_prediction=top_pred["topic_name"],
            confidence=float(top_pred["confidence"]),
            distilbert_version=distilbert_version,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/batch", response_model=BatchPredictionResponse)
async def batch_predict_topics(
    request: BatchPredictionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Predict topics for multiple questions.
    
    Useful for:
    1. Predicting all topics in a past paper (20-30 questions)
    2. Getting aggregated topic recommendations
    3. Identifying weak areas across multiple questions
    
    Request body:
    {
        "class_level": "10",
        "subject_id": 1,
        "past_paper_id": 42,
        "top_k": 3
    }
    
    Response:
    {
        "batch_predictions": [
            {"topic_name": "Photosynthesis", "confidence": 0.95},
            {"topic_name": "Respiration", "confidence": 0.92}
        ],
        "aggregated_topics": [
            {
                "topic_name": "Photosynthesis",
                "score": 4.5,
                "frequency": 2,
                "avg_confidence": 0.95
            }
        ]
    }
    """
    service = get_prediction_service()

    try:
        # Candidate topics are used only for fallback predictions.
        topic_candidates: List[str] = []
        if request.subject_id is not None:
            from ..models.textbook_chunk import TextbookChunk
            stmt_topics = select(TextbookChunk.topic_name).where(
                TextbookChunk.subject_id == request.subject_id,
                TextbookChunk.topic_name.isnot(None),
            ).distinct().limit(200)
            result_topics = await db.execute(stmt_topics)
            topic_candidates = [r[0] for r in result_topics.fetchall() if r and r[0]]

            # Fallback: if subject-specific topics are missing, use all topics.
            if not topic_candidates:
                stmt_all_topics = select(TextbookChunk.topic_name).where(
                    TextbookChunk.topic_name.isnot(None),
                ).distinct().limit(300)
                result_all = await db.execute(stmt_all_topics)
                topic_candidates = [r[0] for r in result_all.fetchall() if r and r[0]]

        use_distilbert = request.class_level in service.models and service.is_ready()

        # Load questions for the past paper
        from ..models.past_paper_question import PastPaperQuestion
        stmt = select(PastPaperQuestion.question_text).where(
            PastPaperQuestion.paper_id == request.past_paper_id,
            PastPaperQuestion.question_text.isnot(None)
        )
        result = await db.execute(stmt)
        rows = result.fetchall()
        questions = [r[0] for r in rows if r[0]]
        
        if not questions:
            raise HTTPException(status_code=400, detail="No questions found for past_paper_id")

        # Batch predict all questions
        all_predictions = service.batch_predict_topics(
            questions=questions,
            class_level=request.class_level,
            top_k=request.top_k,
            confidence_threshold=0.1,
            topic_candidates=(topic_candidates if not use_distilbert else None),
        )
        
        # Aggregate predictions to get recommended topics
        aggregated = TopicSelectionService.aggregate_predictions(
            all_predictions,
            method='confidence_weighted'
        )
        
        logger.info(
            f"User {current_user.user_id} predicted topics for {len(questions)} questions. "
            f"Aggregated to {len(aggregated)} unique topics."
        )
        
        return BatchPredictionResponse(
            batch_predictions=all_predictions,
            aggregated_topics=aggregated,
            total_questions=len(questions),
            total_unique_topics=len(aggregated)
        )
    
    except Exception as e:
        logger.error(f"Batch prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Batch prediction failed: {str(e)}")


@router.post("/recommendations")
async def get_upcoming_topics(
    class_level: str = Query(..., description="Student's class: 9, 10, 11, or 12"),
    subject_id: int = Query(..., description="Subject ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Upcoming topic predections
    
    This endpoint:
    1. Fetches ALL past papers for the given class and subject from database
    2. Extracts all questions from these past papers
    3. Predicts topics for all questions using DistilBERT
    4. Aggregates predictions to identify important topics
    5. Matches predicted topics with textbook chunks
    6. Returns ranked study topics with related textbook material
    
    Query params:
    - class_level: Student's class (9, 10, 11, or 12)
    - subject_id: Subject database ID
    
    Response:
    {
        "class_level": "10",
        "subject_id": 1,
        "past_papers_analyzed": 5,
        "total_questions_analyzed": 87,
        "unique_topics_found": 12,
        "recommendations": [
            {
                "topic_name": "Photosynthesis",
                "prediction_score": 4.85,
                "frequency": 8,
                "avg_confidence": 0.92,
                "chapters": [
                    {
                        "chapter_name": "Chapter 5: Plant Nutrition",
                        "chunk_id": "chunk_123",
                        "page_start": 45,
                        "page_end": 52,
                        "content_preview": "Photosynthesis is the process..."
                    }
                ]
            }
        ]
    }
    """
    service = get_prediction_service()

    try:
        # Candidate topics are used only for fallback predictions.
        topic_candidates: List[str] = []
        if subject_id is not None:
            from ..models.textbook_chunk import TextbookChunk
            stmt_topics = select(TextbookChunk.topic_name).where(
                TextbookChunk.subject_id == subject_id,
                TextbookChunk.topic_name.isnot(None),
            ).distinct().limit(200)
            result_topics = await db.execute(stmt_topics)
            topic_candidates = [r[0] for r in result_topics.fetchall() if r and r[0]]

            # Fallback: if subject-specific topics are missing, use all topics.
            if not topic_candidates:
                stmt_all_topics = select(TextbookChunk.topic_name).where(
                    TextbookChunk.topic_name.isnot(None),
                ).distinct().limit(300)
                result_all = await db.execute(stmt_all_topics)
                topic_candidates = [r[0] for r in result_all.fetchall() if r and r[0]]

        use_distilbert = class_level in service.models and service.is_ready()

        from ..models.past_paper import PastPaper
        from ..models.past_paper_question import PastPaperQuestion
        
        # Fetch all past papers for this subject
        stmt_papers = select(PastPaper).where(
            PastPaper.subject_id == subject_id,
            PastPaper.is_published.is_(True),
        )
        result_papers = await db.execute(stmt_papers)
        past_papers = result_papers.scalars().all()
        
        if not past_papers:
            logger.warning(f"No past papers found for subject_id {subject_id}")
            return {
                "class_level": class_level,
                "subject_id": subject_id,
                "past_papers_analyzed": 0,
                "total_questions_analyzed": 0,
                "unique_topics_found": 0,
                "recommendations": [],
                "message": "No past papers found for this subject"
            }
        
        paper_ids = [p.paper_id for p in past_papers]
        
        # Extract all questions from all past papers
        stmt_questions = select(PastPaperQuestion.question_text).where(
            PastPaperQuestion.paper_id.in_(paper_ids),
            PastPaperQuestion.question_text.isnot(None)
        )
        result_questions = await db.execute(stmt_questions)
        question_rows = result_questions.fetchall()
        
        questions = [row[0] for row in question_rows if row[0] and len(row[0].strip()) > 0]
        
        if not questions:
            logger.warning(f"No questions found in past papers for subject_id {subject_id}")
            return {
                "class_level": class_level,
                "subject_id": subject_id,
                "past_papers_analyzed": len(past_papers),
                "total_questions_analyzed": 0,
                "unique_topics_found": 0,
                "recommendations": [],
                "message": "No questions found in past papers"
            }
        
        logger.info(
            f"User {current_user.user_id} requested recommendations for class {class_level}, "
            f"subject {subject_id}. Found {len(past_papers)} past papers with {len(questions)} questions."
        )
        
        # Batch predict topics for all questions
        all_predictions = service.batch_predict_topics(
            questions=questions,
            class_level=class_level,
            top_k=5,  # Get top 5 predictions per question
            confidence_threshold=0.1,
            topic_candidates=(topic_candidates if not use_distilbert else None),
        )
        
        # Aggregate predictions to identify most important topics
        aggregated = TopicSelectionService.aggregate_predictions(
            all_predictions,
            method='confidence_weighted'
        )
        
        # Get study material from textbook chunks for each topic
        recommendations = await TextbookChunkMatcher.topics_for_examl(
            db,
            aggregated,
            subject_id,
            top_n=15  # Top 15 topics to study
        )
        
        logger.info(
            f"Generated recommendations with {len(aggregated)} unique topics "
            f"and {len(recommendations)} topics with textbook material"
        )
        
        return {
            "class_level": class_level,
            "subject_id": subject_id,
            "past_papers_analyzed": len(past_papers),
            "total_questions_analyzed": len(questions),
            "unique_topics_found": len(aggregated),
            "recommendations": recommendations
        }
    
    except Exception as e:
        logger.error(f"Recommendation error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get recommendations: {str(e)}")


@router.get("/model-info")
async def get_model_info(
    class_level: Optional[str] = Query(None, description="Specific class to get info for")
):
    """
    Get information about trained models.
    
    Returns:
    - Available classes
    - Topics trained on (per class)
    - Model metadata
    """
    service = get_prediction_service()
    
    if not service.is_ready():
        raise HTTPException(status_code=503, detail="Prediction service not ready")
    
    if class_level:
        if class_level not in service.metadata:
            raise HTTPException(status_code=400, detail=f"Model for class {class_level} not available")
        
        metadata = service.metadata[class_level]
        return {
            "class_level": class_level,
            "model_type": metadata['model_type'],
            "num_topics": metadata['num_labels'],
            "topics": metadata['topic_labels'],
            "training_metrics": metadata['training_metrics']
        }
    else:
        # Return info for all classes
        info = {}
        for cls in service.get_available_classes():
            metadata = service.metadata[cls]
            info[cls] = {
                "num_topics": metadata['num_labels'],
                "model_type": metadata['model_type'],
                "training_metrics": metadata['training_metrics']
            }
        return info


class EvaluatePredictabilityRequest(BaseModel):
    """Run leave-historical-out evaluation for one past paper (admin)."""

    paper_id: int = Field(..., description="Past paper row id (target exam)")
    class_level: str = Field(..., description="Student class e.g. 9, 10, 11, 12")
    top_n_forecast: int = Field(20, ge=5, le=60)
    top_n_actual: int = Field(20, ge=5, le=60)


@router.post("/accuracy/evaluate")
async def evaluate_predictability(
    body: EvaluatePredictabilityRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    """
    Compare topics implied by **older** past papers (forecast) to topics on **this** paper (actual).
    Writes rows to ``predictions`` with ``predictability_score`` ≈ F1 overlap (fuzzy topic match).
    """
    from ..services.prediction_accuracy_service import evaluate_paper_vs_historical_forecast

    service = get_prediction_service()
    try:
        return await evaluate_paper_vs_historical_forecast(
            db,
            service,
            paper_id=body.paper_id,
            class_level=body.class_level.strip(),
            top_n_forecast=body.top_n_forecast,
            top_n_actual=body.top_n_actual,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Predictability evaluation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {e}")


@router.get("/accuracy/runs")
async def list_predictability_runs(
    subject_id: Optional[int] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    """Recent predictability evaluations (one summary per subject + exam year)."""
    from ..services.prediction_accuracy_service import list_accuracy_runs

    return {"items": await list_accuracy_runs(db, subject_id=subject_id, limit=limit)}
