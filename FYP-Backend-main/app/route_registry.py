"""
Register all API routers on the FastAPI app.
Use this so /docs always shows: authentication, users, subjects, past papers, questions, predictions (incl. accuracy), adaptive, trends, admin tools, etc.
"""
from fastapi import FastAPI
from app.core.config import settings
from app.routes import (
    admin_dashboard,
    auth,
    users,
    subjects,
    past_paper_question,
    past_paper_upload,
    past_paper,
    predictions,
    q,
    analyzer,
    performance,
    adaptive,
    trends,
    sync,
    chatbot,
    gamification,
    admin_questions,
    admin_textbooks,
    admin_books,
    books,
    textbooks,
    feedback_route,
)

PREFIX = settings.API_V1_STR

ROUTERS = [
    (admin_dashboard.router, f"{PREFIX}/admin/dashboard", "admin dashboard"),
    (auth.router, f"{PREFIX}/auth", "authentication"),
    (users.router, f"{PREFIX}/users", "users"),
    (subjects.router, f"{PREFIX}/subjects", "subjects"),
    (past_paper_question.router, f"{PREFIX}/past-paper-questions", "past paper questions"),
    (past_paper_upload.router, f"{PREFIX}/past-papers", "past papers (upload & list)"),
    (past_paper.router, f"{PREFIX}/past-papers/manage", "past papers (admin manage)"),
    (predictions.router, f"{PREFIX}/predictions", "prediction"),
    (q.router, f"{PREFIX}/questions", "question generation"),
    (performance.router, f"{PREFIX}/performance", "performance"),
    (adaptive.router, f"{PREFIX}/adaptive", "adaptive"),
    (trends.router, f"{PREFIX}/trends", "trends"),
    (sync.router, f"{PREFIX}/sync", "sync"),
    (analyzer.router, f"{PREFIX}/analyzer", "analyzer"),
    (chatbot.router, f"{PREFIX}/chatbot", "chatbot"),
    (gamification.router, f"{PREFIX}/gamification", "gamification"),
    (books.router, f"{PREFIX}/books", "books (library PDFs + chunks)"),
    (textbooks.router, f"{PREFIX}/textbooks", "textbooks (legacy alias → same as books)"),
    (admin_books.router, f"{PREFIX}/admin/books", "admin books (library PDFs)"),
    (admin_books.router, f"{PREFIX}/admin/textbooks", "admin books (legacy alias)"),
    (admin_questions.router, f"{PREFIX}/admin/questions", "admin questions"),
    (admin_textbooks.router, f"{PREFIX}/admin/textbook-chunks", "admin textbook chunks (RAG)"),
    (feedback_route.router, f"{PREFIX}/feedback", "feedback"),
]


def register_all_routes(app: FastAPI) -> None:
    for router, path_prefix, tag in ROUTERS:
        app.include_router(router, prefix=path_prefix, tags=[tag])
