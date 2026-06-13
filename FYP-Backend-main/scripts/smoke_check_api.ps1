$ErrorActionPreference = "Stop"

Write-Host "PrepifyAI smoke check starting..." -ForegroundColor Cyan

# Ensure we run from backend root
$backendRoot = Split-Path -Parent $PSScriptRoot
Set-Location $backendRoot

# Activate virtual environment
$venvActivate = Join-Path $backendRoot "venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvActivate)) {
    throw "Virtual environment not found at: $venvActivate"
}
. $venvActivate

$loginBody = @{
    email    = "admin@prepifyai.com"
    password = "admin123"
} | ConvertTo-Json

Write-Host "1) Testing login endpoint..." -ForegroundColor Yellow
$loginRes = Invoke-RestMethod `
    -Uri "http://127.0.0.1:8000/api/v1/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $loginBody `
    -TimeoutSec 40

if (-not $loginRes.access_token) {
    throw "Login failed: no access_token returned."
}

Write-Host "   Login OK" -ForegroundColor Green

$topic = "Smoke Test " + (Get-Date -Format "HHmmss")
$genBody = @{
    board         = "FBISE"
    class_level   = "9"
    subject       = "Physics"
    topic         = $topic
    difficulty    = "medium"
    qtype         = "MCQ"
    exam_type     = "board"
    num_questions = 2
} | ConvertTo-Json

Write-Host "2) Testing question generation endpoint..." -ForegroundColor Yellow
$genRes = Invoke-RestMethod `
    -Uri "http://127.0.0.1:8000/api/v1/questions/generate-questions/" `
    -Method Post `
    -ContentType "application/json" `
    -Body $genBody `
    -TimeoutSec 240

$count = @($genRes.questions).Count
Write-Host "   Generation OK: $count question(s) returned" -ForegroundColor Green

if ($count -gt 0) {
    Write-Host "   First question_id: $($genRes.questions[0].question_id)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Smoke check completed successfully." -ForegroundColor Cyan
