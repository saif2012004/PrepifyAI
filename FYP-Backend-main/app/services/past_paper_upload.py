"""
Service for handling past paper uploads with PDF processing and question extraction
"""

import os
import shutil
import tempfile
import logging
from pathlib import Path
from uuid import uuid4
from typing import Optional, Dict, List, Tuple, Any
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PastPaper, PastPaperQuestion
from app.schemas.past_paper_upload import PastPaperUploadRequest
from app.services.embeddingsGen import RobustPastPaperProcessor
from app.core.embedding_storage import embedding_to_storage_format
from app.core.config import settings

logger = logging.getLogger(__name__)


class PastPaperUploadService:
    """Service for managing past paper uploads and question extraction"""

    @staticmethod
    def _stats_from_extracted_questions(questions: List[Dict[str, Any]]) -> Dict[str, int]:
        """Counts by type for questions that will be stored (have embeddings)."""
        mcqs = short_questions = long_questions = 0
        for q in questions:
            t = str(q.get("question_type", "") or "").strip().lower()
            if t in ("mcq", "multiple_choice", "multiple choice"):
                mcqs += 1
            elif "long" in t:
                long_questions += 1
            elif "short" in t:
                short_questions += 1
            else:
                short_questions += 1
        return {
            "total_questions": len(questions),
            "mcqs": mcqs,
            "short_questions": short_questions,
            "long_questions": long_questions,
        }

    @staticmethod
    def _upload_root() -> Path:
        return settings.upload_dir_abs()

    @staticmethod
    def persist_paper_pdf_copy(temp_pdf_path: str, paper_id: int) -> str:
        """
        Copy uploaded PDF into UPLOAD_DIR/past_papers/{paper_id}.pdf.
        Returns path relative to UPLOAD_DIR (forward slashes).
        """
        dest_dir = PastPaperUploadService._upload_root() / "past_papers"
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{paper_id}.pdf"
        shutil.copy2(temp_pdf_path, dest)
        return f"past_papers/{paper_id}.pdf"

    @staticmethod
    async def validate_class_and_subject(
        db: AsyncSession,
        class_level: str,
        board: str,
        subject_name: str
    ) -> Tuple[bool, Optional[int], Optional[str]]:
        """
        Validate if class exists and subject exists for that class.
        
        Returns:
            Tuple of (is_valid, subject_id, error_message)
        """
        try:
            from app.utils.subject_query import resolve_subject_triple

            subject = await resolve_subject_triple(
                db,
                board=board,
                class_level=class_level,
                subject_name=subject_name,
            )

            if not subject:
                error_msg = (
                    f"Subject '{subject_name}' not found for "
                    f"class {class_level}, board {board}"
                )
                logger.warning(error_msg)
                return False, None, error_msg

            logger.info(
                f"Validated subject: {subject.subject_name} "
                f"(ID: {subject.subject_id}) for class {class_level}"
            )
            return True, subject.subject_id, None

        except Exception as e:
            error_msg = f"Error validating class and subject: {str(e)}"
            logger.error(error_msg)
            return False, None, error_msg

    @staticmethod
    async def ensure_subject_for_upload(
        db: AsyncSession,
        class_level: str,
        board: str,
        subject_name: str,
    ) -> int:
        """
        Return subject_id, creating Subject if missing (same idea as question generation).
        Avoids admin uploads failing on empty subjects table.
        """
        from app.utils.subject_query import get_or_create_subject_triple

        sub = await get_or_create_subject_triple(
            db,
            board=board,
            class_level=class_level,
            subject_name=subject_name,
            book_version="2024",
        )
        return int(sub.subject_id)

    @staticmethod
    async def register_past_paper_pdf_only(
        db: AsyncSession,
        file: UploadFile,
        *,
        class_level: str,
        board: str,
        subject_name: str,
        year: int,
        publish_for_students: bool,
    ) -> Dict[str, Any]:
        """
        Same flow as admin library book upload: validate PDF, ensure subject, stream file to disk.
        Creates a PastPaper row with pdf_relative_path only (no question extraction).
        """
        from app.utils.admin_pdf_upload import validate_pdf_upload, copy_upload_into_subdir

        validate_pdf_upload(file)
        subject_id = await PastPaperUploadService.ensure_subject_for_upload(
            db,
            class_level.strip(),
            board.strip(),
            subject_name.strip(),
        )
        past_paper = PastPaper(
            subject_id=subject_id,
            year=int(year),
            board=board.strip(),
            is_published=bool(publish_for_students),
        )
        db.add(past_paper)
        await db.flush()
        await db.refresh(past_paper)
        paper_id = int(past_paper.paper_id)
        rel = copy_upload_into_subdir(file, "past_papers", f"{paper_id}.pdf")
        past_paper.pdf_relative_path = rel
        await db.commit()
        await db.refresh(past_paper)
        return {
            "paper_id": paper_id,
            "subject_id": subject_id,
            "class_level": class_level.strip(),
            "board": board.strip(),
            "subject_name": subject_name.strip(),
            "year": int(year),
            "is_published": bool(publish_for_students),
            "total_questions": 0,
            "mcqs": 0,
            "short_questions": 0,
            "long_questions": 0,
            "questions": [],
        }

    @staticmethod
    async def process_past_paper_pdf(
        db: AsyncSession,
        file_path: str,
        upload_data: PastPaperUploadRequest
    ) -> Dict:
        """
        Store the uploaded past paper PDF and optionally save extracted questions.

        The PDF copy is always attempted so students can open the full paper even when
        extraction yields no questions or some rows lack embeddings (those rows are skipped).
        """
        try:
            # Step 1: Ensure subject (create if missing — matches in-app question generation)
            logger.info(
                f"Ensuring subject {upload_data.subject_name} for class "
                f"{upload_data.class_level} board {upload_data.board}"
            )
            subject_id = await PastPaperUploadService.ensure_subject_for_upload(
                db,
                upload_data.class_level,
                upload_data.board,
                upload_data.subject_name,
            )

            # Step 2: Initialize processor and extract questions
            logger.info(f"Initializing PDF processor for file: {file_path}")
            processor = RobustPastPaperProcessor()

            logger.info("Processing PDF and extracting questions...")
            processed_data = processor.process_single_paper(
                file_path,
                paper_id=1,  # Temporary, will be replaced with DB ID
                output_dir=None  # Don't save to file, we're storing in DB
            ) or {}

            questions_raw: List[Dict[str, Any]] = list(processed_data.get("questions") or [])
            valid_questions = [q for q in questions_raw if q.get("embedding")]
            dropped = len(questions_raw) - len(valid_questions)
            if dropped:
                logger.warning(
                    "Skipping %d extracted question(s) without embeddings (PDF is still stored).",
                    dropped,
                )
            if not questions_raw:
                logger.warning(
                    "No questions extracted from PDF; saving paper with full PDF only for students."
                )

            # Step 3: Create PastPaper record
            logger.info(f"Creating past paper record in database...")
            past_paper = PastPaper(
                subject_id=subject_id,
                year=upload_data.year,
                board=upload_data.board,
                is_published=bool(upload_data.publish_for_students),
            )
            db.add(past_paper)
            await db.flush()  # Flush to get the paper_id
            await db.refresh(past_paper)  # Ensure paper_id is populated (tests mock this)
            paper_id = past_paper.paper_id
            try:
                past_paper.pdf_relative_path = PastPaperUploadService.persist_paper_pdf_copy(
                    file_path, int(paper_id)
                )
            except Exception as ex:
                logger.warning("Past paper PDF was not persisted (paper row saved; optional questions may follow): %s", ex)
            await db.commit()

            logger.info(f"Created past paper with ID: {paper_id}")

            # Step 4: Save extracted questions (optional — full PDF is stored regardless)
            stats = PastPaperUploadService._stats_from_extracted_questions(valid_questions)
            if valid_questions:
                logger.info("Saving %d question(s) with embeddings…", len(valid_questions))
                questions_to_save = []
                for q in valid_questions:
                    past_paper_question = PastPaperQuestion(
                        paper_id=paper_id,
                        question_text=q.get("question_text", ""),
                        question_type=q.get("question_type", "unknown"),
                        marks=q.get("marks", 1),
                        embedding=embedding_to_storage_format(q["embedding"]),
                    )
                    questions_to_save.append(past_paper_question)

                db.add_all(questions_to_save)
                await db.commit()
                logger.info("Saved %d questions to database", len(questions_to_save))
            else:
                logger.info("No storable questions; past paper row has PDF only.")

            # Step 5: Prepare response
            response = {
                "paper_id": paper_id,
                "subject_id": subject_id,
                "class_level": upload_data.class_level,
                "board": upload_data.board,
                "subject_name": upload_data.subject_name,
                "year": upload_data.year,
                "is_published": bool(upload_data.publish_for_students),
                "total_questions": stats["total_questions"],
                "mcqs": stats["mcqs"],
                "short_questions": stats["short_questions"],
                "long_questions": stats["long_questions"],
                "questions": [
                    {
                        "question_text": q.get("question_text", ""),
                        "question_type": q.get("question_type", "unknown"),
                        "marks": q.get("marks", 1),
                    }
                    for q in valid_questions
                ],
            }

            logger.info(f"Past paper processing completed successfully")
            return response

        except ValueError as e:
            logger.error(f"Validation error: {str(e)}")
            raise

        except Exception as e:
            logger.error(f"Error processing past paper PDF: {str(e)}")
            raise

    @staticmethod
    def save_uploaded_file(uploaded_file) -> str:
        """
        Save uploaded file to temporary location.
        
        Returns:
            Path to saved file
        """
        try:
            # Validate file size before writing to disk.
            uploaded_file.file.seek(0, 2)
            file_size = uploaded_file.file.tell()
            uploaded_file.file.seek(0)
            if file_size > settings.MAX_FILE_SIZE:
                max_mb = settings.MAX_FILE_SIZE // (1024 * 1024)
                raise ValueError(
                    f"File is too large ({file_size // (1024 * 1024)} MB). "
                    f"Maximum allowed size is {max_mb} MB."
                )

            # Create temp directory if it doesn't exist
            temp_dir = tempfile.gettempdir()
            upload_dir = os.path.join(temp_dir, "past_papers")
            os.makedirs(upload_dir, exist_ok=True)

            # Save file (mobile uploads may omit filename)
            raw_name = (uploaded_file.filename or "").strip()
            base = os.path.basename(raw_name) if raw_name else ""
            if not base.lower().endswith(".pdf"):
                base = f"{uuid4().hex}.pdf"
            file_path = os.path.join(upload_dir, base)
            with open(file_path, "wb") as buffer:
                buffer.write(uploaded_file.file.read())

            logger.info(f"File saved to: {file_path}")
            return file_path

        except Exception as e:
            logger.error(f"Error saving uploaded file: {str(e)}")
            raise

    @staticmethod
    def cleanup_temp_file(file_path: str) -> None:
        """Remove temporary file after processing"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Cleaned up temporary file: {file_path}")
        except Exception as e:
            logger.warning(f"Error cleaning up temporary file: {str(e)}")
