# Project LAI - Automated Extension Deployment Script
# Installs the Project LAI VS Code Extension (.vsix) offline

[CmdletBinding()]
param (
    [string]$VsixPath = "$PSScriptRoot\project-lai-1.0.0.vsix",
    [string]$ApiBase = "http://127.0.0.1:8080/v1"
)

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "   Project LAI - VS Code Extension Offline Installer   " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Locate VSIX package
if (-not (Test-Path $VsixPath)) {
    # Fallback search if run from root
    $AltVsix = "$PSScriptRoot\..\extensions\vscode-lai\project-lai-1.0.0.vsix"
    if (Test-Path $AltVsix) {
        $VsixPath = (Resolve-Path $AltVsix).Path
    } else {
        Write-Error "[-] Could not find project-lai-1.0.0.vsix at '$VsixPath'."
        exit 1
    }
}

Write-Host "[+] Found VSIX package: $VsixPath" -ForegroundColor Green

# 2. Check for VS Code CLI
$CodeCli = Get-Command "code" -ErrorAction SilentlyContinue
if (-not $CodeCli) {
    Write-Warning "[!] 'code' CLI is not in system PATH."
    Write-Host "    You can still install manually in VS Code:"
    Write-Host "    Press Ctrl+Shift+P -> 'Extensions: Install from VSIX...' -> select '$VsixPath'" -ForegroundColor Yellow
} else {
    Write-Host "[*] Installing Project LAI extension into VS Code..." -ForegroundColor Yellow
    & code --install-extension $VsixPath --force
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[+] Extension installed successfully!" -ForegroundColor Green
    } else {
        Write-Warning "[!] Installation returned exit code $LASTEXITCODE. Check VS Code log."
    }
}

# 3. Connectivity check to local inference engine
Write-Host ""
Write-Host "[*] Verifying connectivity to local AI inference server at $ApiBase/models..." -ForegroundColor Yellow
try {
    $Response = Invoke-RestMethod -Uri "$ApiBase/models" -Method Get -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[+] Local AI Inference Engine is ONLINE and responding!" -ForegroundColor Green
    if ($Response.data) {
        $Models = ($Response.data | ForEach-Object { $_.id }) -join ", "
        Write-Host "    Available models: $Models" -ForegroundColor Gray
    }
} catch {
    Write-Host "[-] Could not connect to inference engine at $ApiBase" -ForegroundColor DarkYellow
    Write-Host "    Note: If you haven't started llama-server yet, run:" -ForegroundColor Gray
    Write-Host "    .\start-lai.bat or llama-server.exe -m .\models\gemma4-e2b.gguf --port 8080" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " Installation Complete. How to use Project LAI:" -ForegroundColor Cyan
Write-Host "   - Open Chat:        Ctrl+Shift+L  (or click the LAI icon in activity bar)"
Write-Host "   - Inline Edit:      Ctrl+I        (select code in editor, then press Ctrl+I)"
Write-Host "   - Autocomplete:     Tab           (ghost text appears as you type)"
Write-Host "   - AI Linter:        Ctrl+S        (auto-runs on save into Problems tab)"
Write-Host "=======================================================" -ForegroundColor Cyan
