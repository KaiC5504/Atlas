# publish-release.ps1 - Upload Atlas release to update server
# Usage: .\scripts\publish-release.ps1 -Version "1.0.1"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

$releaseDir = "releases\$Version"
$serverPath = "root@YOUR_SERVER_IP:/var/www/YOUR_DOMAIN/atlas/"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Publishing Atlas v$Version to update server" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verify release directory exists
if (-not (Test-Path $releaseDir)) {
    Write-Host "ERROR: Release directory not found at $releaseDir" -ForegroundColor Red
    Write-Host "  Run build-release.ps1 first to create the release." -ForegroundColor Yellow
    exit 1
}

# Verify required files exist
$updateJson = "$releaseDir\update.json"
$nsisZip = Get-ChildItem "$releaseDir\*.nsis.zip" | Select-Object -First 1
$sigFile = Get-ChildItem "$releaseDir\*.nsis.zip.sig" | Select-Object -First 1

if (-not (Test-Path $updateJson)) {
    Write-Host "ERROR: update.json not found in $releaseDir" -ForegroundColor Red
    exit 1
}

if (-not $nsisZip -or -not $sigFile) {
    Write-Host "ERROR: Update bundle (.nsis.zip) or signature (.sig) not found in $releaseDir" -ForegroundColor Red
    exit 1
}

Write-Host "Uploading files to server..." -ForegroundColor Cyan
Write-Host "  Server: YOUR_SERVER_IP" -ForegroundColor Yellow
Write-Host "  Path: /var/www/YOUR_DOMAIN/atlas/" -ForegroundColor Yellow
Write-Host ""

# Upload update.json (manifest)
Write-Host "[1/3] Uploading update.json..." -ForegroundColor Cyan
scp "$updateJson" $serverPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to upload update.json" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Upload .nsis.zip (update bundle)
Write-Host "[2/3] Uploading $($nsisZip.Name)..." -ForegroundColor Cyan
scp $nsisZip.FullName $serverPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to upload update bundle" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Upload .sig (signature)
Write-Host "[3/3] Uploading $($sigFile.Name)..." -ForegroundColor Cyan
scp $sigFile.FullName $serverPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to upload signature file" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Published Successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Update is now available at:" -ForegroundColor Cyan
Write-Host "  https://YOUR_DOMAIN/atlas/update.json" -ForegroundColor Yellow
Write-Host ""
Write-Host "Users will receive the update on their next app launch." -ForegroundColor Green
Write-Host ""
