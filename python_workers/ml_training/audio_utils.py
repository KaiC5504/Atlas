"""
Audio loading and preprocessing utilities for the ML training pipeline.
"""
import numpy as np
import librosa
from pathlib import Path
from typing import Optional, Tuple, List
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from common.audio_types import SAMPLE_RATE


def preprocess_audio(
    file_path: str,
    sr: int = SAMPLE_RATE,
    mono: bool = True,
    normalize: bool = True,
    trim_silence: bool = False,
    trim_db: float = 30.0
) -> np.ndarray:
    """
    Load and normalize audio for feature extraction.

    Steps:
    1. Load audio file (any format via librosa)
    2. Resample to target sample rate (default 16kHz)
    3. Convert to mono (average channels)
    4. Normalize amplitude to [-1, 1]
    5. Optionally trim silence from start/end

    Args:
        file_path: Path to audio file
        sr: Target sample rate (default 16000)
        mono: Convert to mono if True
        normalize: Normalize amplitude to [-1, 1]
        trim_silence: Trim silence from start/end
        trim_db: Threshold in dB for silence trimming

    Returns:
        numpy array of audio samples
    """
    # Load audio file
    audio, _ = librosa.load(file_path, sr=sr, mono=mono)

    # Trim silence if requested
    if trim_silence:
        audio, _ = librosa.effects.trim(audio, top_db=trim_db)

    # Normalize amplitude
    if normalize:
        audio = librosa.util.normalize(audio)

    return audio


def segment_audio(
    audio: np.ndarray,
    window_size_samples: int = SAMPLE_RATE,  # 1 second at 16kHz
    hop_size_samples: int = SAMPLE_RATE // 4  # 250ms hop
) -> List[np.ndarray]:
    """
    Segment audio into overlapping windows for training/inference.

    Args:
        audio: Audio samples as numpy array
        window_size_samples: Size of each window in samples
        hop_size_samples: Hop size between windows in samples

    Returns:
        List of audio windows (each is a numpy array)
    """
    windows = []
    audio_length = len(audio)

    for start in range(0, audio_length, hop_size_samples):
        end = start + window_size_samples
        window = audio[start:end]

        # Zero-pad if window is shorter than expected
        if len(window) < window_size_samples:
            window = np.pad(window, (0, window_size_samples - len(window)))

        windows.append(window)

    return windows


def get_audio_duration(file_path: str) -> float:
    """
    Get duration of audio file in seconds without loading entire file.

    Args:
        file_path: Path to audio file

    Returns:
        Duration in seconds
    """
    return librosa.get_duration(path=file_path)


def load_audio_segment(
    file_path: str,
    start_sec: float,
    duration_sec: float,
    sr: int = SAMPLE_RATE
) -> np.ndarray:
    """
    Load a specific segment of an audio file.

    Args:
        file_path: Path to audio file
        start_sec: Start time in seconds
        duration_sec: Duration to load in seconds
        sr: Target sample rate

    Returns:
        Audio segment as numpy array
    """
    audio, _ = librosa.load(
        file_path,
        sr=sr,
        mono=True,
        offset=start_sec,
        duration=duration_sec
    )
    return librosa.util.normalize(audio)


def get_supported_formats() -> List[str]:
    """
    Get list of supported audio file formats.

    Returns:
        List of file extensions (without dots)
    """
    return ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'opus']


def is_valid_audio_file(file_path: str) -> bool:
    """
    Check if a file is a valid, readable audio file.

    Args:
        file_path: Path to file

    Returns:
        True if file is valid audio, False otherwise
    """
    path = Path(file_path)

    # Check if file exists
    if not path.exists():
        return False

    # Check extension
    ext = path.suffix.lower().lstrip('.')
    if ext not in get_supported_formats():
        return False

    # Try to get duration (quick validity check)
    try:
        duration = get_audio_duration(file_path)
        return duration > 0
    except Exception:
        return False


def split_audio_by_timestamps(
    audio: np.ndarray,
    timestamps: List[Tuple[float, float]],
    sr: int = SAMPLE_RATE
) -> List[np.ndarray]:
    """
    Split audio into segments based on timestamp pairs.

    Args:
        audio: Full audio as numpy array
        timestamps: List of (start_sec, end_sec) tuples
        sr: Sample rate of audio

    Returns:
        List of audio segments
    """
    segments = []
    for start_sec, end_sec in timestamps:
        start_sample = int(start_sec * sr)
        end_sample = int(end_sec * sr)
        segment = audio[start_sample:end_sample]
        segments.append(segment)
    return segments


def calculate_rms_energy(audio: np.ndarray, frame_length: int = 2048) -> float:
    """
    Calculate RMS energy of audio signal.

    Args:
        audio: Audio samples
        frame_length: Frame length for RMS calculation

    Returns:
        Mean RMS energy
    """
    rms = librosa.feature.rms(y=audio, frame_length=frame_length)
    return float(np.mean(rms))


def has_sufficient_energy(
    audio: np.ndarray,
    threshold: float = 0.01,
    frame_length: int = 2048
) -> bool:
    """
    Check if audio has sufficient energy (not silence).

    Args:
        audio: Audio samples
        threshold: Minimum RMS threshold
        frame_length: Frame length for RMS calculation

    Returns:
        True if audio has sufficient energy
    """
    return calculate_rms_energy(audio, frame_length) > threshold
