# Detect Compound Engineering ce-code-review availability.
$ceCache = Join-Path $env:USERPROFILE ".cursor\plugins\cache\cursor-public"
$found = $false
if (Test-Path $ceCache) {
  $dirs = Get-ChildItem -Path $ceCache -Directory -Filter "compound-engineering*" -ErrorAction SilentlyContinue
  foreach ($d in $dirs) {
    $skillGlob = Join-Path $d.FullName "skills\ce-code-review\SKILL.md"
    if (Test-Path $skillGlob) { $found = $true; break }
  }
}
if ($found) { Write-Host "CE_STATUS=enabled" } else { Write-Host "CE_STATUS=disabled" }
