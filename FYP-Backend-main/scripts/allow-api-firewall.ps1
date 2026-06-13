# Run in PowerShell AS ADMINISTRATOR once (allows Android emulator -> host API on port 8001).
# If you use another port, change LocalPort below to match EXPO_PUBLIC_API_PORT.
#
# Uses Private, Domain, AND Public profiles: Wi‑Fi is often classified as Public, and emulator
# traffic can be evaluated differently than browser traffic to 127.0.0.1.

$port = 8001
$ruleName = "PrepifyAI API dev (TCP $port)"
$profiles = "Private", "Domain", "Public"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Re-run this script in an elevated PowerShell (Run as administrator)." -ForegroundColor Yellow
  exit 1
}

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Action Allow -Profile $profiles
  Write-Host "Updated existing rule: $ruleName (profiles: $($profiles -join ', '))." -ForegroundColor Green
  exit 0
}

New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile $profiles | Out-Null
Write-Host "Created firewall rule: $ruleName (profiles: $($profiles -join ', '))." -ForegroundColor Green
Write-Host "Retry login from the Android emulator."
