"""
Windows entrypoint for Uvicorn: set Selector event-loop policy *before* Uvicorn calls asyncio.run().

Without this, Python 3.8+ defaults to Proactor on Windows while psycopg async + SQLAlchemy require
Selector — every DB request fails with InterfaceError (login/delete/upload all appear "broken").

Usage (from FYP-Backend-main, with venv active):
  python scripts/run_api_windows.py app.main:app --host 0.0.0.0 --port 8001 --reload
"""
from __future__ import annotations

import asyncio
import sys


def _ensure_selector_loop_policy() -> None:
    if sys.platform != "win32":
        return
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass


if __name__ == "__main__":
    _ensure_selector_loop_policy()
    from uvicorn.main import main as uvicorn_main

    # Uvicorn's Click CLI expects argv[0] to be "uvicorn"; keep all args after this script.
    sys.argv = ["uvicorn", *sys.argv[1:]]
    uvicorn_main()
