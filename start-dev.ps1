# PrepifyAI — start backend + Expo in parallel (two windows).
# Prefer Command Prompt? Use:  start-dev.cmd  (same folder).
# PowerShell usage: powershell -ExecutionPolicy Bypass -File .\start-dev.ps1

$root = $PSScriptRoot
$backend = Join-Path $root "FYP-Backend-main"
$frontend = Join-Path $root "FYP_FRONTEND-main"

if (-not (Test-Path $backend)) {
    Write-Host "Missing folder: $backend" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $frontend)) {
    Write-Host "Missing folder: $frontend" -ForegroundColor Red
    exit 1
}

Write-Host "Starting Docker (Postgres + Redis)…" -ForegroundColor Cyan
Push-Location $root
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker compose exited with code $LASTEXITCODE — check Docker Desktop and: docker compose ps" -ForegroundColor Yellow
}
Pop-Location

$py = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "No venv at $py — create venv and pip install -r app\requirements.txt first." -ForegroundColor Red
    exit 1
}

# If uvicorn fails with WinError 10013 on :8000, use another port, e.g.:
#   $env:API_PORT = "8001"; $env:EXPO_PUBLIC_API_PORT = "8001"; .\start-dev.ps1
$apiPort = "8000"
if ($env:API_PORT -and $env:API_PORT.Trim() -ne "") {
    $apiPort = $env:API_PORT.Trim()
}

$backendCmd = "cd `"$backend`"; `"$py`" -m uvicorn app.main:app --host 0.0.0.0 --port $apiPort --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# Same LAN IP for iPhone / physical Android when Metro does not embed a usable host (optional override: $env:EXPO_PUBLIC_DEV_LAN_HOST)
$lanHost = $null
if ($env:EXPO_PUBLIC_DEV_LAN_HOST -and $env:EXPO_PUBLIC_DEV_LAN_HOST.Trim() -ne "") {
    $lanHost = $env:EXPO_PUBLIC_DEV_LAN_HOST.Trim()
} else {
    try {
        $iface = Get-NetIPConfiguration |
            Where-Object { $null -ne $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } |
            Select-Object -First 1
        if ($iface) {
            $v4 = $iface.IPv4Address
            if ($v4 -is [array] -and $v4.Count -gt 0) { $v4 = $v4[0] }
            $lanHost = if ($null -ne $v4 -and $v4.IPAddress) { [string]$v4.IPAddress } else { $null }
        }
    } catch {
        $lanHost = $null
    }
}

$frontCmd = "cd `"$frontend`"; `$env:EXPO_PUBLIC_API_PORT='$apiPort'"
if ($lanHost) {
    $frontCmd += "; `$env:EXPO_PUBLIC_DEV_LAN_HOST='$lanHost'"
}
$frontCmd += "; if (-not (Test-Path node_modules)) { npm install }; npx expo start"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontCmd

Write-Host ""
Write-Host "Opened two windows: API :$apiPort and Expo (Metro)." -ForegroundColor Green
Write-Host "  API docs: http://localhost:${apiPort}/docs" -ForegroundColor Gray
Write-Host "  Phone/Expo: EXPO_PUBLIC_API_PORT=$apiPort; dev LAN host set for native fallback when needed." -ForegroundColor Gray
if ($lanHost) {
    Write-Host "  Detected LAN IP: $lanHost (use for API URL fallback on device)." -ForegroundColor DarkGray
}
Write-Host "  Tip: iOS Simulator uses localhost mapping; Android Emulator uses 10.0.2.2 (handled in api.ts)." -ForegroundColor DarkGray
Write-Host "  If you prefer port 8000: run script as  `$env:API_PORT='8000'; .\start-dev.ps1" -ForegroundColor DarkGray
Write-Host "  Expo:     http://localhost:8081" -ForegroundColor Gray
