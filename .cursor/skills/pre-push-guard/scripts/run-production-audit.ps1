# Vivid Doctor — full production readiness audit before git push.
# Writes: .cursor/local/pre-push-guard/last-run-report.md
# Exit 0 = VERDICT: SAFE | Exit 1 = VERDICT: BLOCKED
$ErrorActionPreference = "Continue"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
Set-Location $repoRoot

$reportDir = Join-Path $repoRoot ".cursor\local\pre-push-guard"
$reportPath = Join-Path $reportDir "last-run-report.md"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$py = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }

$results = [System.Collections.Generic.List[object]]::new()
$p0 = 0
$p1 = 0

function Add-Result($id, $name, $status, $detail, [bool]$isP0 = $false) {
  if ($status -eq "FAIL" -and $isP0) { $script:p0++ }
  elseif ($status -eq "FAIL") { $script:p1++ }
  $script:results.Add([pscustomobject]@{ Id = $id; Name = $name; Status = $status; Detail = $detail })
}

# --- RL: Rate limiting ---
try {
  $rl = & $py -c "from middleware.rate_limit import rate_limit_enabled; print('on' if rate_limit_enabled() else 'off')" 2>&1
  if ($rl -match "on") { Add-Result "RL" "Rate limiting enabled" "PASS" "rate_limit_enabled()=True" $true }
  else { Add-Result "RL" "Rate limiting enabled" "FAIL" "RATE_LIMIT_ENABLED is off" $true }
} catch {
  Add-Result "RL" "Rate limiting enabled" "FAIL" $_.Exception.Message $true
}

# --- SEC: Secrets in diff ---
$badPatterns = @(
  '\.env$',
  'web/\.env\.local',
  'password\s*=\s*["''][^"''\s]{6,}',
  'api[_-]?key\s*=\s*["''][^"''\s]{8,}',
  'BEGIN (RSA |OPENSSH )?PRIVATE KEY'
)
$diffFiles = @()
$diffFiles += (git diff --name-only 2>$null)
$diffFiles += (git diff --cached --name-only 2>$null)
$diffFiles = $diffFiles | Where-Object { $_ } | Select-Object -Unique
$secretHit = $false
$secretDetail = ""
foreach ($f in $diffFiles) {
  if ($f -match '\.env$' -or $f -match '\.env\.local' -or $f -match '__pycache__' -or $f -match '\.next/') {
    $secretHit = $true
    $secretDetail += "Staged/sensitive path: $f; "
  }
}
$diffText = (git diff 2>$null) + (git diff --cached 2>$null)
foreach ($pat in $badPatterns) {
  if ($diffText -match $pat) { $secretHit = $true; $secretDetail += "Pattern $pat; " }
}
if ($secretHit) { Add-Result "SEC" "No secrets in diff" "FAIL" $secretDetail.Trim() $true }
else { Add-Result "SEC" "No secrets in diff" "PASS" "No .env or key patterns in diff" $true }

# --- GIT: Hygiene ---
$stagedBad = $diffFiles | Where-Object { $_ -match '__pycache__|\.pyc$|web/\.next/' }
if ($stagedBad) { Add-Result "GIT" "Git hygiene" "FAIL" ($stagedBad -join ", ") $true }
else { Add-Result "GIT" "Git hygiene" "PASS" "No build artifacts in diff" $true }

# --- BE-IMP ---
Push-Location (Join-Path $repoRoot "backend")
try {
  $imp = & $py -c "from main import app; print(len(app.user_middleware))" 2>&1
  if ($LASTEXITCODE -eq 0) { Add-Result "BE-IMP" "FastAPI import" "PASS" "middleware count: $imp" $true }
  else { Add-Result "BE-IMP" "FastAPI import" "FAIL" ($imp -join "`n") $true }
} catch {
  Add-Result "BE-IMP" "FastAPI import" "FAIL" $_.Exception.Message $true
}

# --- BE-TEST ---
try {
  $testOut = & $py -m pytest tests/ -q --tb=no 2>&1
  $testExit = $LASTEXITCODE
  $summary = ($testOut | Select-Object -Last 3) -join " "
  if ($testExit -eq 0) { Add-Result "BE-TEST" "Backend pytest" "PASS" $summary $true }
  else { Add-Result "BE-TEST" "Backend pytest" "FAIL" $summary $true }
} catch {
  Add-Result "BE-TEST" "Backend pytest" "FAIL" $_.Exception.Message $true
}
Pop-Location

# --- FE-BUILD ---
Push-Location (Join-Path $repoRoot "web")
try {
  Write-Host "Running npm run build (may take 1-3 min)..."
  $buildOut = & npm run build 2>&1
  $buildExit = $LASTEXITCODE
  if ($buildExit -eq 0) { Add-Result "FE-BUILD" "Next.js production build" "PASS" "build completed" $true }
  else {
    $tail = ($buildOut | Select-Object -Last 15) -join "`n"
    Add-Result "FE-BUILD" "Next.js production build" "FAIL" $tail $true
  }
} catch {
  Add-Result "FE-BUILD" "Next.js production build" "FAIL" $_.Exception.Message $true
}
Pop-Location

# --- FE-LINT (P1 only) ---
Push-Location (Join-Path $repoRoot "web")
try {
  $lintOut = & npm run lint 2>&1
  if ($LASTEXITCODE -eq 0) { Add-Result "FE-LINT" "ESLint" "PASS" "clean" $false }
  else {
    $tail = ($lintOut | Select-Object -Last 8) -join "`n"
    Add-Result "FE-LINT" "ESLint" "WARN" "lint debt (P1): $tail" $false
  }
} catch {
  Add-Result "FE-LINT" "ESLint" "WARN" $_.Exception.Message $false
}
Pop-Location

# --- Report ---
$branch = git rev-parse --abbrev-ref HEAD 2>$null
$sha = git rev-parse --short HEAD 2>$null
$verdict = if ($p0 -eq 0) { "SAFE" } else { "BLOCKED" }
$when = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$md = @"
# Vivid Doctor - Production Audit Report

- **When:** $when
- **Branch:** $branch @ $sha
- **P0 failures:** $p0
- **Other failures/warnings:** $p1

## VERDICT: $verdict

| ID | Check | Status | Detail |
|----|-------|--------|--------|
"@

foreach ($r in $results) {
  $d = ($r.Detail -replace '\|', '/' -replace "`r?`n", ' ').Substring(0, [Math]::Min(200, [Math]::Max(0, ($r.Detail -replace '\|','/').Length)))
  if ($r.Detail.Length -gt 200) { $d += "…" }
  $md += "| $($r.Id) | $($r.Name) | $($r.Status) | $d |`n"
}

$md += @"

## Push rule

- **VERDICT: SAFE** - agent may git push
- **VERDICT: BLOCKED** - fix P0 rows, re-run audit, update memory.md

"@

Set-Content -Path $reportPath -Value $md -Encoding UTF8
Write-Host ""
Write-Host "Report: $reportPath"
Write-Host "VERDICT: $verdict (P0 failures: $p0)"
Write-Host ""

foreach ($r in $results) {
  $color = switch ($r.Status) { "PASS" { "Green" } "FAIL" { "Red" } default { "Yellow" } }
  Write-Host "[$($r.Status)] $($r.Id) $($r.Name)" -ForegroundColor $color
}

if ($p0 -gt 0) { exit 1 }
exit 0
