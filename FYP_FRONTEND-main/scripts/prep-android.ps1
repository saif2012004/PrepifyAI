# Fixes a broken ANDROID_HOME like the literal string "$env:LOCALAPPDATA\Android\Sdk"
# (PowerShell syntax pasted into Windows Environment Variables by mistake).
# Then runs Expo for Android if adb exists.

$ErrorActionPreference = "Stop"

$sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$adb = Join-Path $sdkRoot "platform-tools\adb.exe"

$badHome = $env:ANDROID_HOME
if ($badHome -match '\$env:' -or ($badHome -and -not (Test-Path $badHome))) {
  Write-Host ""
  Write-Host "[prep-android] ANDROID_HOME is invalid or missing:" -ForegroundColor Yellow
  Write-Host "  $badHome"
  Write-Host "  Fix: Win+R -> sysdm.cpl -> Advanced -> Environment Variables"
  Write-Host "  Set ANDROID_HOME (and ANDROID_SDK_ROOT) to the real folder, e.g."
  Write-Host "  $sdkRoot"
  Write-Host ""
}

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$(Join-Path $sdkRoot 'platform-tools');$(Join-Path $sdkRoot 'emulator');$env:Path"

if (-not (Test-Path $sdkRoot)) {
  Write-Host "[prep-android] Android SDK not found at:" -ForegroundColor Red
  Write-Host "  $sdkRoot"
  Write-Host ""
  Write-Host "Install Android Studio, open SDK Manager, install Android SDK Platform-Tools."
  Write-Host "Then run: npm run android:win"
  exit 1
}

if (-not (Test-Path $adb)) {
  Write-Host "[prep-android] adb.exe missing. Install SDK Platform-Tools in Android Studio." -ForegroundColor Red
  Write-Host "  Expected: $adb"
  exit 1
}

Write-Host "[prep-android] Using ANDROID_HOME=$sdkRoot" -ForegroundColor Green
Set-Location $PSScriptRoot\..

& npx --yes expo start --android
