@echo off
setlocal EnableExtensions

rem PrepifyAI — Docker + API + Expo (Command Prompt only, no PowerShell).
rem Usage: double-click, or from cmd:
rem   cd /d c:\Users\user\Desktop\Complete_FYP
rem   start-dev.cmd
rem Optional custom API port (if :8000 is blocked):
rem   set API_PORT=8001
rem   start-dev.cmd

set "ROOT=%~dp0"

if not exist "%ROOT%FYP-Backend-main\" (
  echo Missing folder: "%ROOT%FYP-Backend-main"
  exit /b 1
)
if not exist "%ROOT%FYP_FRONTEND-main\" (
  echo Missing folder: "%ROOT%FYP_FRONTEND-main"
  exit /b 1
)
if not exist "%ROOT%FYP-Backend-main\.venv\Scripts\python.exe" (
  echo No venv. Create:  cd /d "%ROOT%FYP-Backend-main" ^& python -m venv .venv
  echo Then:  .venv\Scripts\python.exe -m pip install -r app\requirements.txt
  exit /b 1
)

if "%API_PORT%"=="" set "API_PORT=8000"

echo Starting Docker (Postgres + Redis^)...
pushd "%ROOT%"
docker compose up -d
popd

start "PrepifyAI API" /D "%ROOT%FYP-Backend-main" cmd /k ".\.venv\Scripts\python.exe app\init_db_docker.py && .\.venv\Scripts\python.exe -c ""import asyncio; asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy()); import uvicorn; uvicorn.run('app.main:app', host='0.0.0.0', port=%API_PORT%, reload=True)"""

start "PrepifyAI Expo" /D "%ROOT%FYP_FRONTEND-main" cmd /k "set EXPO_PUBLIC_API_PORT=%API_PORT% && if not exist node_modules npm install && npx expo start"

echo.
echo Opened two windows: API port %API_PORT% and Expo (Metro^).
echo   API docs: http://localhost:%API_PORT%/docs
echo   Expo:     http://localhost:8081
endlocal
