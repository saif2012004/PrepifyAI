"""
Topic Prediction Service using Fine-tuned DistilBERT

This service handles topic prediction for past paper questions.
It loads the fine-tuned DistilBERT models and provides inference capabilities.

Workflow:
1. Student requests predictions by selecting class and subject
2. Service predicts topics for questions from past papers
3. Returns topics from textbook_chunks that student should focus on
"""

import json
import os
import re
from typing import List, Dict, Optional, Tuple
from pathlib import Path
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException
import logging
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

_st_model = None


class TopicPredictionService:
    """
    Fine-tuned DistilBERT model for predicting topics from exam questions.
    """
    
    def __init__(self, model_base_path: str = None):
        if model_base_path is None:
            # Auto-detect: find project root (where 'pretrained' folder is)
            current_file = Path(__file__).resolve()
            # Go up from app/services/prediction_service.py to project root
            project_root = current_file.parent.parent.parent
            model_base_path = project_root / "pretrained"
        
        self.model_base_path = Path(model_base_path)
        self.models = {}
        self.tokenizers = {}
        self.metadata = {}
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        
        logger.info(f"Using device: {self.device}")
        logger.info(f"Model base path: {self.model_base_path}")
        self._load_models()

    def _ensure_sentence_transformer(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Lazy-load SentenceTransformer only if we need fallback predictions.
        """
        global _st_model
        if _st_model is not None:
            return _st_model
        from sentence_transformers import SentenceTransformer

        _st_model = SentenceTransformer(model_name)
        return _st_model

    @staticmethod
    def _keyword_confidence(question_text: str, topic_name: str) -> float:
        """
        Fast fallback confidence based on token overlap.
        Returns value in [0, 1].
        """
        q_tokens = set(re.findall(r"\w+", (question_text or "").lower()))
        t_tokens = set(re.findall(r"\w+", (topic_name or "").lower()))
        if not q_tokens or not t_tokens:
            return 0.0
        return len(q_tokens & t_tokens) / max(1, len(t_tokens))

    def _predict_topics_fallback(
        self,
        question_text: str,
        topic_candidates: List[str],
        top_k: int,
        confidence_threshold: float,
    ) -> List[Dict]:
        """
        Fallback topic prediction when DistilBERT models are not available.
        Uses semantic similarity (SentenceTransformer) when possible, otherwise keyword overlap.
        """
        # Deduplicate and trim for speed.
        candidates: List[str] = []
        seen = set()
        for t in (topic_candidates or []):
            if not t:
                continue
            t = str(t).strip()
            if not t or t in seen:
                continue
            seen.add(t)
            candidates.append(t)
        candidates = candidates[:200]

        if not candidates:
            raise HTTPException(status_code=400, detail="No topic candidates available for fallback prediction")

        semantic_sims: Optional[np.ndarray] = None
        # Try semantic similarity first (may require model download the first time).
        try:
            st = self._ensure_sentence_transformer()
            texts = [question_text] + candidates
            embeddings = st.encode(
                texts,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
            q_emb = embeddings[0]
            topic_embs = embeddings[1:]
            semantic_sims = topic_embs @ q_emb  # cosine similarity in [-1, 1]
        except Exception as e:
            logger.warning(f"Prediction fallback semantic similarity failed, using keyword overlap. Error: {e}")

        scored: List[Tuple[str, float]] = []
        for i, topic in enumerate(candidates):
            keyword_conf = self._keyword_confidence(question_text, topic)
            if semantic_sims is not None:
                sim = float(semantic_sims[i])
                semantic_conf = (sim + 1.0) / 2.0  # map [-1,1] -> [0,1]
                confidence = 0.7 * semantic_conf + 0.3 * keyword_conf
            else:
                # Extra heuristic: if topic name appears directly, boost confidence.
                direct = 1.0 if (topic.lower() in (question_text or "").lower()) else 0.0
                confidence = max(keyword_conf, direct * 0.5)

            scored.append((topic, float(confidence)))

        scored.sort(key=lambda x: x[1], reverse=True)

        filtered = [
            {"topic_name": topic, "confidence": conf, "label_id": 0}
            for topic, conf in scored[: max(50, top_k * 5)]
            if conf >= confidence_threshold
        ]

        # If everything is below threshold, still return best top_k so endpoint works.
        if not filtered:
            filtered = [
                {"topic_name": topic, "confidence": conf, "label_id": 0}
                for topic, conf in scored[:top_k]
            ]

        return filtered[:top_k]
    
    def _load_models(self):
        """Load all class-specific models"""
        classes = ['9', '10', '11', '12']
        
        for class_level in classes:
            model_path = self.model_base_path / f"distilbert-class{class_level}"
            
            if not model_path.exists():
                logger.warning(f"Model for class {class_level} not found at {model_path}")
                continue
            
            try:
                # Load model and tokenizer
                model = AutoModelForSequenceClassification.from_pretrained(str(model_path))
                tokenizer = AutoTokenizer.from_pretrained(str(model_path))
                model.to(self.device)
                model.eval()
                
                self.models[class_level] = model
                self.tokenizers[class_level] = tokenizer
                
                # Load metadata (label mappings)
                metadata_path = model_path / "label_mapping.json"
                with open(metadata_path) as f:
                    self.metadata[class_level] = json.load(f)
                
                logger.info(f"✓ Loaded model for class {class_level}")
                
            except Exception as e:
                logger.error(f"Failed to load model for class {class_level}: {str(e)}")
    
    def is_ready(self) -> bool:
        """Check if service has loaded any models"""
        return len(self.models) > 0
    
    def get_available_classes(self) -> List[str]:
        """Get list of available class levels"""
        return sorted(list(self.models.keys()))
    
    def predict_topics(
        self,
        question_text: str,
        class_level: str,
        top_k: int = 5,
        confidence_threshold: float = 0.1,
        topic_candidates: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        Predict topics for a given question.
        
        Args:
            question_text: The exam question text
            class_level: Student's class (9, 10, 11, or 12)
            top_k: Number of top predictions to return
            confidence_threshold: Minimum confidence to include prediction
        
        Returns:
            List of dicts with 'topic_name', 'confidence', and 'label_id' keys
        
        Raises:
            HTTPException: If class not available or prediction fails
        """
        # Use DistilBERT if the model for this class is available.
        if class_level not in self.models:
            if topic_candidates:
                return self._predict_topics_fallback(
                    question_text=question_text,
                    topic_candidates=topic_candidates,
                    top_k=top_k,
                    confidence_threshold=confidence_threshold,
                )

            raise HTTPException(
                status_code=503,
                detail=f"Prediction service not ready (no DistilBERT model for class {class_level}).",
            )
        
        try:
            model = self.models[class_level]
            tokenizer = self.tokenizers[class_level]
            metadata = self.metadata[class_level]
            
            # Tokenize input
            inputs = tokenizer(
                question_text,
                return_tensors='pt',
                padding=True,
                truncation=True,
                max_length=512
            ).to(self.device)
            
            # Get predictions
            with torch.no_grad():
                outputs = model(**inputs)
                logits = outputs.logits
                probabilities = torch.softmax(logits, dim=1)
            
            # Get top-k predictions
            num_preds = min(top_k, len(metadata['topic_labels']))
            top_probs, top_indices = torch.topk(
                probabilities,
                k=num_preds,
                dim=1
            )
            
            predictions = []
            for prob, idx in zip(top_probs[0].cpu().numpy(), top_indices[0].cpu().numpy()):
                confidence = float(prob)
                
                # Apply confidence threshold
                if confidence < confidence_threshold:
                    continue
                
                predictions.append({
                    'topic_name': metadata['topic_labels'][int(idx)],
                    'confidence': confidence,
                    'label_id': int(idx)
                })
            
            logger.info(f"Predicted {len(predictions)} topics for class {class_level}")
            return predictions
            
        except Exception as e:
            logger.error(f"Error during prediction: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")
    
    def batch_predict_topics(
        self,
        questions: List[str],
        class_level: str,
        top_k: int = 3,
        confidence_threshold: float = 0.1,
        topic_candidates: Optional[List[str]] = None,
    ) -> List[List[Dict]]:
        """
        Predict topics for multiple questions.
        
        Args:
            questions: List of question texts
            class_level: Student's class
            top_k: Number of top predictions per question
        
        Returns:
            List of prediction lists
        """
        predictions = []
        for question in questions:
            pred = self.predict_topics(
                question,
                class_level,
                top_k=top_k,
                confidence_threshold=confidence_threshold,
                topic_candidates=topic_candidates,
            )
            predictions.append(pred)
        
        return predictions
    
    def get_topic_distribution(self, class_level: str) -> Dict[str, int]:
        """
        Get distribution of topics in training data.
        
        Useful for understanding what topics model is trained on.
        """
        if class_level not in self.metadata:
            raise HTTPException(status_code=400, detail=f"Class {class_level} not available")
        
        topics = self.metadata[class_level]['topic_labels']
        return {topic: i for i, topic in enumerate(topics)}


class TopicSelectionService:
    """
    Service to recommend topics to study based on predictions and performance.
    
    Workflow:
    1. Student gets predictions for past paper questions (from TopicPredictionService)
    2. This service groups predictions and ranks topics for upcoming exams
    3. Topics are matched with textbook_chunks
    """
    
    @staticmethod
    def aggregate_predictions(
        predictions: List[List[Dict]],
        method: str = 'confidence_weighted'
    ) -> List[Dict]:
        """
        Aggregate topic predictions from multiple questions.
        
        Args:
            predictions: List of prediction lists from batch_predict_topics
            method: 'confidence_weighted' or 'frequency'
        
        Returns:
            Sorted list of aggregated topics with scores
        """
        topic_scores = {}
        
        for question_preds in predictions:
            for pred in question_preds:
                topic = pred['topic_name']
                
                if topic not in topic_scores:
                    topic_scores[topic] = {
                        'count': 0,
                        'total_confidence': 0.0
                    }
                
                topic_scores[topic]['count'] += 1
                topic_scores[topic]['total_confidence'] += pred['confidence']
        
        # Calculate final scores based on method
        results = []
        for topic, scores in topic_scores.items():
            if method == 'confidence_weighted':
                # Average confidence weighted by frequency
                score = (scores['total_confidence'] / scores['count']) * np.log(scores['count'] + 1)
            else:  # frequency
                score = scores['count']
            
            results.append({
                'topic_name': topic,
                'score': float(score),
                'frequency': scores['count'],
                'avg_confidence': float(scores['total_confidence'] / scores['count'])
            })
        
        # Sort by score descending
        results.sort(key=lambda x: x['score'], reverse=True)
        return results
    
    @staticmethod
    def filter_topics_by_performance(
        topics: List[Dict],
        student_performance: Dict[str, float],
        weak_threshold: float = 0.5
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Filter topics to focus on weak areas.
        
        Args:
            topics: Aggregated topics from aggregate_predictions
            student_performance: Dict mapping topic_name to accuracy (0-1)
            weak_threshold: Accuracy below this is considered weak
        
        Returns:
            (weak_topics, strong_topics) - topics sorted by performance
        """
        weak_topics = []
        strong_topics = []
        
        for topic in topics:
            topic_name = topic['topic_name']
            accuracy = student_performance.get(topic_name, 0.5)
            
            # Add performance info
            topic_with_performance = {
                **topic,
                'student_accuracy': accuracy,
                'priority_score': (1 - accuracy) * topic['score']  # Higher for weak areas
            }
            
            if accuracy < weak_threshold:
                weak_topics.append(topic_with_performance)
            else:
                strong_topics.append(topic_with_performance)
        
        # Sort by priority score
        weak_topics.sort(key=lambda x: x['priority_score'], reverse=True)
        strong_topics.sort(key=lambda x: x['score'], reverse=True)
        
        return weak_topics, strong_topics


class TextbookChunkMatcher:
    """
    Match predicted topics with textbook chunks for study material.
    """
    
    @staticmethod
    async def find_matching_chunks(
        db: AsyncSession,
        topic_name: str,
        subject_id: int,
        limit: int = 5
    ):
        """
        Find textbook chunks matching a predicted topic.
        
        Args:
            db: Async database session
            topic_name: Predicted topic name
            subject_id: Subject ID
            limit: Max chunks to return
        
        Returns:
            List of TextbookChunk objects
        """
        from ..models.textbook_chunk import TextbookChunk
        
        # Exact match first
        stmt_exact = select(TextbookChunk).where(
            TextbookChunk.subject_id == subject_id,
            TextbookChunk.topic_name == topic_name
        ).limit(limit)
        result_exact = await db.execute(stmt_exact)
        chunks = result_exact.scalars().all()
        
        # If no exact match, try partial match
        if not chunks:
            stmt_partial = select(TextbookChunk).where(
                TextbookChunk.subject_id == subject_id,
                TextbookChunk.topic_name.ilike(f"%{topic_name}%")
            ).limit(limit)
            result_partial = await db.execute(stmt_partial)
            chunks = result_partial.scalars().all()
        
        return chunks
    
    @staticmethod
    async def topics_for_examl(
        db: AsyncSession,
        predicted_topics: List[Dict],
        subject_id: int,
        top_n: int = 10
    ) -> List[Dict]:
        """
        Get ranked study material based on topic predictions.
        
        Args:
            db: Async database session
            predicted_topics: Topics from aggregate_predictions (already sorted)
            subject_id: Student's subject
            top_n: Top N study chunks to recommend
        
        Returns:
            List of study material with topics and chunks
        """
        recommended = []
        
        for topic_pred in predicted_topics[:top_n]:
            chunks = await TextbookChunkMatcher.find_matching_chunks(
                db,
                topic_pred['topic_name'],
                subject_id,
                limit=3
            )
            
            chapter_payload = [
                {
                    'chapter_name': chunk.chapter_name,
                    'chunk_id': chunk.chunk_id,
                    'page_start': chunk.page_start,
                    'page_end': chunk.page_end,
                    'content_preview': (chunk.text_content[:200] + '...')
                    if chunk.text_content
                    else '',
                }
                for chunk in (chunks or [])
            ]
            recommended.append(
                {
                    'topic_name': topic_pred['topic_name'],
                    'prediction_score': topic_pred['score'],
                    'frequency': topic_pred.get('frequency', 0),
                    'avg_confidence': topic_pred.get('avg_confidence', 0),
                    'chapters': chapter_payload,
                }
            )

        return recommended
