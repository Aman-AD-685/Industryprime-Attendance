param(
  [Parameter(Mandatory = $true)]
  [string]$Section,
  [Parameter(Mandatory = $true)]
  [string]$Message
)

$ErrorActionPreference = "Stop"
$journalDir = (Resolve-Path (Join-Path $PSScriptRoot "..\daily-journal")).Path
$date = Get-Date -Format "yyyy-MM-dd"
$file = Join-Path $journalDir "$date.md"

if (-not (Test-Path $journalDir)) {
  New-Item -ItemType Directory -Path $journalDir -Force | Out-Null
}

$timestamp = Get-Date -Format "HH:mm"
$line = "- **$timestamp** — $Message"

if (-not (Test-Path $file)) {
  @"
# Daily journal — $date

## Work completed

## Git activity

## Pre-push verdicts

## User feedback

## Notes

"@ | Set-Content -Path $file -Encoding UTF8
}

$content = Get-Content -Path $file -Raw -Encoding UTF8
$header = "## $Section"
if ($content -notmatch [regex]::Escape($header)) {
  Add-Content -Path $file -Value "`n$header`n" -Encoding UTF8
}

# Append under section (simple: append before next ## or at end)
$pattern = "(?s)(## $([regex]::Escape($Section))\r?\n)(.*?)(?=\r?\n## |\z)"
if ($content -match $pattern) {
  $newBlock = $Matches[1] + $Matches[2].TrimEnd() + "`n$line`n"
  $content = $content -replace $pattern, $newBlock
  Set-Content -Path $file -Value $content.TrimEnd() -Encoding UTF8
} else {
  Add-Content -Path $file -Value "$line" -Encoding UTF8
}

Write-Host "Appended to $file under '$Section'"
