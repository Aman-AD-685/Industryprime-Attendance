# Collect git scope for pre-push review (run from repo root).
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
Set-Location $repoRoot

Write-Host "=== PRE-PUSH SCOPE ==="
Write-Host "Repo: $repoRoot"
Write-Host "When: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

$branch = git rev-parse --abbrev-ref HEAD 2>$null
Write-Host "Branch: $branch"

$upstream = git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Tracking: $upstream"
  $ahead = git rev-list --count "$upstream..HEAD" 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Host "Commits ahead of upstream: $ahead" }
} else {
  Write-Host "Tracking: (none)"
}

Write-Host ""
Write-Host "--- git status ---"
git status

Write-Host ""
Write-Host "--- diff stat (unstaged + staged) ---"
git diff --stat
git diff --cached --stat

Write-Host ""
Write-Host "--- recent commits ---"
git log -8 --oneline

if ($upstream) {
  Write-Host ""
  Write-Host "--- commits not on upstream ---"
  git log "$upstream..HEAD" --oneline 2>$null
}
