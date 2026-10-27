<#
.SYNOPSIS
    KINTSUGI Local Application Runtime Launcher
.DESCRIPTION
    Starts the FastAPI backend and Vite frontend services, verifies health,
    opens the primary application in the browser, and cleanly handles shutdown.
#>

param(
    [switch]$NoBrowser = $false,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host " KINTSUGI - Confidence-Aware, Self-Healing Industrial Data Pipeline" -ForegroundColor Cyan
Write-Host " Local Demonstration Runtime Launcher" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

# 1. Environment Verification
$VenvPython = Join-Path $ScriptDir "backend\.venv\Scripts\python.exe"
$VenvUvicorn = Join-Path $ScriptDir "backend\.venv\Scripts\uvicorn.exe"
$FrontendDir = Join-Path $ScriptDir "frontend"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[ERROR] Backend virtual environment not found at: $VenvPython" -ForegroundColor Red
    Write-Host "Please ensure the virtualenv is set up under backend\.venv" -ForegroundColor Yellow
    exit 1
}

$NodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
$NpmCmd = Get-Command "npm" -ErrorAction SilentlyContinue

if (-not $NodeCmd -or -not $NpmCmd) {
    Write-Host "[ERROR] Node.js / npm not found in system PATH." -ForegroundColor Red
    exit 1
}

# 2. Port Conflict Detection & Cleanup
function Test-PortOccupied([int]$Port) {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($connections -ne $null)
}

function Terminate-PortProcess([int]$Port) {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($pidToKill in $pids) {
            Write-Host "  [WARN] Terminating process $pidToKill occupying port $Port..." -ForegroundColor Yellow
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 800
    }
}

if (Test-PortOccupied $BackendPort) {
    Write-Host "[WARN] Port $BackendPort is currently occupied." -ForegroundColor Yellow
    Terminate-PortProcess $BackendPort
}

if (Test-PortOccupied $FrontendPort) {
    Write-Host "[WARN] Port $FrontendPort is currently occupied." -ForegroundColor Yellow
    Terminate-PortProcess $FrontendPort
}

# 3. Start Backend Service
Write-Host ">>> Starting Backend (FastAPI / Uvicorn)..." -ForegroundColor Green
$BackendDir = Join-Path $ScriptDir "backend"
$backendProcess = Start-Process `
    -FilePath $VenvUvicorn `
    -ArgumentList "app.main:app", "--host", "127.0.0.1", "--port", "$BackendPort" `
    -WorkingDirectory $BackendDir `
    -PassThru `
    -NoNewWindow

# 4. Start Frontend Service
Write-Host ">>> Starting Frontend (Vite / React)..." -ForegroundColor Green
$frontendProcess = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev -- --host 127.0.0.1 --port $FrontendPort" `
    -WorkingDirectory $FrontendDir `
    -PassThru `
    -NoNewWindow

# Helper Cleanup Routine
function Stop-KintsugiServices {
    Write-Host "`n>>> Shutting down KINTSUGI services..." -ForegroundColor Yellow
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Terminate-PortProcess $BackendPort
    Terminate-PortProcess $FrontendPort
    Write-Host ">>> Services cleanly terminated." -ForegroundColor Green
}

# Register Ctrl+C / Exit handler
try {
    # 5. Health Check Polling
    Write-Host ">>> Verifying service health..." -ForegroundColor Cyan

    $backendHealthy = $false
    $backendUrl = "http://127.0.0.1:$BackendPort/api/health"
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $resp = Invoke-RestMethod -Uri $backendUrl -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($resp -and $resp.status -eq "healthy") {
                $backendHealthy = $true
                break
            }
        } catch { }
    }

    if (-not $backendHealthy) {
        Write-Host "[ERROR] Backend service failed to become healthy on $backendUrl" -ForegroundColor Red
        Stop-KintsugiServices
        exit 1
    }
    Write-Host "  [OK] Backend healthy: $backendUrl" -ForegroundColor Green

    $frontendHealthy = $false
    $frontendUrl = "http://localhost:$FrontendPort"
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $fResp = Invoke-WebRequest -Uri "http://127.0.0.1:$FrontendPort" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($fResp.StatusCode -eq 200) {
                $frontendHealthy = $true
                break
            }
        } catch { }
    }

    if (-not $frontendHealthy) {
        Write-Host "[ERROR] Frontend service failed to become reachable on $frontendUrl" -ForegroundColor Red
        Stop-KintsugiServices
        exit 1
    }
    Write-Host "  [OK] Frontend reachable: $frontendUrl" -ForegroundColor Green

    # 6. Display Service Status
    Write-Host "`n========================================================================" -ForegroundColor Cyan
    Write-Host " KINTSUGI RUNTIME IS READY" -ForegroundColor Green
    Write-Host "========================================================================" -ForegroundColor Cyan
    Write-Host " Primary Application URL:  $frontendUrl" -ForegroundColor Yellow
    Write-Host " Backend Health Check:     $backendUrl" -ForegroundColor Gray
    Write-Host " API Documentation:        http://127.0.0.1:$BackendPort/docs" -ForegroundColor Gray
    Write-Host "========================================================================" -ForegroundColor Cyan

    # 7. Open Browser Directly to Main Product
    if (-not $NoBrowser) {
        Write-Host ">>> Opening primary application in default browser..." -ForegroundColor Cyan
        Start-Process $frontendUrl
    }

    Write-Host "`nPress Ctrl+C to stop all services cleanly.`n" -ForegroundColor DarkGray

    # Wait loop
    while ($true) {
        Start-Sleep -Seconds 1
        if ($backendProcess.HasExited) {
            Write-Host "[ERROR] Backend process terminated unexpectedly." -ForegroundColor Red
            break
        }
        if ($frontendProcess.HasExited) {
            Write-Host "[ERROR] Frontend process terminated unexpectedly." -ForegroundColor Red
            break
        }
    }
} finally {
    Stop-KintsugiServices
}
