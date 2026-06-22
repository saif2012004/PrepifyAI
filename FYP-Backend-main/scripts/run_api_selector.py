"""
Windows + Python 3.12+ entrypoint that FORCES a SelectorEventLoop for Uvicorn.

On Windows the default ProactorEventLoop breaks psycopg async (SQLAlchemy), so every
DB request fails with InterfaceError. Setting the event-loop *policy* is no longer
enough on newer Python (it is deprecated and Uvicorn may not pick it up), so we build
the SelectorEventLoop ourselves and run the server on it.

Usage (from FYP-Backend-main):
  python scripts/run_api_selector.py
Env overrides: UVICORN_HOST (default 0.0.0.0), UVICORN_PORT (default 8001)
"""
from __future__ import annotations

import asyncio
import os
import selectors
import sys

# Ensure the backend root (which contains the ``app`` package) is importable,
# regardless of the directory this script is launched from.
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)


def main() -> None:
    host = os.environ.get("UVICORN_HOST", "0.0.0.0")
    port = int(os.environ.get("UVICORN_PORT", "8001"))

    import uvicorn

    config = uvicorn.Config("app.main:app", host=host, port=port, log_level="info")
    server = uvicorn.Server(config)

    if os.name == "nt":
        loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
        asyncio.set_event_loop(loop)
        loop.run_until_complete(server.serve())
    else:
        asyncio.run(server.serve())


if __name__ == "__main__":
    main()
