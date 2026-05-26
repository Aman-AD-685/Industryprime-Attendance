param(
  [Parameter(Mandatory = $true)][string]$Section,
  [Parameter(Mandatory = $true)][string]$Message
)
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$journalDir = Join-Path $repoRoot ".cursor\local\pre-push-guard\daily-journal"
New-Item -ItemType Directory -Force -Path $journalDir | Out-Null
$day = Get-Date -Format "yyyy-MM-dd"
$path = Join-Path $journalDir "$day.md"
$time = Get-Date -Format "HH:mm"
$line = "- **$time** - **${Section}**: $Message"
if (-not (Test-Path $path)) {
  Set-Content -Path $path -Value "# Journal $day`n`n$line`n" -Encoding UTF8
} else {
  Add-Content -Path $path -Value $line -Encoding UTF8
}
Write-Host "Appended to $path"
