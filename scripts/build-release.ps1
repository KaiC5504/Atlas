# build-release.ps1 - Build Atlas for release with update signing
# Usage: .\scripts\build-release.ps1 -Version "1.0.1"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Building Atlas v$Version for release..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 0. Verify signing key is set
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    Write-Host "ERROR: TAURI_SIGNING_PRIVATE_KEY environment variable is not set." -ForegroundColor Red
    Write-Host ""
    Write-Host "To set it, run:" -ForegroundColor Yellow
    Write-Host '  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$HOME\.tauri\atlas.key"' -ForegroundColor Yellow
    Write-Host ""
    Write-Host "If you don't have a key yet, generate one with:" -ForegroundColor Yellow
    Write-Host "  npx tauri signer generate -w ~/.tauri/atlas.key" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# 1. Update version in all configuration files
Write-Host "[1/6] Updating version numbers to $Version..." -ForegroundColor Cyan

# Update Cargo.toml version
$cargoPath = "src-tauri\Cargo.toml"
$cargoContent = Get-Content $cargoPath -Raw
# Match version in [package] section (first version field)
$cargoContent = $cargoContent -replace '(?m)^(version\s*=\s*")[^"]*(")', "`${1}$Version`${2}"
Set-Content $cargoPath $cargoContent -NoNewline

# Update tauri.conf.json version
$tauriConfPath = "src-tauri\tauri.conf.json"
$tauriConf = Get-Content $tauriConfPath | ConvertFrom-Json
$tauriConf.version = $Version
$tauriConf | ConvertTo-Json -Depth 10 | Set-Content $tauriConfPath

# Update package.json version
$packagePath = "package.json"
$packageJson = Get-Content $packagePath | ConvertFrom-Json
$packageJson.version = $Version
$packageJson | ConvertTo-Json -Depth 10 | Set-Content $packagePath

Write-Host "  - Updated Cargo.toml" -ForegroundColor Green
Write-Host "  - Updated tauri.conf.json" -ForegroundColor Green
Write-Host "  - Updated package.json" -ForegroundColor Green
Write-Host ""

# 2. Install dependencies if needed
Write-Host "[2/7] Checking dependencies..." -ForegroundColor Cyan
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing npm dependencies..."
    npm install
}
Write-Host "  Dependencies OK" -ForegroundColor Green
Write-Host ""

# 3. Build Python workers as executables
Write-Host "[3/7] Building Python workers..." -ForegroundColor Cyan
Write-Host "  Compiling Python workers into standalone executables..." -ForegroundColor Yellow

try {
    & ".\scripts\build-python-workers.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Python worker build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Python workers compiled!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to build Python workers: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 4. Build the release
Write-Host "[4/7] Building Tauri application..." -ForegroundColor Cyan
Write-Host "  This may take a few minutes..." -ForegroundColor Yellow
npm run tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Build completed!" -ForegroundColor Green
Write-Host ""

# 5. Locate build artifacts
Write-Host "[5/7] Locating build artifacts..." -ForegroundColor Cyan
$bundleDir = "src-tauri\target\release\bundle\nsis"

if (-not (Test-Path $bundleDir)) {
    Write-Host "ERROR: Bundle directory not found at $bundleDir" -ForegroundColor Red
    exit 1
}

# Tauri 2.x uses .exe installer directly for updates (not .nsis.zip like Tauri 1.x)
$installer = Get-ChildItem "$bundleDir\*-setup.exe" | Where-Object { $_.Name -notlike "*uninstall*" } | Select-Object -First 1
$sigFile = Get-ChildItem "$bundleDir\*-setup.exe.sig" | Select-Object -First 1

if (-not $installer -or -not $sigFile) {
    Write-Host "ERROR: Update artifacts (.exe and .exe.sig) not found." -ForegroundColor Red
    Write-Host "  Make sure TAURI_SIGNING_PRIVATE_KEY is set and createUpdaterArtifacts is true in tauri.conf.json" -ForegroundColor Yellow
    exit 1
}

Write-Host "  Found: $($installer.Name)" -ForegroundColor Green
Write-Host "  Found: $($sigFile.Name)" -ForegroundColor Green
Write-Host ""

# 6. Create release directory and copy artifacts
Write-Host "[6/7] Creating release package..." -ForegroundColor Cyan
$releaseDir = "releases\$Version"
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

Copy-Item $installer.FullName "$releaseDir\"
Copy-Item $sigFile.FullName "$releaseDir\"

Write-Host "  Copied artifacts to $releaseDir" -ForegroundColor Green
Write-Host ""

# 7. Generate update.json manifest
Write-Host "[7/7] Generating update manifest..." -ForegroundColor Cyan
$signature = Get-Content $sigFile.FullName -Raw
$signature = $signature.Trim()

$updateJson = @{
    version = $Version
    notes = "Release v$Version"
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = $signature
            url = "https://updates.kaic5504.com/atlas/$($installer.Name)"
        }
    }
} | ConvertTo-Json -Depth 5

Set-Content "$releaseDir\update.json" $updateJson
Write-Host "  Generated update.json" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "============================================" -ForegroundColor Green
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Release artifacts in: $releaseDir" -ForegroundColor Cyan
Write-Host ""
Get-ChildItem $releaseDir | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  - $($_.Name) ($size MB)"
}
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Test the installer locally"
Write-Host "  2. Run .\scripts\publish-release.ps1 -Version $Version to upload to server"
Write-Host ""
