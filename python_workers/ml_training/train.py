"""
Training script for the audio event detection model.
"""
import os
import json
import yaml
import argparse
import platform
import numpy as np
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import sys
from datetime import datetime

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torch.utils.tensorboard import SummaryWriter
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
)
from tqdm import tqdm

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from common.audio_types import TrainingConfig
from ml_training.model import create_model, export_to_onnx, verify_onnx_model
from ml_training.feature_extraction import (
    apply_time_masking, apply_frequency_masking, apply_gain_augmentation, mixup
)


class AudioDataset(Dataset):
    """PyTorch Dataset for mel spectrogram samples."""

    def __init__(
        self,
        data_dir: str,
        split: str = 'train',
        augment: bool = False,
        config: Optional[TrainingConfig] = None
    ):
        """
        Args:
            data_dir: Path to dataset directory
            split: 'train' or 'val'
            augment: Whether to apply data augmentation
            config: Training configuration for augmentation params
        """
        self.data_dir = Path(data_dir)
        self.split = split
        self.augment = augment
        self.config = config or TrainingConfig()

        # Load positive samples
        pos_dir = self.data_dir / split / 'positive'
        self.positive_files = list(pos_dir.glob('*.npy'))

        # Load negative samples
        neg_dir = self.data_dir / split / 'negative'
        self.negative_files = list(neg_dir.glob('*.npy'))

        # Combine with labels
        self.samples = [
            (f, 1) for f in self.positive_files
        ] + [
            (f, 0) for f in self.negative_files
        ]

        print(f"Loaded {len(self.positive_files)} positive and {len(self.negative_files)} negative {split} samples")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        file_path, label = self.samples[idx]

        # Load spectrogram
        spec = np.load(file_path)

        # Apply augmentation if training
        if self.augment and self.split == 'train':
            spec = self._apply_augmentation(spec)

        # Add channel dimension: (n_mels, time) -> (1, n_mels, time)
        spec = spec[np.newaxis, :, :]

        return (
            torch.FloatTensor(spec),
            torch.FloatTensor([label])
        )

    def _apply_augmentation(self, spec: np.ndarray) -> np.ndarray:
        """Apply data augmentation to spectrogram."""
        # Time masking
        if np.random.random() < 0.5:
            spec = apply_time_masking(spec, self.config.time_mask_max_width)

        # Frequency masking
        if np.random.random() < 0.5:
            spec = apply_frequency_masking(spec, self.config.freq_mask_max_width)

        # Gain augmentation
        if np.random.random() < 0.5:
            spec = apply_gain_augmentation(spec, self.config.gain_range)

        return spec


class EarlyStopping:
    """Early stopping to prevent overfitting."""

    def __init__(self, patience: int = 10, min_delta: float = 0.0):
        self.patience = patience
        self.min_delta = min_delta
        self.counter = 0
        self.best_score = None
        self.early_stop = False

    def __call__(self, score: float) -> bool:
        if self.best_score is None:
            self.best_score = score
        elif score < self.best_score + self.min_delta:
            self.counter += 1
            if self.counter >= self.patience:
                self.early_stop = True
        else:
            self.best_score = score
            self.counter = 0

        return self.early_stop


def train_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: optim.Optimizer,
    device: torch.device,
    scaler: Optional[torch.cuda.amp.GradScaler] = None,
    use_amp: bool = False
) -> Dict[str, float]:
    """Train for one epoch with optional mixed precision."""
    model.train()

    total_loss = 0
    all_preds = []
    all_labels = []

    for batch_x, batch_y in tqdm(loader, desc="Training", leave=False):
        batch_x = batch_x.to(device, non_blocking=True)
        batch_y = batch_y.to(device, non_blocking=True)

        optimizer.zero_grad()

        # Mixed precision training
        if use_amp and scaler is not None:
            with torch.amp.autocast('cuda'):
                outputs = model(batch_x)
                loss = criterion(outputs, batch_y)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
        else:
            outputs = model(batch_x)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()

        total_loss += loss.item()
        # Apply sigmoid to convert logits to probabilities for metrics
        probs = torch.sigmoid(outputs).detach().cpu().numpy()
        all_preds.extend(probs)
        all_labels.extend(batch_y.cpu().numpy())

    # Calculate metrics
    all_preds = np.array(all_preds).flatten()
    all_labels = np.array(all_labels).flatten()
    pred_binary = (all_preds > 0.5).astype(int)

    return {
        'loss': total_loss / len(loader),
        'accuracy': accuracy_score(all_labels, pred_binary),
        'precision': precision_score(all_labels, pred_binary, zero_division=0),
        'recall': recall_score(all_labels, pred_binary, zero_division=0),
        'f1': f1_score(all_labels, pred_binary, zero_division=0),
        'auc': roc_auc_score(all_labels, all_preds) if len(np.unique(all_labels)) > 1 else 0
    }


def evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    use_amp: bool = False
) -> Dict[str, float]:
    """Evaluate model on validation set with optional mixed precision."""
    model.eval()

    total_loss = 0
    all_preds = []
    all_labels = []

    with torch.no_grad():
        for batch_x, batch_y in tqdm(loader, desc="Evaluating", leave=False):
            batch_x = batch_x.to(device, non_blocking=True)
            batch_y = batch_y.to(device, non_blocking=True)

            # Use AMP for inference too
            if use_amp:
                with torch.amp.autocast('cuda'):
                    outputs = model(batch_x)
                    loss = criterion(outputs, batch_y)
            else:
                outputs = model(batch_x)
                loss = criterion(outputs, batch_y)

            total_loss += loss.item()
            # Apply sigmoid to convert logits to probabilities for metrics
            probs = torch.sigmoid(outputs).cpu().numpy()
            all_preds.extend(probs)
            all_labels.extend(batch_y.cpu().numpy())

    # Calculate metrics
    all_preds = np.array(all_preds).flatten()
    all_labels = np.array(all_labels).flatten()
    pred_binary = (all_preds > 0.5).astype(int)

    return {
        'loss': total_loss / len(loader),
        'accuracy': accuracy_score(all_labels, pred_binary),
        'precision': precision_score(all_labels, pred_binary, zero_division=0),
        'recall': recall_score(all_labels, pred_binary, zero_division=0),
        'f1': f1_score(all_labels, pred_binary, zero_division=0),
        'auc': roc_auc_score(all_labels, all_preds) if len(np.unique(all_labels)) > 1 else 0
    }


