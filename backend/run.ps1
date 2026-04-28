$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (Test-Path .\.venv\Scripts\Activate.ps1) {
    . .\.venv\Scripts\Activate.ps1
}
# Uses API_PORT from backend/.env via main.py (default 8001).
python main.py
