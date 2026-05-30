# Git summary for today's journal context.
$ErrorActionPreference = "Continue"
$repoRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $repoRoot ".git"))) {
  Write-Host "Run from HRIS-APP repo root."
  exit 1
}

$today = Get-Date -Format "yyyy-MM-dd"
Write-Host "=== Git day summary — $today ==="
Write-Host ""

Write-Host "--- commits today (all branches) ---"
git log --since="midnight" --oneline --all 2>$null

Write-Host ""
Write-Host "--- files changed today (last 20 commits) ---"
git log --since="midnight" --name-only --pretty=format: --all 2>$null |
  Where-Object { $_ -and $_.Trim() } |
  Sort-Object -Unique |
  Select-Object -First 80
