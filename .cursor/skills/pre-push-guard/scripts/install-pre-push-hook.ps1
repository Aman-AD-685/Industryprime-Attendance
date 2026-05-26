# Install git pre-push hook that runs Vivid Doctor audit (blocks push on P0).
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$hookPath = Join-Path $repoRoot ".git\hooks\pre-push"
$auditScript = Join-Path $repoRoot ".cursor\skills\pre-push-guard\scripts\run-production-audit.ps1"

$hook = @"
#!/bin/sh
# HRIS pre-push guard — auto-installed by install-pre-push-hook.ps1
echo "=== HRIS Pre-Push Guard (Vivid Doctor) ==="
powershell -NoProfile -ExecutionPolicy Bypass -File "$($auditScript -replace '\\','/')"
code=`$?
if [ `$code -ne 0 ]; then
  echo ""
  echo "PUSH BLOCKED: Fix P0 issues in .cursor/local/pre-push-guard/last-run-report.md"
  echo "Override: push despite critical: <reason> (tell Cursor agent)"
  exit 1
fi
exit 0
"@

Set-Content -Path $hookPath -Value $hook -Encoding UTF8 -NoNewline
Write-Host "Installed: $hookPath"
Write-Host "Every git push will run run-production-audit.ps1 first."