def train_model(config_path: str) -> str:
    """
    Train the audio event detection model.

    Args:
        config_path: Path to training configuration YAML file

    Returns:
        Path to best model checkpoint
    """
    # Load config
    with open(config_path, 'r') as f:
        config_dict = yaml.safe_load(f)

    config = TrainingConfig.from_dict(config_dict)
    data_dir = config_dict.get('data_dir', './dataset')
    model_architecture = config_dict.get('model', {}).get('architecture', 'cnn_v1')

    # Create output directory
    output_dir = Path(config.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Setup device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")

    # Check CUDA capabilities
    if device.type == 'cuda':
        print(f"  GPU: {torch.cuda.get_device_name(0)}")
        print(f"  CUDA Version: {torch.version.cuda}")
        print(f"  Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    # Enable mixed precision training for RTX GPUs (2x faster)
    use_amp = device.type == 'cuda' and torch.cuda.is_available()
    scaler = torch.amp.GradScaler('cuda') if use_amp else None
    if use_amp:
        print("  Mixed Precision (AMP): ENABLED ⚡")

    # Create datasets
    train_dataset = AudioDataset(data_dir, split='train', augment=True, config=config)
    val_dataset = AudioDataset(data_dir, split='val', augment=False, config=config)

    # Optimize num_workers for multi-threaded data loading
    # For RTX 4070, use 4-8 workers for faster data loading
    num_workers = 4 if device.type == 'cuda' else 0

    # Create dataloaders
    train_loader = DataLoader(
        train_dataset,
        batch_size=config.batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=True if device.type == 'cuda' else False,
        persistent_workers=True if num_workers > 0 else False,  # Keep workers alive
        prefetch_factor=2 if num_workers > 0 else None  # Prefetch batches
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=config.batch_size * 2,  # Larger batch for validation (no gradients)
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True if device.type == 'cuda' else False,
        persistent_workers=True if num_workers > 0 else False,
        prefetch_factor=2 if num_workers > 0 else None
    )

    # Create model
    model = create_model(model_architecture)
    model = model.to(device)
    print(f"Model: {model_architecture} ({model.count_parameters():,} parameters)")

    # Compile model for PyTorch 2.0+ (30% faster)
    # Note: torch.compile with inductor backend requires Triton, which is not supported on Windows
    if hasattr(torch, 'compile') and device.type == 'cuda' and platform.system() != 'Windows':
        try:
            model = torch.compile(model, mode='default')
            print("  Model Compilation: ENABLED ⚡")
        except Exception as e:
            print(f"  Model Compilation: Skipped ({str(e)})")
    elif platform.system() == 'Windows' and device.type == 'cuda':
        print("  Model Compilation: Skipped (Triton not supported on Windows)")

    # Loss function with class weighting
    # BCEWithLogitsLoss is numerically stable and safe for mixed precision training
    pos_weight = torch.tensor([config.positive_weight / config.negative_weight])
    pos_weight = pos_weight.to(device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    # Optimizer
    optimizer = optim.AdamW(
        model.parameters(),
        lr=config.learning_rate,
        weight_decay=config.weight_decay
    )

    # Learning rate scheduler
    scheduler = optim.lr_scheduler.CosineAnnealingLR(
        optimizer,
        T_max=config.epochs,
        eta_min=config.learning_rate * 0.01
    )

    # Tensorboard
    log_dir = output_dir / 'logs' / datetime.now().strftime('%Y%m%d_%H%M%S')
    writer = SummaryWriter(log_dir=str(log_dir))

    # Early stopping
    early_stopping = EarlyStopping(patience=config.early_stopping_patience)

    # Training loop
    best_f1 = 0
    best_model_path = None

    print(f"\nStarting training for {config.epochs} epochs...")

    for epoch in range(config.epochs):
        print(f"\nEpoch {epoch + 1}/{config.epochs}")

        # Train
        train_metrics = train_epoch(model, train_loader, criterion, optimizer, device, scaler, use_amp)

        # Validate
        val_metrics = evaluate(model, val_loader, criterion, device, use_amp)

        # Update learning rate
        scheduler.step()

        # Log metrics
        print(f"  Train - Loss: {train_metrics['loss']:.4f}, Acc: {train_metrics['accuracy']:.4f}, "
              f"F1: {train_metrics['f1']:.4f}, AUC: {train_metrics['auc']:.4f}")
        print(f"  Val   - Loss: {val_metrics['loss']:.4f}, Acc: {val_metrics['accuracy']:.4f}, "
              f"F1: {val_metrics['f1']:.4f}, AUC: {val_metrics['auc']:.4f}")

        # Tensorboard logging
        for name, value in train_metrics.items():
            writer.add_scalar(f'train/{name}', value, epoch)
        for name, value in val_metrics.items():
            writer.add_scalar(f'val/{name}', value, epoch)
        writer.add_scalar('lr', scheduler.get_last_lr()[0], epoch)

        # Save best model (by validation F1)
        if val_metrics['f1'] > best_f1:
            best_f1 = val_metrics['f1']
            best_model_path = output_dir / 'best_model.pt'
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_metrics': val_metrics,
                'config': config_dict
            }, best_model_path)
            print(f"  Saved new best model (F1: {best_f1:.4f})")

        # Early stopping
        if early_stopping(val_metrics['f1']):
            print(f"\nEarly stopping triggered after {epoch + 1} epochs")
            break

    writer.close()

    # Export to ONNX
    if config.export_onnx and best_model_path:
        print("\nExporting model to ONNX...")

        # Load best model
        checkpoint = torch.load(best_model_path)
        model.load_state_dict(checkpoint['model_state_dict'])
        model.eval()

        onnx_path = output_dir / 'audio_event_detector.onnx'
        export_to_onnx(model, str(onnx_path))

        # Verify ONNX model
        verify_onnx_model(str(onnx_path), model)

    print(f"\nTraining complete!")
    print(f"Best model saved to: {best_model_path}")
    print(f"Best validation F1: {best_f1:.4f}")

    return str(best_model_path)


def main():
    parser = argparse.ArgumentParser(
        description="Train audio event detection model"
    )
    parser.add_argument(
        'config',
        help='Path to training configuration YAML file'
    )
    parser.add_argument(
        '--resume',
        type=str,
        default=None,
        help='Path to checkpoint to resume from'
    )

    args = parser.parse_args()

    if not Path(args.config).exists():
        print(f"Config file not found: {args.config}")
        sys.exit(1)

    train_model(args.config)


if __name__ == '__main__':
    main()
