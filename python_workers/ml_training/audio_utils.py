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
    normalize: bool = False, 
    trim_silence: bool = False,
    trim_db: float = 30.0
) -> np.ndarray:
    audio, _ = librosa.load(file_path, sr=sr, mono=mono)

    # Trim silence if requested
    if trim_silence:
        audio, _ = librosa.effects.trim(audio, top_db=trim_db)

    if normalize:
        audio = librosa.util.normalize(audio)

    return audio


def segment_audio(
    audio: np.ndarray,
    window_size_samples: int = SAMPLE_RATE,  
    hop_size_samples: int = SAMPLE_RATE // 4  
) -> List[np.ndarray]:

    windows = []
    audio_length = len(audio)

    for start in range(0, audio_length, hop_size_samples):
        end = start + window_size_samples
        window = audio[start:end]

        if len(window) < window_size_samples:
            window = np.pad(window, (0, window_size_samples - len(window)))

        windows.append(window)

    return windows


def get_audio_duration(file_path: str) -> float:
    return librosa.get_duration(path=file_path)


def load_audio_segment(
    file_path: str,
    start_sec: float,
    duration_sec: float,
    sr: int = SAMPLE_RATE,
    normalize: bool = False  
) -> np.ndarray:
   
    audio, _ = librosa.load(
        file_path,
        sr=sr,
        mono=True,
        offset=start_sec,
        duration=duration_sec
    )
    if normalize:
        return librosa.util.normalize(audio)
    return audio


def get_supported_formats() -> List[str]:
   
    return ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'opus']


def is_valid_audio_file(file_path: str) -> bool:
    
    path = Path(file_path)

    # Check if file exists
    if not path.exists():
        return False

    # Check extension
    ext = path.suffix.lower().lstrip('.')
    if ext not in get_supported_formats():
        return False

    # Try to get duration
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
    
    segments = []
    for start_sec, end_sec in timestamps:
        start_sample = int(start_sec * sr)
        end_sample = int(end_sec * sr)
        segment = audio[start_sample:end_sample]
        segments.append(segment)
    return segments


def calculate_rms_energy(audio: np.ndarray, frame_length: int = 2048) -> float:
   
    # Fast numpy RMS
    return float(np.sqrt(np.mean(audio ** 2)))


def has_sufficient_energy(
    audio: np.ndarray,
    threshold: float = 0.01,
    frame_length: int = 2048
) -> bool:
   
    return calculate_rms_energy(audio, frame_length) > threshold
