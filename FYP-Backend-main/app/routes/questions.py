"""
Question Generation Routes
Legacy endpoints (generate, generate-exam, answer, get question, get questions) removed.
Use app.routes.q for: POST generate-questions/, POST submit-answer/.
"""

from fastapi import APIRouter

router = APIRouter()
