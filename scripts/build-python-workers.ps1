# build-python-workers.ps1 - Compile Python workers into standalone executables
# Usage: .\scripts\build-python-workers.ps1
#
# This script uses PyInstaller to bundle Python workers into .exe files
# that include Python and all dependencies, so end users don't need Python installed.

param(
    [switch]$Clean,
    [switch]$SkipVenv
)

$ErrorActionPreference = "Stop"
$WorkersDir = "python_workers"
$OutputDir = "python_workers\dist"
$VenvDir = "python_workers\.venv-build"

# Workers to bundle (including ML workers)
$Workers = @(
    "yt_dlp_worker.py",
    "valorant_checker.py",
    "ssh_worker.py",
    "playlist_uploader_worker.py",
    "audio_separator.py",
    "audio_event_detector.py",
    "model_enhancer.py"
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Building Python Workers as Executables" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Clean previous builds if requested
if ($Clean) {
    Write-Host "[Clean] Removing previous build artifacts..." -ForegroundColor Yellow
    if (Test-Path "$WorkersDir\build") { Remove-Item -Recurse -Force "$WorkersDir\build" }
    if (Test-Path "$WorkersDir\dist") { Remove-Item -Recurse -Force "$WorkersDir\dist" }
    if (Test-Path "$WorkersDir\*.spec") { Remove-Item -Force "$WorkersDir\*.spec" }
    Write-Host "  Cleaned!" -ForegroundColor Green
    Write-Host ""
}

# Create or activate virtual environment for building
if (-not $SkipVenv) {
    Write-Host "[1/4] Setting up build environment..." -ForegroundColor Cyan

    if (-not (Test-Path $VenvDir)) {
        Write-Host "  Creating virtual environment..."
        python -m venv $VenvDir
    }

    # Activate venv
    $activateScript = "$VenvDir\Scripts\Activate.ps1"
    if (Test-Path $activateScript) {
        . $activateScript
    } else {
        Write-Host "ERROR: Could not find venv activation script" -ForegroundColor Red
        exit 1
    }

    Write-Host "  Installing dependencies..."
    pip install --quiet pyinstaller
    pip install --quiet -r "$WorkersDir\requirements-bundle.txt"
    Write-Host "  Build environment ready!" -ForegroundColor Green
} else {
    Write-Host "[1/4] Using system Python (skipping venv)..." -ForegroundColor Yellow
}
Write-Host ""

# Create output directory
Write-Host "[2/4] Preparing output directory..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
Write-Host "  Output: $OutputDir" -ForegroundColor Green
Write-Host ""

# Build each worker
Write-Host "[3/4] Compiling workers with PyInstaller..." -ForegroundColor Cyan
$successCount = 0
$failCount = 0

foreach ($worker in $Workers) {
    $workerName = [System.IO.Path]::GetFileNameWithoutExtension($worker)
    $workerPath = "$WorkersDir\$worker"

    Write-Host "  Building $workerName..." -ForegroundColor White

    if (-not (Test-Path $workerPath)) {
        Write-Host "    ERROR: Worker not found: $workerPath" -ForegroundColor Red
        $failCount++
        continue
    }

    # PyInstaller command
    # --onefile: Single executable
    # --console: Show console for debugging (remove for production)
    # --noconfirm: Overwrite without asking
    # --clean: Clean cache before building
    # --paths: Add common module to path
    # --hidden-import: Include modules that PyInstaller might miss

    $pyinstallerArgs = @(
        "--onefile",
        "--noconfirm",
        "--clean",
        "--paths=$WorkersDir",
        "--distpath=$OutputDir",
        "--workpath=$WorkersDir\build",
        "--specpath=$WorkersDir",
        "--name=$workerName"
    )

    # Add worker-specific hidden imports
    switch ($workerName) {
        "yt_dlp_worker" {
            $pyinstallerArgs += "--hidden-import=yt_dlp"
            $pyinstallerArgs += "--hidden-import=yt_dlp.extractor"
            $pyinstallerArgs += "--hidden-import=yt_dlp.downloader"
            $pyinstallerArgs += "--hidden-import=yt_dlp.postprocessor"
            # Collect all yt-dlp data
            $pyinstallerArgs += "--collect-all=yt_dlp"
        }
        "valorant_checker" {
            $pyinstallerArgs += "--hidden-import=requests"
            $pyinstallerArgs += "--hidden-import=tls_client"
            $pyinstallerArgs += "--hidden-import=urllib3"
            $pyinstallerArgs += "--hidden-import=certifi"
            # tls_client has native DLLs that must be collected
            $pyinstallerArgs += "--collect-all=tls_client"
            $pyinstallerArgs += "--collect-all=certifi"
        }
        "ssh_worker" {
            $pyinstallerArgs += "--hidden-import=paramiko"
            $pyinstallerArgs += "--hidden-import=cryptography"
            $pyinstallerArgs += "--hidden-import=bcrypt"
            $pyinstallerArgs += "--hidden-import=nacl"
        }
        "playlist_uploader_worker" {
            $pyinstallerArgs += "--hidden-import=yt_dlp"
            $pyinstallerArgs += "--hidden-import=paramiko"
            $pyinstallerArgs += "--hidden-import=pypinyin"
            $pyinstallerArgs += "--hidden-import=opencc"
            $pyinstallerArgs += "--collect-all=yt_dlp"
            $pyinstallerArgs += "--collect-all=pypinyin"
            $pyinstallerArgs += "--collect-all=opencc"
        }
    }

    # Add the worker script path
    $pyinstallerArgs += $workerPath

    try {
        # Run PyInstaller
        $process = Start-Process -FilePath "pyinstaller" -ArgumentList $pyinstallerArgs -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$WorkersDir\build\$workerName.log" -RedirectStandardError "$WorkersDir\build\$workerName.err"

        if ($process.ExitCode -eq 0 -and (Test-Path "$OutputDir\$workerName.exe")) {
            $size = [math]::Round((Get-Item "$OutputDir\$workerName.exe").Length / 1MB, 2)
            Write-Host "    OK: $workerName.exe ($size MB)" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "    FAILED: Check $WorkersDir\build\$workerName.err for details" -ForegroundColor Red
            if (Test-Path "$WorkersDir\build\$workerName.err") {
                Get-Content "$WorkersDir\build\$workerName.err" | Select-Object -Last 10 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkRed }
            }
            $failCount++
        }
    } catch {
        Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $failCount++
    }
}

Write-Host ""

# Copy common module files that might be needed
Write-Host "[4/4] Copying support files..." -ForegroundColor Cyan

# Copy the playlist_uploader module (needed by playlist_uploader_worker)
if (Test-Path "$WorkersDir\playlist_uploader") {
    Copy-Item -Recurse -Force "$WorkersDir\playlist_uploader" "$OutputDir\playlist_uploader"
    Write-Host "  Copied playlist_uploader module" -ForegroundColor Green
}

Write-Host ""

# Summary
Write-Host "============================================" -ForegroundColor Cyan
if ($failCount -eq 0) {
    Write-Host "Build Complete! All $successCount workers compiled." -ForegroundColor Green
} else {
    Write-Host "Build finished with errors: $successCount succeeded, $failCount failed" -ForegroundColor Yellow
}
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Output directory: $OutputDir" -ForegroundColor Cyan
Write-Host ""
Get-ChildItem "$OutputDir\*.exe" | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  - $($_.Name) ($size MB)"
}
Write-Host ""

if ($failCount -gt 0) {
    exit 1
}
