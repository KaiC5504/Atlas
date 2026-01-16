import json
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import sys
import argparse
from tqdm import tqdm
import random

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from common.audio_types import (
    TrainingManifest, TrainingSample, SAMPLE_RATE
)
from ml_training.audio_utils import (
    preprocess_audio, is_valid_audio_file, calculate_rms_energy
)
from ml_training.feature_extraction import extract_windows_from_full_spectrogram


def create_training_dataset(
    manifest_path: str,
    output_dir: str,
    window_size_ms: int = 1000,
    hop_size_ms: int = 250,
    val_split: float = 0.2,
    min_energy: float = 0.01,
    seed: int = 42
) -> Dict:
    
    random.seed(seed)
    np.random.seed(seed)

    # Load manifest
    with open(manifest_path, 'r') as f:
        manifest_dict = json.load(f)
    manifest = TrainingManifest.from_dict(manifest_dict)

    # Create output directories
    output_path = Path(output_dir)
    train_pos = output_path / 'train' / 'positive'
    train_neg = output_path / 'train' / 'negative'
    val_pos = output_path / 'val' / 'positive'
    val_neg = output_path / 'val' / 'negative'

    for dir_path in [train_pos, train_neg, val_pos, val_neg]:
        dir_path.mkdir(parents=True, exist_ok=True)

    # Calculate sample sizes
    window_samples = int(window_size_ms * SAMPLE_RATE / 1000)
    hop_samples = int(hop_size_ms * SAMPLE_RATE / 1000)

    # Process samples
    stats = {
        'positive': {'total_windows': 0, 'train': 0, 'val': 0, 'files': 0},
        'negative': {'total_windows': 0, 'train': 0, 'val': 0, 'files': 0},
        'hard_negative': {'total_windows': 0, 'train': 0, 'val': 0, 'files': 0}
    }

    # Process positive samples
    print("Processing positive samples...")
    pos_windows = process_samples(
        manifest.positive_samples,
        label=1,
        window_samples=window_samples,
        hop_samples=hop_samples,
        min_energy=min_energy
    )
    stats['positive']['total_windows'] = len(pos_windows)
    stats['positive']['files'] = len(manifest.positive_samples)

    # Process negative samples
    print("Processing negative samples...")
    neg_windows = process_samples(
        manifest.negative_samples,
        label=0,
        window_samples=window_samples,
        hop_samples=hop_samples,
        min_energy=min_energy
    )
    stats['negative']['total_windows'] = len(neg_windows)
    stats['negative']['files'] = len(manifest.negative_samples)

    # Process hard negatives
    print("Processing hard negative samples...")
    hard_neg_windows = process_samples(
        manifest.hard_negatives,
        label=0,
        window_samples=window_samples,
        hop_samples=hop_samples,
        min_energy=min_energy
    )
    stats['hard_negative']['total_windows'] = len(hard_neg_windows)
    stats['hard_negative']['files'] = len(manifest.hard_negatives)

    # Combine all negatives
    all_neg_windows = neg_windows + hard_neg_windows

    # Split into train/val
    random.shuffle(pos_windows)
    random.shuffle(all_neg_windows)

    pos_val_size = int(len(pos_windows) * val_split)
    neg_val_size = int(len(all_neg_windows) * val_split)

    train_positive = pos_windows[pos_val_size:]
    val_positive = pos_windows[:pos_val_size]

    train_negative = all_neg_windows[neg_val_size:]
    val_negative = all_neg_windows[:neg_val_size]

    # Save samples
    print("Saving training samples...")
    save_samples(train_positive, train_pos, 'sample')
    save_samples(train_negative, train_neg, 'sample')

    print("Saving validation samples...")
    save_samples(val_positive, val_pos, 'sample')
    save_samples(val_negative, val_neg, 'sample')

    # Update stats
    stats['positive']['train'] = len(train_positive)
    stats['positive']['val'] = len(val_positive)
    stats['negative']['train'] = len(train_negative)
    stats['negative']['val'] = len(val_negative)

    # Create metadata
    metadata = {
        'window_size_ms': window_size_ms,
        'hop_size_ms': hop_size_ms,
        'sample_rate': SAMPLE_RATE,
        'val_split': val_split,
        'min_energy': min_energy,
        'seed': seed,
        'stats': stats,
        'train': {
            'positive': len(train_positive),
            'negative': len(train_negative),
            'total': len(train_positive) + len(train_negative)
        },
        'val': {
            'positive': len(val_positive),
            'negative': len(val_negative),
            'total': len(val_positive) + len(val_negative)
        }
    }

    # Save metadata
    with open(output_path / 'metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"\nDataset created successfully!")
    print(f"Train: {metadata['train']['positive']} positive, {metadata['train']['negative']} negative")
    print(f"Val: {metadata['val']['positive']} positive, {metadata['val']['negative']} negative")

    return metadata


def process_samples(
    samples: List[TrainingSample],
    label: int,
    window_samples: int,
    hop_samples: int,
    min_energy: float
) -> List[Tuple[np.ndarray, int]]:
   
    windows = []

    for sample in tqdm(samples, desc=f"Processing {'positive' if label == 1 else 'negative'} samples"):
        file_path = sample.file

        # Skip invalid files
        if not is_valid_audio_file(file_path):
            print(f"  Skipping invalid file: {file_path}")
            continue

        try:
            # Load and preprocess audio
            audio = preprocess_audio(file_path)

            # Quick energy check on full audio before processing
            if calculate_rms_energy(audio) < min_energy:
                print(f"  Skipping low-energy file: {file_path}")
                continue

            # OPTIMIZATION: Compute full spectrogram once and slice windows
            mel_windows = extract_windows_from_full_spectrogram(
                audio, window_samples, hop_samples
            )

            # Add all windows with the label
            for mel_spec in mel_windows:
                windows.append((mel_spec, label))

        except Exception as e:
            print(f"  Error processing {file_path}: {e}")
            continue

    return windows


def save_samples(
    samples: List[Tuple[np.ndarray, int]],
    output_dir: Path,
    prefix: str
) -> None:

    for i, (spec, label) in enumerate(tqdm(samples, desc="Saving samples")):
        filename = f"{prefix}_{i:06d}.npy"
        np.save(output_dir / filename, spec)


def create_manifest_template(output_path: str) -> None:

    template = {
        "positive_samples": [
            {"file": "/path/to/target_audio_clip_1.mp3", "label": "target_audio", "source": "creator_a"},
            {"file": "/path/to/target_audio_clip_2.wav", "label": "target_audio", "source": "creator_a"}
        ],
        "negative_samples": [
            {"file": "/path/to/whispering_clip.mp3", "label": "other", "source": "creator_b"},
            {"file": "/path/to/tapping_clip.wav", "label": "other", "source": "creator_c"}
        ],
        "hard_negatives": [
            {"file": "/path/to/creator_a_non_target.mp3", "label": "other", "source": "creator_a"}
        ]
    }

    with open(output_path, 'w') as f:
        json.dump(template, f, indent=2)

    print(f"Template manifest created at: {output_path}")
    print("Edit the file to add your training data paths.")


def validate_manifest(manifest_path: str) -> Tuple[bool, List[str]]:

    errors = []

    try:
        with open(manifest_path, 'r') as f:
            manifest_dict = json.load(f)
        manifest = TrainingManifest.from_dict(manifest_dict)
    except Exception as e:
        return False, [f"Failed to load manifest: {e}"]

    # Check all files exist
    all_samples = (
        manifest.positive_samples +
        manifest.negative_samples +
        manifest.hard_negatives
    )

    for sample in all_samples:
        if not Path(sample.file).exists():
            errors.append(f"File not found: {sample.file}")
        elif not is_valid_audio_file(sample.file):
            errors.append(f"Invalid audio file: {sample.file}")

    # Check we have enough samples (relaxed for large audio files)
    if len(manifest.positive_samples) < 2:
        errors.append(f"Need at least 2 positive samples, got {len(manifest.positive_samples)}")
    if len(manifest.negative_samples) < 2:
        errors.append(f"Need at least 2 negative samples, got {len(manifest.negative_samples)}")

    return len(errors) == 0, errors


def main():
    parser = argparse.ArgumentParser(
        description="Prepare training dataset for audio event detection"
    )
    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # Create template command
    template_parser = subparsers.add_parser(
        'template',
        help='Create a template manifest file'
    )
    template_parser.add_argument(
        '-o', '--output',
        default='manifest.json',
        help='Output path for template manifest'
    )

    # Validate command
    validate_parser = subparsers.add_parser(
        'validate',
        help='Validate a manifest file'
    )
    validate_parser.add_argument(
        'manifest',
        help='Path to manifest file to validate'
    )

    # Prepare command
    prepare_parser = subparsers.add_parser(
        'prepare',
        help='Prepare training dataset from manifest'
    )
    prepare_parser.add_argument(
        'manifest',
        help='Path to manifest file'
    )
    prepare_parser.add_argument(
        '-o', '--output',
        default='./dataset',
        help='Output directory for dataset'
    )
    prepare_parser.add_argument(
        '--window-size',
        type=int,
        default=1000,
        help='Window size in milliseconds (default: 1000)'
    )
    prepare_parser.add_argument(
        '--hop-size',
        type=int,
        default=250,
        help='Hop size in milliseconds (default: 250)'
    )
    prepare_parser.add_argument(
        '--val-split',
        type=float,
        default=0.2,
        help='Validation split fraction (default: 0.2)'
    )
    prepare_parser.add_argument(
        '--seed',
        type=int,
        default=42,
        help='Random seed (default: 42)'
    )

    args = parser.parse_args()

    if args.command == 'template':
        create_manifest_template(args.output)

    elif args.command == 'validate':
        print(f"Validating manifest: {args.manifest}")
        is_valid, errors = validate_manifest(args.manifest)

        if is_valid:
            print("Manifest is valid!")
        else:
            print("Manifest validation failed:")
            for error in errors:
                print(f"  - {error}")
            sys.exit(1)

    elif args.command == 'prepare':
        # First validate
        print(f"Validating manifest: {args.manifest}")
        is_valid, errors = validate_manifest(args.manifest)

        if not is_valid:
            print("Manifest validation failed:")
            for error in errors:
                print(f"  - {error}")
            sys.exit(1)

        print("Manifest is valid. Starting data preparation...")
        create_training_dataset(
            manifest_path=args.manifest,
            output_dir=args.output,
            window_size_ms=args.window_size,
            hop_size_ms=args.hop_size,
            val_split=args.val_split,
            seed=args.seed
        )

    else:
        parser.print_help()


if __name__ == '__main__':
    main()
