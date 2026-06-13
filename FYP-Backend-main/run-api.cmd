@echo off
REM Start API from repo root so "import app.*" works. Do NOT run "uvicorn main:app" from inside app\.
REM Always use the project venv (avoid system Python 3.13 + old SQLAlchemy crash).
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Create venv first: py -3.12 -m venv .venv
  echo Then: .venv\Scripts\python.exe -m pip install -r app\requirements.txt
  exit /b 1
)
REM Windows + psycopg async: policy must run before uvicorn's asyncio.run (see scripts/run_api_windows.py).
".venv\Scripts\python.exe" scripts\run_api_windows.py app.main:app --host 0.0.0.0 --port 8000 --reload
