# Cairn - 1-Click Platform Launcher (Windows PowerShell)
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  CAIRN: Project Continuity Intelligence Platform        " -ForegroundColor Green
Write-Host "  Anti-Gravity Invariants Lock: ACTIVE                   " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $CurrentDir

# 1. Check Python Venv
$VenvPython = Join-Path $CurrentDir "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Host "[1/4] Creating backend virtual environment..." -ForegroundColor Yellow
    & python -m venv (Join-Path $CurrentDir "backend\.venv")
    & (Join-Path $CurrentDir "backend\.venv\Scripts\pip.exe") install -r (Join-Path $CurrentDir "backend\requirements.txt")
    & (Join-Path $CurrentDir "backend\.venv\Scripts\pip.exe") install email-validator
} else {
    Write-Host "[1/4] Backend virtual environment verified." -ForegroundColor Green
}

# 2. Check and Seed Database
Write-Host "[2/4] Initializing and seeding synthetic benchmark project..." -ForegroundColor Yellow
$env:PYTHONPATH = (Join-Path $CurrentDir "backend")
$env:DATABASE_URL = "sqlite:///" + (Join-Path $CurrentDir "cairn_demo.db")
& $VenvPython (Join-Path $CurrentDir "backend\app\seeds\seed_demo_data.py")

# 3. Check Frontend Dependencies
Write-Host "[3/4] Verifying frontend dependencies..." -ForegroundColor Yellow
$FrontendDir = Join-Path $CurrentDir "frontend"
if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Set-Location $FrontendDir
    npm install
    Set-Location $CurrentDir
}

# 4. Start Servers
Write-Host "[4/4] Launching Cairn Platform..." -ForegroundColor Green
Write-Host "  • Backend API:     http://127.0.0.1:8000 (Swagger: /docs)" -ForegroundColor Cyan
Write-Host "  • Frontend UI:     http://127.0.0.1:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting processes in background tabs..." -ForegroundColor Yellow

Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:PYTHONPATH='$CurrentDir\backend'; `$env:DATABASE_URL='sqlite:///$CurrentDir\cairn_demo.db'; & '$VenvPython' -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$FrontendDir'; npm run dev -- --host 127.0.0.1 --port 3000"

Write-Host "Cairn is now running! Open http://127.0.0.1:3000 in your browser." -ForegroundColor Green

