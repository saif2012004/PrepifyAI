"""Legacy alias: same router as `books` for backward-compatible /textbooks URLs."""

from app.routes.books import router

__all__ = ["router"]
