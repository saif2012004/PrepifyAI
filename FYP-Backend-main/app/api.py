from fastapi import APIRouter
from app.routes import (
    auth,
    users,
    subjects,
    past_paper_question,
    past_paper,
    past_paper_upload,
    predictions,
    q,
    analyzer,
    chatbot,
    gamification,
)

api_router = APIRouter()
# Tags match how they appear in /docs (authentication, users, subjects, past paper questions, past papers, question generation, prediction, analyzer)
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(subjects.router, prefix="/subjects", tags=["subjects"])
api_router.include_router(past_paper_question.router, prefix="/past-paper-questions", tags=["past paper questions"])
api_router.include_router(past_paper_upload.router, prefix="/past-papers", tags=["past papers"])
api_router.include_router(past_paper.router, prefix="/past-papers/manage", tags=["past papers"])
api_router.include_router(predictions.router, prefix="/predictions", tags=["prediction"])
api_router.include_router(q.router, prefix="/questions", tags=["question generation"])
api_router.include_router(analyzer.router, prefix="/analyzer", tags=["analyzer"])
api_router.include_router(chatbot.router, prefix="/chatbot", tags=["chatbot"])
api_router.include_router(gamification.router, prefix="/gamification", tags=["gamification"])