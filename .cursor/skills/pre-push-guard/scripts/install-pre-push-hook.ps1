# Install git pre-push hook that runs Vivid Doctor audit (blocks push on P0).
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$hookPath = Join-Path $repoRoot ".git\hooks\pre-push"
$auditScript = Join-Path $repoRoot ".cursor\skills\pre-push-guard\scripts\run-production-audit.ps1"
$auditWin = $auditScript -replace '\\', '/'

$hook = @"
#!/bin/sh
echo "=== HRIS Pre-Push Guard (Vivid Doctor) ==="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$auditWin"
code=`$?
if [ `$code -ne 0 ]; then
  echo ""
  echo "PUSH BLOCKED: Fix P0 in .cursor/local/pre-push-guard/last-run-report.md"
  exit 1
fi
exit 0
"@

# LF line endings required for git sh hooks on Windows
$hook = $hook -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($hookPath, $hook, [System.Text.UTF8Encoding]::new($false))
Write-Host "Installed: $hookPath"
Write-Host "Every git push will run run-production-audit.ps1 first."
