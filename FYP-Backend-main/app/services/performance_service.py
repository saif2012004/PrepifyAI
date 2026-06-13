
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, desc, cast, Date, case
from sqlalchemy.orm import selectinload
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta, timezone
import difflib
import os

import numpy as np

from app.core.config import settings
from app.models.student_performance import StudentPerformance
from app.models.generated_question import GeneratedQuestion
from app.models.user import User
from app.models.subject import Subject
from app.schemas.student_performance import PerformanceCreate, PerformanceAnalytics
from app.schemas.generated_question import QuestionAnswerSubmission, QuestionAnswerResponse
from app.schemas.gamification import GamificationDelta
from app.services.gamification_service import GamificationService
from app.utils.performance_topic_label import topic_chapter_from_generated_question

_st_model = None  # lazy-loaded SentenceTransformer for semantic similarity

class PerformanceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_performance(self, performance_data: PerformanceCreate) -> StudentPerformance:
        db_performance = StudentPerformance(**performance_data.model_dump())
        self.db.add(db_performance)
        await self.db.commit()
        await self.db.refresh(db_performance)
        return db_performance

    async def evaluate_answer(
        self, 
        user_id: int, 
        answer_submission: QuestionAnswerSubmission
    ) -> QuestionAnswerResponse:
        # Get the question (chunks → topic label on performance rows)
        question = await self.db.execute(
            select(GeneratedQuestion)
            .options(selectinload(GeneratedQuestion.source_chunks))
            .where(GeneratedQuestion.question_id == answer_submission.question_id)
        )
        question = question.scalar_one_or_none()

        if not question:
            raise ValueError("Question not found")

        # MCQ, Short, and Long (long uses same partial-credit pipeline as Short)
        if question.question_type not in ("MCQ", "Short", "Long"):
            raise ValueError(
                "Answer submission supports MCQ, Short, and Long questions only."
            )

        # Decide evaluation mode based on type and requested mode
        mode = (getattr(answer_submission, "mode", "auto") or "auto").lower()
        if question.question_type == "MCQ":
            # MCQs always use key-based checking (letter/text match)
            use_ai = False
        else:
            # Short / Long:
            # - mode="ai": use LLM grading
            # - mode="auto" or "key": use semantic/key-based scoring (no LLM) with partial credit
            if mode == "ai":
                use_ai = True
            else:
                use_ai = False

        # Max marks for this question (stored or default by type)
        max_marks = self._get_max_marks(question)

        # Evaluate the answer
        if use_ai:
            try:
                is_correct, score_percentage, explanation = self._evaluate_answer_ai(
                    question=question,
                    user_answer=answer_submission.user_answer,
                )
            except Exception:
                # Fallback to semantic/key-based if AI grading fails
                if question.question_type == "MCQ":
                    is_correct = self._evaluate_answer(
                        question.correct_answer,
                        answer_submission.user_answer,
                        question.question_type,
                    )
                    score_percentage = 100.0 if is_correct else 0.0
                else:
                    score_percentage = self._short_score(
                        question.correct_answer,
                        answer_submission.user_answer,
                    )
                    is_correct = score_percentage >= 50.0
                explanation = question.explanation
        else:
            if question.question_type == "MCQ":
                is_correct = self._evaluate_answer(
                    question.correct_answer,
                    answer_submission.user_answer,
                    question.question_type,
                )
                score_percentage = 100.0 if is_correct else 0.0
            else:
                # Short answer: use semantic-aware partial credit
                score_percentage = self._short_score(
                    question.correct_answer,
                    answer_submission.user_answer,
                )
                is_correct = score_percentage >= 50.0
            explanation = question.explanation

        # Convert percentage to marks: e.g. 80% of 4 marks = 3.2
        score_marks = round((score_percentage / 100.0) * max_marks, 1) if max_marks else None

        # Record performance only if the user exists to avoid FK violations in test/demo mode
        user_exists = await self.db.execute(
            select(User).where(User.user_id == user_id)
        )
        gamification_delta: Optional[GamificationDelta] = None
        if user_exists.scalar_one_or_none() is not None:
            tname, cname = topic_chapter_from_generated_question(question)
            performance_data = PerformanceCreate(
                user_id=user_id,
                subject_id=question.subject_id,
                question_id=question.question_id,
                user_answer=answer_submission.user_answer,
                is_correct=is_correct,
                time_taken=answer_submission.time_taken,
                score_percentage=score_percentage,
                topic_name=tname,
                chapter_name=cname,
            )
            await self.record_performance(performance_data)
            try:
                gsvc = GamificationService(self.db)
                delta = await gsvc.apply_answer_reward(
                    user_id,
                    question_type=question.question_type or "Short",
                    is_correct=is_correct,
                    score_percentage=score_percentage,
                    time_taken=answer_submission.time_taken,
                )
                gamification_delta = GamificationDelta(**delta)
            except Exception:
                gamification_delta = None

        return QuestionAnswerResponse(
            is_correct=is_correct,
            score_percentage=score_percentage,
            score_marks=score_marks,
            max_marks=float(max_marks) if max_marks else None,
            explanation=explanation,
            correct_answer=question.correct_answer,
            gamification=gamification_delta,
        )

    def _get_max_marks(self, question: GeneratedQuestion) -> float:
        """Get max marks for this question (stored or default by type)."""
        m = getattr(question, "marks", None)
        if m is not None and m > 0:
            return float(m)
        t = (question.question_type or "").strip()
        if t == "MCQ":
            return 1.0
        if t == "Long":
            return 9.0
        return 4.0  # Short default

    def _semantic_similarity(self, a: str, b: str) -> Optional[float]:
        """
        Compute semantic similarity between two texts using SentenceTransformer.
        Returns cosine similarity in [0,1], or None if model not available.
        """
        global _st_model
        a = (a or "").strip()
        b = (b or "").strip()
        if not a or not b:
            return None
        try:
            if _st_model is None:
                from sentence_transformers import SentenceTransformer

                _st_model = SentenceTransformer("all-MiniLM-L6-v2")
            embeddings = _st_model.encode([a, b], convert_to_numpy=True)
            v1, v2 = embeddings[0], embeddings[1]
            denom = np.linalg.norm(v1) * np.linalg.norm(v2)
            if denom == 0:
                return None
            sim = float(np.dot(v1, v2) / denom)
            # Clamp to [0, 1] just in case of numerical noise
            return max(0.0, min(1.0, sim))
        except Exception:
            return None

    def _keyword_overlap_score(self, a: str, b: str) -> float:
        """
        Compute a loose keyword-overlap score between two texts, tolerant to spelling.
        Returns a value in [0,1].
        """
        a = (a or "").lower()
        b = (b or "").lower()
        if not a or not b:
            return 0.0

        def _tokens(text: str) -> list[str]:
            out: list[str] = []
            for raw in text.replace("-", " ").replace(",", " ").replace(".", " ").split():
                tok = "".join(ch for ch in raw if ch.isalpha())
                if len(tok) >= 3:
                    out.append(tok)
            return out

        toks_a = _tokens(a)
        toks_b = _tokens(b)
        if not toks_a or not toks_b:
            return 0.0

        matched = 0
        for ta in toks_a:
            best = 0.0
            for tb in toks_b:
                r = difflib.SequenceMatcher(None, ta, tb).ratio()
                if r > best:
                    best = r
            if best >= 0.8:  # consider this keyword matched (tolerant to spelling)
                matched += 1

        return matched / len(toks_a)

    def _evaluate_answer(self, correct_answer: str, user_answer: str, question_type: str) -> bool:
        ca = (correct_answer or "").strip()
        ua = (user_answer or "").strip()
        if not ca or not ua:
            return False

        if question_type == "MCQ":
            # MCQ: prefer letter-based comparison when possible
            if len(ca) == 1 and ca.upper() in {"A", "B", "C", "D"}:
                return ca.upper() == ua.upper()
            # Otherwise fall back to simple text containment (key-based)
            return ca.lower() in ua.lower() or ua.lower() in ca.lower()

        # Short/Long: first try simple containment
        if ca.lower() in ua.lower() or ua.lower() in ca.lower():
            return True

        # Then semantic similarity: treat as correct if similarity is high enough
        sim = self._semantic_similarity(ca, ua)
        if sim is not None and sim >= 0.8:
            return True

        return False

    def _short_score(self, correct_answer: str, user_answer: str) -> float:
        """
        Compute a percentage score for short answers using key + semantic similarity.
        - 100% if texts clearly match (containment)
        - Otherwise, use semantic similarity scaled to 0–100.
        """
        ca = (correct_answer or "").strip()
        ua = (user_answer or "").strip()
        if not ca or not ua:
            return 0.0

        # Exact / containment => full marks
        if ca.lower() in ua.lower() or ua.lower() in ca.lower():
            return 100.0

        sim = self._semantic_similarity(ca, ua) or 0.0
        kw = self._keyword_overlap_score(ca, ua)

        # Combine semantic similarity and keyword overlap.
        # Weight keywords a bit more so short but on-point answers get credit.
        combined = 0.4 * sim + 0.6 * kw

        # Map to percentage
        score = round(combined * 100.0, 1)
        # Clamp just in case
        if score < 0.0:
            score = 0.0
        if score > 100.0:
            score = 100.0
        return score

    def _evaluate_answer_ai(self, question: GeneratedQuestion, user_answer: str) -> Tuple[bool, float, str]:
        """
        Use Groq LLM to grade short/long answers.
        Returns (is_correct, score_percentage, feedback).
        """
        from groq import Groq

        key = (getattr(settings, "GROQ_API_KEY", None) or os.environ.get("GROQ_API_KEY") or "").strip()
        if not key:
            raise RuntimeError("GROQ_API_KEY not set for AI grading")

        client = Groq(api_key=key)
        max_marks = self._get_max_marks(question)

        prompt = (
            "You are an examiner for Pakistani board exams.\n"
            f"Question: {question.question_text}\n"
            f"Model answer (ideal): {question.correct_answer}\n"
            f"Student answer: {user_answer}\n\n"
            "Evaluate the student answer strictly based on the model answer and question.\n"
            "Respond in JSON ONLY, no extra text, with this format:\n"
            '{ "score": <integer 0-100>, "feedback": "<short feedback in 1-3 sentences>" }'
        )

        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=300,
        )
        text = (resp.choices[0].message.content or "").strip()

        score = 0.0
        feedback = ""
        try:
            # Try parse JSON object from response
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                data = eval(text[start:end], {"__builtins__": {}})  # simple, constrained eval for JSON-like
                if isinstance(data, dict):
                    raw_score = data.get("score", 0)
                    try:
                        score = float(raw_score)
                    except Exception:
                        score = 0.0
                    feedback = str(data.get("feedback", "")).strip()
        except Exception:
            score = 0.0

        if score < 0:
            score = 0.0
        if score > 100:
            score = 100.0

        is_correct = score >= 50.0
        if not feedback:
            feedback = "Answer partially correct." if is_correct else "Answer is not sufficient compared to the model answer."
        return is_correct, score, feedback

    async def get_user_analytics(self, user_id: int, subject_id: Optional[int] = None) -> PerformanceAnalytics:
        # Base query
        query = select(StudentPerformance).where(StudentPerformance.user_id == user_id)

        if subject_id:
            query = query.where(StudentPerformance.subject_id == subject_id)

        result = await self.db.execute(query)
        performances = result.scalars().all()

        if not performances:
            return PerformanceAnalytics(
                total_attempts=0,
                correct_answers=0,
                accuracy_percentage=0.0,
                strong_topics=[],
                weak_topics=[],
                subject_wise_performance={},
                recent_trend="stable"
            )

        # Calculate metrics
        total_attempts = len(performances)
        correct_answers = sum(1 for p in performances if p.is_correct)
        accuracy_percentage = (correct_answers / total_attempts) * 100

        # Average time
        times = [p.time_taken for p in performances if p.time_taken]
        average_time = sum(times) / len(times) if times else None

        # Topic analysis
        topic_performance = {}
        for p in performances:
            if p.topic_name:
                if p.topic_name not in topic_performance:
                    topic_performance[p.topic_name] = {'correct': 0, 'total': 0}
                topic_performance[p.topic_name]['total'] += 1
                if p.is_correct:
                    topic_performance[p.topic_name]['correct'] += 1

        # Strong and weak topics
        strong_topics = []
        weak_topics = []

        for topic, stats in topic_performance.items():
            accuracy = (stats['correct'] / stats['total']) * 100
            if accuracy >= 80:
                strong_topics.append(topic)
            elif accuracy < 60:
                weak_topics.append(topic)

        # Subject-wise performance
        subject_performance = {}
        for p in performances:
            if p.subject_id not in subject_performance:
                subject_performance[p.subject_id] = {'correct': 0, 'total': 0}
            subject_performance[p.subject_id]['total'] += 1
            if p.is_correct:
                subject_performance[p.subject_id]['correct'] += 1

        subject_wise_performance = {
            str(subject_id): (stats['correct'] / stats['total']) * 100
            for subject_id, stats in subject_performance.items()
        }

        # Recent trend (simplified)
        recent_trend = "stable"
        if len(performances) >= 10:
            recent_performances = sorted(performances, key=lambda x: x.attempted_on)[-10:]
            recent_accuracy = sum(1 for p in recent_performances if p.is_correct) / len(recent_performances) * 100

            if recent_accuracy > accuracy_percentage + 5:
                recent_trend = "improving"
            elif recent_accuracy < accuracy_percentage - 5:
                recent_trend = "declining"

        return PerformanceAnalytics(
            total_attempts=total_attempts,
            correct_answers=correct_answers,
            accuracy_percentage=accuracy_percentage,
            average_time=average_time,
            strong_topics=strong_topics,
            weak_topics=weak_topics,
            subject_wise_performance=subject_wise_performance,
            recent_trend=recent_trend
        )

    async def get_recent_daily_performance(
        self,
        user_id: int,
        days: int = 7,
        subject_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Per-day aggregates for the last ``days`` (UTC), for charts on the student app.
        """
        days = max(1, min(int(days or 7), 90))
        since = datetime.now(timezone.utc) - timedelta(days=days)
        day_col = cast(StudentPerformance.attempted_on, Date)
        stmt = (
            select(
                day_col.label("day"),
                func.count(StudentPerformance.performance_id).label("attempts"),
                func.sum(case((StudentPerformance.is_correct.is_(True), 1), else_=0)).label("correct"),
            )
            .where(
                StudentPerformance.user_id == user_id,
                StudentPerformance.attempted_on >= since,
            )
            .group_by(day_col)
            .order_by(day_col.asc())
        )
        if subject_id is not None:
            stmt = stmt.where(StudentPerformance.subject_id == subject_id)

        result = await self.db.execute(stmt)
        out: List[Dict[str, Any]] = []
        for row in result.all():
            day = row.day
            attempts = int(row.attempts or 0)
            correct = int(row.correct or 0)
            acc = (correct / attempts * 100.0) if attempts else 0.0
            date_str = day.isoformat() if hasattr(day, "isoformat") else str(day)
            out.append(
                {
                    "date": date_str,
                    "attempts": attempts,
                    "correct": correct,
                    "accuracy_percentage": round(acc, 1),
                }
            )
        return out

    async def get_practice_time_minutes_by_subject(self, user_id: int) -> List[Dict[str, Any]]:
        """
        Sum ``time_taken`` (stored as seconds per attempt) per subject for the student.
        Rows with NULL/0 time are ignored. Joins ``subjects`` for display names.
        """
        total_sec = func.coalesce(func.sum(StudentPerformance.time_taken), 0).label("total_sec")
        # Outer join: performance rows always have subject_id; catalog row should exist but do not drop minutes if not.
        stmt = (
            select(
                StudentPerformance.subject_id,
                func.max(Subject.subject_name).label("subject_name"),
                total_sec,
            )
            .select_from(StudentPerformance)
            .outerjoin(Subject, Subject.subject_id == StudentPerformance.subject_id)
            .where(
                StudentPerformance.user_id == user_id,
                StudentPerformance.time_taken.isnot(None),
                StudentPerformance.time_taken > 0,
            )
            .group_by(StudentPerformance.subject_id)
        )
        result = await self.db.execute(stmt)
        db_rows = sorted(result.all(), key=lambda r: int(r.total_sec or 0), reverse=True)
        out: List[Dict[str, Any]] = []
        for row in db_rows:
            sec = int(row.total_sec or 0)
            if sec <= 0:
                continue
            name = (str(row.subject_name).strip() if row.subject_name else "") or f"Subject {row.subject_id}"
            out.append(
                {
                    "subject_id": int(row.subject_id),
                    "subject_name": name,
                    "minutes": round(sec / 60.0, 1),
                }
            )
        return out

    async def get_user_performance_history(
        self, 
        user_id: int, 
        subject_id: Optional[int] = None,
        days: int = 30
    ) -> List[StudentPerformance]:
        since_date = datetime.now(timezone.utc) - timedelta(days=days)

        query = select(StudentPerformance).where(
            and_(
                StudentPerformance.user_id == user_id,
                StudentPerformance.attempted_on >= since_date
            )
        ).order_by(desc(StudentPerformance.attempted_on))

        if subject_id:
            query = query.where(StudentPerformance.subject_id == subject_id)

        result = await self.db.execute(query)
        return result.scalars().all()
