# Report whether Compound Engineering ce-code-review is likely available.
$ceCache = Join-Path $env:USERPROFILE ".cursor\plugins\cache\cursor-public"
$enabled = $false
$note = "Compound Engineering plugin cache not found under $ceCache"

if (Test-Path $ceCache) {
  $dirs = Get-ChildItem -Path $ceCache -Directory -Filter "compound-engineering*" -ErrorAction SilentlyContinue
  if ($dirs) {
    $enabled = $true
    $note = "Found $($dirs[0].Name); use ce-code-review with mode:report-only"
  }
}

# Workspace may also load CE via Cursor marketplace without cache path — soft enable if skill exists in user plugins.
$skillGlob = Join-Path $ceCache "compound-engineering*\skills\ce-code-review\SKILL.md"
$skillFiles = Get-ChildItem -Path $ceCache -Recurse -Filter "ce-code-review" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($skillFiles) {
  $enabled = $true
  $note = "ce-code-review skill present; use mode:report-only before push"
}

if ($enabled) {
  Write-Output "CE_STATUS=enabled"
} else {
  Write-Output "CE_STATUS=disabled"
}
Write-Output "CE_NOTE=$note"
