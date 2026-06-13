"""
Routes for past paper upload with question extraction
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
import logging
from typing import List
from uuid import uuid4

from app.database import get_db, AsyncSessionLocal
from app.schemas.past_paper_upload import (
    PastPaperUploadRequest,
    PastPaperUploadResponse,
    BulkPastPaperUploadResponse,
    ValidationError
)
from app.services.past_paper_upload import PastPaperUploadService
from app.core.security import require_admin
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()
UPLOAD_JOBS: dict = {}


def _reject_punjab_board(board: str) -> None:
    normalized = (board or "").strip().lower()
    if "punjab" in normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Past paper uploads for Punjab Board are disabled.",
        )


@router.post(
    "/upload",
    response_model=PastPaperUploadResponse,
    responses={
        400: {"model": ValidationError, "description": "Validation error"},
        403: {"description": "Forbidden - Admin access required"},
        422: {"model": ValidationError, "description": "Invalid file or data"},
        500: {"model": ValidationError, "description": "Server error"}
    }
)
async def upload_past_paper(
    file: UploadFile = File(..., description="PDF file of the past paper"),
    class_level: str = Form(..., description="Class level (9, 10, 11, 12)"),
    board: str = Form(..., description="Board name (FBISE, Punjab, Sindh, etc.)"),
    subject_name: str = Form(..., description="Subject name (Biology, Physics, Chemistry, Mathematics, etc.)"),
    year: int = Form(..., description="Year of the past paper"),
    publish_for_students: bool = Form(
        True,
        description="If true (default), students see this paper under Past papers. Set false to save as draft.",
    ),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """
    Upload a past paper PDF and extract questions with embeddings.
    
    **ADMIN ONLY** - Requires authentication with admin role.
    
    Steps:
    1. Validates that class exists
    2. Validates that subject exists for that class
    3. Extracts text from PDF using OCR if needed
    4. Parses all questions (MCQ, Short, Long)
    5. Generates embeddings for each question
    6. Stores everything in the database
    
    **Parameters:**
    - `file`: PDF file (required)
    - `class_level`: Student class level (9, 10, 11, or 12)
    - `board`: Educational board (FBISE, Punjab, Sindh, etc.)
    - `subject_name`: Subject (Biology, Physics, Chemistry, Mathematics, etc.)
    - `year`: Year of the past paper (e.g., 2023)
    
    **Returns:**
    - `paper_id`: ID of the created past paper record
    - `subject_id`: ID of the subject
    - `total_questions`: Total questions extracted
    - `mcqs`: Count of MCQ questions
    - `short_questions`: Count of short answer questions
    - `long_questions`: Count of long answer questions
    - `questions`: List of all extracted questions with their embeddings
    
    **Example:**
    ```
    POST /past-papers/upload
    Form Data:
    - file: [PDF file]
    - class_level: 10
    - board: FBISE
    - subject_name: Biology
    - year: 2023
    ```
    
    **Errors:**
    - 400: Subject doesn't exist for the given class
    - 422: Invalid file format or missing parameters
    - 500: Error processing the PDF
    """
    temp_file_path = None
    _reject_punjab_board(board)
    
    try:
        # Validate file type (mobile clients may send empty filename; extension enforced on content-type + our processor)
        safe_name = (file.filename or "").strip()
        if safe_name and not safe_name.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=422,
                detail="File must be a PDF. Please upload a valid PDF file."
            )

        logger.info("Received upload request for %s", safe_name or "(no filename)")

        # Create upload request
        upload_request = PastPaperUploadRequest(
            class_level=class_level,
            board=board,
            subject_name=subject_name,
            year=year,
            publish_for_students=publish_for_students,
        )

        # Save uploaded file to temporary location
        logger.info("Saving uploaded file...")
        temp_file_path = PastPaperUploadService.save_uploaded_file(file)

        # Process the past paper
        logger.info(f"Processing past paper: {upload_request.subject_name} (Class {upload_request.class_level})")
        result = await PastPaperUploadService.process_past_paper_pdf(
            db,
            temp_file_path,
            upload_request
        )

        logger.info(f"Successfully processed past paper with {result['total_questions']} questions")
        return result

    except ValueError as e:
        # Validation errors (e.g., subject not found)
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error uploading past paper: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing past paper: {str(e)}"
        )

    finally:
        # Clean up temporary file
        if temp_file_path:
            PastPaperUploadService.cleanup_temp_file(temp_file_path)


@router.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "past_paper_upload"}


@router.post(
    "/library/upload",
    response_model=PastPaperUploadResponse,
    responses={
        400: {"model": ValidationError, "description": "Validation error"},
        403: {"description": "Forbidden - Admin access required"},
        422: {"model": ValidationError, "description": "Invalid file or data"},
        500: {"model": ValidationError, "description": "Server error"},
    },
)
async def upload_past_paper_pdf_library_only(
    file: UploadFile = File(..., description="Past paper PDF (stored like student library books — no extraction)"),
    class_level: str = Form(..., description="Class level (9, 10, 11, 12)"),
    board: str = Form(..., description="Board name (e.g. FBISE)"),
    subject_name: str = Form(..., description="Subject name matching catalog"),
    year: int = Form(..., description="Year of the past paper"),
    publish_for_students: bool = Form(
        False,
        description="If true, students see this paper immediately under Past papers.",
    ),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """
    **Fast path** — same PDF validation and disk streaming as `POST /admin/books/library/upload`.
    Creates a past paper with the original PDF only (no OCR / question extraction).
    Use `POST /past-papers/upload` when you need extracted practice questions.
    """
    _reject_punjab_board(board)
    try:
        return await PastPaperUploadService.register_past_paper_pdf_only(
            db,
            file,
            class_level=class_level,
            board=board,
            subject_name=subject_name,
            year=year,
            publish_for_students=publish_for_students,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Library past paper upload failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post(
    "/upload-multiple",
    response_model=BulkPastPaperUploadResponse,
    responses={
        400: {"model": ValidationError, "description": "Validation error"},
        403: {"description": "Forbidden - Admin access required"},
        422: {"model": ValidationError, "description": "Invalid file or data"},
        500: {"model": ValidationError, "description": "Server error"}
    },
)
async def upload_multiple_past_papers(
    files: List[UploadFile] = File(..., description="One or more past paper PDF files"),
    class_level: str = Form(..., description="Class level (9, 10, 11, 12)"),
    board: str = Form(..., description="Board name (FBISE, Punjab, Sindh, etc.)"),
    subject_name: str = Form(..., description="Subject name (Biology, Physics, Chemistry, Mathematics, etc.)"),
    year: int = Form(..., description="Year of the past papers"),
    publish_for_students: bool = Form(
        True,
        description="If true (default), each uploaded paper is published for students. Set false for drafts.",
    ),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """
    Upload multiple past paper PDFs in a single request.

    ADMIN ONLY. Processes each PDF independently and returns per-file success/failure.
    """
    if not files:
        raise HTTPException(status_code=422, detail="No files were provided")
    _reject_punjab_board(board)

    upload_request = PastPaperUploadRequest(
        class_level=class_level,
        board=board,
        subject_name=subject_name,
        year=year,
        publish_for_students=publish_for_students,
    )

    uploaded_count = 0
    failed_count = 0
    results = []

    for file in files:
        temp_file_path = None
        try:
            if not (file.filename or "").lower().endswith(".pdf"):
                raise ValueError("File must be a PDF")

            temp_file_path = PastPaperUploadService.save_uploaded_file(file)
            result = await PastPaperUploadService.process_past_paper_pdf(
                db,
                temp_file_path,
                upload_request,
            )

            uploaded_count += 1
            results.append(
                {
                    "filename": file.filename,
                    "status": "success",
                    "paper_id": result.get("paper_id"),
                    "total_questions": result.get("total_questions", 0),
                    "mcqs": result.get("mcqs", 0),
                    "short_questions": result.get("short_questions", 0),
                    "long_questions": result.get("long_questions", 0),
                    "is_published": bool(result.get("is_published", False)),
                }
            )
        except Exception as e:
            failed_count += 1
            results.append(
                {
                    "filename": file.filename,
                    "status": "failed",
                    "error": str(e),
                }
            )
        finally:
            if temp_file_path:
                PastPaperUploadService.cleanup_temp_file(temp_file_path)

    return BulkPastPaperUploadResponse(
        uploaded_count=uploaded_count,
        failed_count=failed_count,
        results=results,
    )


async def _run_bulk_upload_job(
    job_id: str,
    files: List[UploadFile],
    class_level: str,
    board: str,
    subject_name: str,
    year: int,
    publish_for_students: bool = True,
):
    upload_request = PastPaperUploadRequest(
        class_level=class_level,
        board=board,
        subject_name=subject_name,
        year=year,
        publish_for_students=publish_for_students,
    )

    uploaded_count = 0
    failed_count = 0
    results = []
    total = len(files)

    UPLOAD_JOBS[job_id].update(
        {
            "status": "processing",
            "uploaded_count": 0,
            "failed_count": 0,
            "total_files": total,
            "progress_percentage": 0,
        }
    )

    async with AsyncSessionLocal() as db:
        for i, file in enumerate(files, start=1):
            temp_file_path = None
            try:
                if not (file.filename or "").lower().endswith(".pdf"):
                    raise ValueError("File must be a PDF")

                temp_file_path = PastPaperUploadService.save_uploaded_file(file)
                result = await PastPaperUploadService.process_past_paper_pdf(
                    db,
                    temp_file_path,
                    upload_request,
                )

                uploaded_count += 1
                results.append(
                    {
                        "filename": file.filename,
                        "status": "success",
                        "paper_id": result.get("paper_id"),
                        "total_questions": result.get("total_questions", 0),
                        "mcqs": result.get("mcqs", 0),
                        "short_questions": result.get("short_questions", 0),
                        "long_questions": result.get("long_questions", 0),
                        "is_published": bool(result.get("is_published", False)),
                    }
                )
            except Exception as e:
                failed_count += 1
                results.append(
                    {
                        "filename": file.filename,
                        "status": "failed",
                        "error": str(e),
                    }
                )
            finally:
                if temp_file_path:
                    PastPaperUploadService.cleanup_temp_file(temp_file_path)

                UPLOAD_JOBS[job_id].update(
                    {
                        "uploaded_count": uploaded_count,
                        "failed_count": failed_count,
                        "progress_percentage": int((i / max(total, 1)) * 100),
                        "results": results,
                    }
                )

    UPLOAD_JOBS[job_id]["status"] = "completed"


@router.post("/upload-multiple/start")
async def start_bulk_upload_past_papers(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(..., description="One or more past paper PDF files"),
    class_level: str = Form(..., description="Class level (9, 10, 11, 12)"),
    board: str = Form(..., description="Board name (FBISE, Punjab, Sindh, etc.)"),
    subject_name: str = Form(..., description="Subject name (Biology, Physics, Chemistry, Mathematics, etc.)"),
    year: int = Form(..., description="Year of the past papers"),
    publish_for_students: bool = Form(False, description="Publish each file for students immediately."),
    admin_user: User = Depends(require_admin),
):
    """
    Start a background bulk upload and return a job_id for progress tracking.
    """
    if not files:
        raise HTTPException(status_code=422, detail="No files were provided")
    _reject_punjab_board(board)

    job_id = str(uuid4())
    UPLOAD_JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "uploaded_count": 0,
        "failed_count": 0,
        "total_files": len(files),
        "progress_percentage": 0,
        "results": [],
    }

    background_tasks.add_task(
        _run_bulk_upload_job,
        job_id,
        files,
        class_level,
        board,
        subject_name,
        year,
        publish_for_students,
    )

    return {"job_id": job_id, "status": "queued", "total_files": len(files)}


@router.get("/upload-multiple/status/{job_id}")
async def get_bulk_upload_status(
    job_id: str,
    admin_user: User = Depends(require_admin),
):
    """Get bulk upload job status/progress by job_id."""
    job = UPLOAD_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job ID not found")
    return job
