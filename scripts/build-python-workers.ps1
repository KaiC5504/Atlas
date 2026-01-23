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

    # Install ML dependencies if requirements-ml.txt exists (for ML workers like audio_separator, audio_event_detector, model_enhancer)
    if (Test-Path "$WorkersDir\requirements-ml.txt") {
        Write-Host "  Installing ML dependencies..."
        pip install --quiet -r "$WorkersDir\requirements-ml.txt"
    }
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

# Worker-specific hidden imports configuration
$WorkerConfig = @{
    "yt_dlp_worker" = @(
        "--hidden-import=yt_dlp",
        "--hidden-import=yt_dlp.extractor",
        "--hidden-import=yt_dlp.downloader",
        "--hidden-import=yt_dlp.postprocessor",
        "--collect-all=yt_dlp"
    )
    "valorant_checker" = @(
        "--hidden-import=requests",
        "--hidden-import=tls_client",
        "--hidden-import=urllib3",
        "--hidden-import=certifi",
        "--collect-all=tls_client",
        "--collect-all=certifi"
    )
    "ssh_worker" = @(
        "--hidden-import=paramiko",
        "--hidden-import=cryptography",
        "--hidden-import=bcrypt",
        "--hidden-import=nacl"
    )
    "playlist_uploader_worker" = @(
        "--hidden-import=yt_dlp",
        "--hidden-import=paramiko",
        "--hidden-import=pypinyin",
        "--hidden-import=opencc",
        "--collect-all=yt_dlp",
        "--collect-all=pypinyin",
        "--collect-all=opencc"
    )
    "audio_separator" = @(
        "--hidden-import=torch",
        "--hidden-import=torchaudio",
        "--hidden-import=librosa",
        "--hidden-import=numpy",
        "--hidden-import=demucs",
        "--hidden-import=demucs.pretrained",
        "--hidden-import=demucs.apply",
        "--collect-all=torch",
        "--collect-all=torchaudio",
        "--collect-all=demucs",
        "--collect-all=librosa"
    )
    "audio_event_detector" = @(
        "--hidden-import=numpy",
        "--hidden-import=librosa",
        "--hidden-import=onnxruntime",
        "--hidden-import=pydub",
        "--collect-all=librosa",
        "--collect-all=onnxruntime"
    )
    "model_enhancer" = @(
        "--hidden-import=torch",
        "--hidden-import=numpy",
        "--hidden-import=librosa",
        "--hidden-import=onnx",
        "--hidden-import=onnxruntime",
        "--hidden-import=tensorboard",
        "--hidden-import=sklearn",
        "--hidden-import=sklearn.metrics",
        "--hidden-import=yaml",
        "--hidden-import=tqdm",
        "--collect-all=torch",
        "--collect-all=librosa",
        "--collect-all=tensorboard",
        "--collect-all=sklearn",
        "--collect-all=onnxruntime"
    )
}

# Build all workers in parallel
Write-Host "[3/4] Compiling workers with PyInstaller (parallel)..." -ForegroundColor Cyan
$processes = @{}

$skippedCount = 0
foreach ($worker in $Workers) {
    $workerName = [System.IO.Path]::GetFileNameWithoutExtension($worker)
    $workerPath = "$WorkersDir\$worker"

    if (-not (Test-Path $workerPath)) {
        Write-Host "  SKIP: Worker not found: $workerPath" -ForegroundColor Red
        continue
    }

    # Skip if exe exists and is newer than source (unless -Clean)
    $exePath = "$OutputDir\$workerName.exe"
    if (-not $Clean -and (Test-Path $exePath)) {
        $exeTime = (Get-Item $exePath).LastWriteTime
        $srcTime = (Get-Item $workerPath).LastWriteTime

        # Also check common module timestamps
        $commonDir = "$WorkersDir\common"
        $commonChanged = $false
        if (Test-Path $commonDir) {
            Get-ChildItem "$commonDir\*.py" | ForEach-Object {
                if ($_.LastWriteTime -gt $exeTime) { $commonChanged = $true }
            }
        }

        if ($srcTime -lt $exeTime -and -not $commonChanged) {
            Write-Host "  SKIP: $workerName.exe is up to date" -ForegroundColor DarkGray
            $skippedCount++
            continue
        }
    }

    # Ensure build directory exists
    New-Item -ItemType Directory -Path "$WorkersDir\build\$workerName" -Force | Out-Null

    # Base PyInstaller arguments
    $pyinstallerArgs = @(
        "--onefile",
        "--noconfirm",
        "--paths=$WorkersDir",
        "--distpath=$OutputDir",
        "--workpath=$WorkersDir\build\$workerName",
        "--specpath=$WorkersDir",
        "--name=$workerName"
    )

    # Add --clean if requested
    if ($Clean) {
        $pyinstallerArgs += "--clean"
    }

    # Add worker-specific imports
    if ($WorkerConfig.ContainsKey($workerName)) {
        $pyinstallerArgs += $WorkerConfig[$workerName]
    }

    # Add the worker script path
    $pyinstallerArgs += $workerPath

    Write-Host "  Starting $workerName..." -ForegroundColor White

    # Start PyInstaller in parallel (no -Wait)
    $process = Start-Process -FilePath "pyinstaller" -ArgumentList $pyinstallerArgs -NoNewWindow -PassThru -RedirectStandardOutput "$WorkersDir\build\$workerName.log" -RedirectStandardError "$WorkersDir\build\$workerName.err"
    $processes[$workerName] = $process
}

Write-Host ""
if ($processes.Count -gt 0) {
    Write-Host "  Building $($processes.Count) workers in parallel..." -ForegroundColor Yellow
} else {
    Write-Host "  All workers are up to date!" -ForegroundColor Green
}
Write-Host ""

# Wait for all processes to complete and collect results
$successCount = 0
$failCount = 0

foreach ($workerName in $processes.Keys) {
    $process = $processes[$workerName]
    $process.WaitForExit()

    # Note: Start-Process with output redirection may not capture exit code reliably
    # So we primarily check if the exe was created successfully
    if (Test-Path "$OutputDir\$workerName.exe") {
        $size = [math]::Round((Get-Item "$OutputDir\$workerName.exe").Length / 1MB, 2)
        Write-Host "  OK: $workerName.exe ($size MB)" -ForegroundColor Green
        $successCount++
    } else {
        Write-Host "  FAILED: $workerName - Check $WorkersDir\build\$workerName.err" -ForegroundColor Red
        if (Test-Path "$WorkersDir\build\$workerName.err") {
            Get-Content "$WorkersDir\build\$workerName.err" | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkRed }
        }
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
    if ($skippedCount -gt 0) {
        Write-Host "Build Complete! $successCount compiled, $skippedCount skipped (up to date)" -ForegroundColor Green
    } else {
        Write-Host "Build Complete! All $successCount workers compiled." -ForegroundColor Green
    }
} else {
    Write-Host "Build finished with errors: $successCount succeeded, $failCount failed, $skippedCount skipped" -ForegroundColor Yellow
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
