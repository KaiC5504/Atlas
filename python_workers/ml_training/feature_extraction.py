"""
Mel spectrogram feature extraction for audio event detection.
"""
import numpy as np
import librosa
from typing import Optional, Tuple, List
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from common.audio_types import SAMPLE_RATE, N_MELS, N_FFT, HOP_LENGTH


def extract_mel_spectrogram(
    audio_window: np.ndarray,
    sr: int = SAMPLE_RATE,
    n_mels: int = N_MELS,
    n_fft: int = N_FFT,
    hop_length: int = HOP_LENGTH,
    normalize: bool = True
) -> np.ndarray:
    
    # Compute mel spectrogram
    mel_spec = librosa.feature.melspectrogram(
        y=audio_window,
        sr=sr,
        n_mels=n_mels,
        n_fft=n_fft,
        hop_length=hop_length
    )

    # Convert to log scale (dB)
    mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)

    # Normalize to zero mean, unit variance
    if normalize:
        mel_spec_db = (mel_spec_db - mel_spec_db.mean()) / (mel_spec_db.std() + 1e-8)

    return mel_spec_db


def extract_batch_mel_spectrograms(
    audio_windows: List[np.ndarray],
    sr: int = SAMPLE_RATE,
    n_mels: int = N_MELS,
    n_fft: int = N_FFT,
    hop_length: int = HOP_LENGTH,
    normalize: bool = True
) -> np.ndarray:
    """
    Extract mel spectrograms for a batch of audio windows.

    Args:
        audio_windows: List of audio windows
        sr: Sample rate
        n_mels: Number of mel frequency bins
        n_fft: FFT window size
        hop_length: FFT hop length
        normalize: Whether to normalize spectrograms

    Returns:
        Batch of mel spectrograms as 3D numpy array (batch, n_mels, time_frames)
    """
    spectrograms = []
    for window in audio_windows:
        mel_spec = extract_mel_spectrogram(
            window, sr, n_mels, n_fft, hop_length, normalize
        )
        spectrograms.append(mel_spec)

    return np.stack(spectrograms, axis=0)


def get_expected_spectrogram_shape(
    window_size_samples: int = SAMPLE_RATE,
    n_mels: int = N_MELS,
    hop_length: int = HOP_LENGTH
) -> Tuple[int, int]:
    """
    Calculate expected mel spectrogram shape for given parameters.

    Args:
        window_size_samples: Audio window size in samples
        n_mels: Number of mel bins
        hop_length: FFT hop length

    Returns:
        Tuple of (n_mels, time_frames)
    """
    # Number of time frames is ceil((window_size + 1) / hop_length)
    time_frames = 1 + (window_size_samples // hop_length)
    return (n_mels, time_frames)


def apply_time_masking(
    spectrogram: np.ndarray,
    max_mask_width: int = 5,
    num_masks: int = 1
) -> np.ndarray:
    """
    Apply time masking augmentation (SpecAugment-style).

    Args:
        spectrogram: Input spectrogram (n_mels, time_frames)
        max_mask_width: Maximum width of time mask
        num_masks: Number of masks to apply

    Returns:
        Augmented spectrogram
    """
    spec = spectrogram.copy()
    _, time_frames = spec.shape

    for _ in range(num_masks):
        mask_width = np.random.randint(1, max_mask_width + 1)
        mask_start = np.random.randint(0, max(1, time_frames - mask_width))
        spec[:, mask_start:mask_start + mask_width] = 0

    return spec


def apply_frequency_masking(
    spectrogram: np.ndarray,
    max_mask_width: int = 10,
    num_masks: int = 1
) -> np.ndarray:
    """
    Apply frequency masking augmentation (SpecAugment-style).

    Args:
        spectrogram: Input spectrogram (n_mels, time_frames)
        max_mask_width: Maximum width of frequency mask
        num_masks: Number of masks to apply

    Returns:
        Augmented spectrogram
    """
    spec = spectrogram.copy()
    n_mels, _ = spec.shape

    for _ in range(num_masks):
        mask_width = np.random.randint(1, max_mask_width + 1)
        mask_start = np.random.randint(0, max(1, n_mels - mask_width))
        spec[mask_start:mask_start + mask_width, :] = 0

    return spec


def apply_gain_augmentation(
    spectrogram: np.ndarray,
    gain_range: Tuple[float, float] = (-3.0, 3.0)
) -> np.ndarray:
    """
    Apply random gain augmentation to spectrogram.

    Args:
        spectrogram: Input spectrogram
        gain_range: Range of gain in dB (min, max)

    Returns:
        Augmented spectrogram
    """
    gain_db = np.random.uniform(gain_range[0], gain_range[1])
    return spectrogram + gain_db


def augment_spectrogram(
    spectrogram: np.ndarray,
    time_mask_width: int = 5,
    freq_mask_width: int = 10,
    gain_range: Tuple[float, float] = (-3.0, 3.0),
    apply_time: bool = True,
    apply_freq: bool = True,
    apply_gain: bool = True
) -> np.ndarray:
    """
    Apply combined augmentations to spectrogram.

    Args:
        spectrogram: Input spectrogram
        time_mask_width: Max width for time masking
        freq_mask_width: Max width for frequency masking
        gain_range: Range for gain augmentation
        apply_time: Whether to apply time masking
        apply_freq: Whether to apply frequency masking
        apply_gain: Whether to apply gain augmentation

    Returns:
        Augmented spectrogram
    """
    aug_spec = spectrogram.copy()

    if apply_time:
        aug_spec = apply_time_masking(aug_spec, time_mask_width)

    if apply_freq:
        aug_spec = apply_frequency_masking(aug_spec, freq_mask_width)

    if apply_gain:
        aug_spec = apply_gain_augmentation(aug_spec, gain_range)

    return aug_spec


def mixup(
    spec1: np.ndarray,
    spec2: np.ndarray,
    label1: int,
    label2: int,
    alpha: float = 0.2
) -> Tuple[np.ndarray, float]:
    """
    Apply mixup augmentation between two spectrograms.

    Args:
        spec1: First spectrogram
        spec2: Second spectrogram
        label1: Label for first spectrogram (0 or 1)
        label2: Label for second spectrogram (0 or 1)
        alpha: Mixup alpha parameter (beta distribution parameter)

    Returns:
        Tuple of (mixed spectrogram, mixed label)
    """
    # Sample mixing coefficient from beta distribution
    lam = np.random.beta(alpha, alpha)

    # Mix spectrograms
    mixed_spec = lam * spec1 + (1 - lam) * spec2

    # Mix labels
    mixed_label = lam * label1 + (1 - lam) * label2

    return mixed_spec, mixed_label
