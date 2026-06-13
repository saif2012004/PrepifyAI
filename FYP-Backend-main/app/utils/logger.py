"""Centralized logger factory for consistent naming across question-generation modules."""

from __future__ import annotations

import logging


def get_logger(name: str) -> logging.Logger:
    """
    Return a module logger. Does not configure root logging (uvicorn/app already do).

    Use dotted names, e.g. ``get_logger(__name__)`` or ``get_logger("app.services.question_generator")``.
    """
    return logging.getLogger(name)
