
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# Original schemas
class PredictionBase(BaseModel):
    topic_name: str
    predicted_probability: float
    exam_year: int

class PredictionCreate(PredictionBase):
    subject_id: int
    prediction_method: Optional[str] = None

class PredictionUpdate(BaseModel):
    actual_appeared: Optional[bool] = None
    predictability_score: Optional[float] = None

class PredictionResponse(PredictionBase):
    prediction_id: int
    subject_id: int
    actual_appeared: Optional[bool] = None
    predictability_score: Optional[float] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TopicPredictions(BaseModel):
    subject_name: str
    exam_year: int
    high_probability_topics: List[PredictionResponse]
    accuracy_score: Optional[float] = None


# DistilBERT Prediction Schemas
class TopicPrediction(BaseModel):
    """Single topic prediction with confidence"""
    topic_name: str = Field(..., description="Predicted topic name")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score (0-1)")
    label_id: int = Field(..., description="Internal label ID")


class PredictionRequest(BaseModel):
    """Request to predict topics for a single question"""
    class_level: str = Field(..., description="Student's class: 9, 10, 11, or 12")
    question_text: str = Field(..., min_length=10, description="Exam question text")
    subject_id: int = Field(..., description="Subject ID")
    top_k: int = Field(default=5, ge=1, le=10, description="Number of top predictions")
    confidence_threshold: float = Field(default=0.1, ge=0.0, le=1.0, description="Minimum confidence")


class TopicPredictionResponse(BaseModel):
    """Response with predicted topics for a question"""
    predicted_topics: List[TopicPrediction] = Field(..., description="List of predicted topics")
    top_prediction: str = Field(..., description="Most likely topic")
    confidence: float = Field(..., description="Confidence of top prediction")
    distilbert_version: str = Field(..., description="Model version used")
    
    model_config = {"protected_namespaces": ()}


class BatchPredictionRequest(BaseModel):
    """Request to predict topics for a past paper.

    Provide the past_paper_id to load all its questions from the database.
    """
    class_level: str = Field(..., description="Student's class")
    subject_id: int = Field(..., description="Subject ID")
    past_paper_id: int = Field(..., description="Past paper ID to fetch questions")
    top_k: int = Field(default=3, ge=1, le=5, description="Top predictions per question")


class AggregatedTopic(BaseModel):
    """Topic aggregated from multiple question predictions"""
    topic_name: str = Field(..., description="Topic name")
    score: float = Field(..., description="Aggregated score")
    frequency: int = Field(..., description="How many questions predicted this topic")
    avg_confidence: float = Field(..., description="Average confidence across predictions")


class BatchPredictionResponse(BaseModel):
    """Response with predictions for multiple questions"""
    batch_predictions: List[List[TopicPrediction]] = Field(..., description="Predictions per question")
    aggregated_topics: List[AggregatedTopic] = Field(..., description="Aggregated predictions")
    total_questions: int = Field(..., description="Total questions analyzed")
    total_unique_topics: int = Field(..., description="Unique topics predicted")


class TopicRecommendationResponse(BaseModel):
    """Recommended topics with study material"""
    class_level: str
    subject_id: int
    questions_analyzed: int
    unique_topics: int
    recommendations: List[Dict[str, Any]]
