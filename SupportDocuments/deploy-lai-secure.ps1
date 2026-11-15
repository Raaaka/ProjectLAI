# Project LAI - Admin Deployment & Security Lockdown Script
# Run this script as Administrator

$TargetDir = "C:\ProjectLAI"
$ModelsDir = "$TargetDir\models"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "   Project LAI - Enterprise Folder Setup               " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# Step 1: Create the directory structure
if (-Not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir | Out-Null
    Write-Host "[+] Created Root Directory: $TargetDir" -ForegroundColor Green
} else {
    Write-Host "[*] Directory already exists: $TargetDir" -ForegroundColor Yellow
}

if (-Not (Test-Path $ModelsDir)) {
    New-Item -ItemType Directory -Path $ModelsDir | Out-Null
    Write-Host "[+] Created Models Directory: $ModelsDir" -ForegroundColor Green
}

# Step 2: Set strict NTFS permissions
Write-Host "[*] Applying Read-Only permissions for Standard Users..." -ForegroundColor Yellow
# Grant SYSTEM and Administrators Full Control, grant standard Users Read & Execute (RX)
icacls $TargetDir /inheritance:r /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" /grant "Users:(OI)(CI)RX" /T /C /Q | Out-Null
Write-Host "[+] Permissions applied successfully. Users cannot modify or replace files." -ForegroundColor Green

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " ACTION REQUIRED BY IT ADMIN:" -ForegroundColor Red
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "The secure folders are ready. Please manually download the required files:"
Write-Host "1. Download Inference Engine: Obtain the CUDA 12.4 version of llama-server (llama-server.exe) and extract it into C:\ProjectLAI\"
Write-Host "2. Download Quantized Model Weights: Download gemma4-e2b.gguf from Hugging Face and place it in C:\ProjectLAI\models\"
Write-Host ""
Write-Host "Once the files are placed, run the following command to get the SHA-256 hash for AppLocker/WDAC whitelisting:" -ForegroundColor Yellow
Write-Host "Get-FileHash -Path C:\ProjectLAI\llama-server.exe -Algorithm SHA256" -ForegroundColor White
Write-Host "=======================================================" -ForegroundColor Cyan
