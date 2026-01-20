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
from typing import Dict, List, Tuple, Optional, Any
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

        # Ensure consistent dimensions - model expects (128, 32)
        target_frames = 32
        if spec.shape[1] > target_frames:
            # Trim to target size (take center portion)
            start = (spec.shape[1] - target_frames) // 2
            spec = spec[:, start:start + target_frames]
        elif spec.shape[1] < target_frames:
            # Pad to target size
            pad_width = target_frames - spec.shape[1]
            spec = np.pad(spec, ((0, 0), (0, pad_width)), mode='constant')

        # Normalize to zero mean, unit variance (must match inference preprocessing)
        spec = (spec - spec.mean()) / (spec.std() + 1e-8)

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


def freeze_early_layers(model: nn.Module, num_blocks: int = 2) -> int:
    """
    Freeze early convolutional blocks to prevent forgetting learned features.

    Args:
        model: The CNN model to freeze layers in
        num_blocks: Number of conv blocks to freeze (default 2)

    Returns:
        Number of frozen parameters
    """
    frozen_count = 0

    # Freeze conv blocks by name pattern
    for name, param in model.named_parameters():
        # Freeze conv1, bn1, conv2, bn2 (first 2 blocks)
        should_freeze = False
        for i in range(1, num_blocks + 1):
            if f'conv{i}' in name or f'bn{i}' in name:
                should_freeze = True
                break

        if should_freeze:
            param.requires_grad = False
            frozen_count += param.numel()

    return frozen_count


def unfreeze_all_layers(model: nn.Module) -> None:
    """Unfreeze all layers for gradual fine-tuning."""
    for param in model.parameters():
        param.requires_grad = True


def load_pretrained_weights(model: nn.Module, checkpoint_path: str, device: torch.device) -> bool:
    """
    Load pretrained weights from a PyTorch checkpoint.

    Args:
        model: The model to load weights into
        checkpoint_path: Path to .pt checkpoint file
        device: Device to load weights to

    Returns:
        True if weights were loaded successfully, False otherwise
    """
    try:
        checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)

        # Handle different checkpoint formats
        if isinstance(checkpoint, dict):
            if 'model_state_dict' in checkpoint:
                state_dict = checkpoint['model_state_dict']
            elif 'state_dict' in checkpoint:
                state_dict = checkpoint['state_dict']
            else:
                state_dict = checkpoint
        else:
            state_dict = checkpoint

        # Load state dict with strict=False to handle minor architecture differences
        model.load_state_dict(state_dict, strict=False)
        return True

    except Exception as e:
        print(f"Warning: Could not load pretrained weights: {e}")
        return False


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


def train_model_with_progress(
    data_dir: str,
    output_path: str,
    progress_callback=None,
    config_overrides: Dict = None,
    fine_tuning: Dict = None
) -> Dict[str, Any]:
    """
    Train model with progress callback for UI integration.

    Args:
        data_dir: Path to prepared dataset (with train/positive, train/negative dirs)
        output_path: Path for output ONNX model
        progress_callback: Callable(epoch, total_epochs, metrics) for progress updates
        config_overrides: Optional config overrides (epochs, learning_rate, etc.)
        fine_tuning: Optional fine-tuning config:
            - pretrained_path: Path to existing .pt checkpoint
            - freeze_layers: Whether to freeze early layers (default True)
            - unfreeze_after: Epoch to unfreeze all layers (default 5)

    Returns:
        Dict with training results and metrics
    """
    # Use default config with overrides
    config_dict = {
        'data_dir': data_dir,
        'batch_size': 64,
        'learning_rate': 0.001,
        'weight_decay': 0.01,
        'epochs': 30,  # Default for fine-tuning
        'early_stopping_patience': 5,
        'augmentation': {
            'time_mask_max_width': 5,
            'freq_mask_max_width': 10,
            'gain_range': [-3, 3],
            'mixup_alpha': 0.2,
        },
        'class_weights': {'positive': 1.0, 'negative': 1.0},
        'output_dir': str(Path(output_path).parent),
        'export_onnx': True,
        'model': {'architecture': 'cnn_v1'},
    }

    # Apply user overrides
    if config_overrides:
        for key, value in config_overrides.items():
            if key in config_dict:
                config_dict[key] = value

    config = TrainingConfig.from_dict(config_dict)

    # Setup device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Training with device: {device}")

    # Enable mixed precision training for RTX GPUs
    use_amp = device.type == 'cuda'
    scaler = torch.amp.GradScaler('cuda') if use_amp else None

    # Create datasets
    train_dataset = AudioDataset(data_dir, split='train', augment=True, config=config)
    val_dataset = AudioDataset(data_dir, split='val', augment=False, config=config)

    # Use 80/20 split if no val folder or empty val
    if len(val_dataset) == 0 and len(train_dataset) > 0:
        train_size = int(0.8 * len(train_dataset))
        val_size = len(train_dataset) - train_size
        if val_size > 0:
            train_dataset, val_dataset = torch.utils.data.random_split(
                train_dataset, [train_size, val_size]
            )
        else:
            # Very small dataset - use same data for train and val
            val_dataset = train_dataset

    if len(train_dataset) == 0:
        raise ValueError("No training samples found in dataset")

    num_workers = 4 if device.type == 'cuda' else 0
    train_loader = DataLoader(
        train_dataset, batch_size=config.batch_size, shuffle=True,
        num_workers=num_workers, pin_memory=True if device.type == 'cuda' else False
    )
    val_loader = DataLoader(
        val_dataset, batch_size=config.batch_size * 2, shuffle=False,
        num_workers=num_workers, pin_memory=True if device.type == 'cuda' else False
    )

    # Create model
    model = create_model('cnn_v1').to(device)

    # Handle fine-tuning: load pretrained weights and optionally freeze layers
    is_fine_tuning = False
    freeze_layers = False
    unfreeze_after_epoch = 5

    if fine_tuning:
        pretrained_path = fine_tuning.get('pretrained_path')
        freeze_layers = fine_tuning.get('freeze_layers', True)
        unfreeze_after_epoch = fine_tuning.get('unfreeze_after', 5)

        if pretrained_path and Path(pretrained_path).exists():
            print(f"\n*** FINE-TUNING MODE ***")
            print(f"Loading pretrained weights from: {pretrained_path}")

            if load_pretrained_weights(model, pretrained_path, device):
                is_fine_tuning = True
                print(f"Successfully loaded pretrained weights")

                if freeze_layers:
                    frozen_count = freeze_early_layers(model, num_blocks=2)
                    trainable_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
                    total_count = sum(p.numel() for p in model.parameters())
                    print(f"Frozen {frozen_count:,} parameters ({frozen_count/total_count*100:.1f}%)")
                    print(f"Trainable: {trainable_count:,} parameters")
                    print(f"Will unfreeze all layers after epoch {unfreeze_after_epoch}")
            else:
                print("Could not load pretrained weights, training from scratch")
        else:
            print("No pretrained model found, training from scratch")
    else:
        print("Training from scratch (no fine-tuning config provided)")

    # Calculate class weights to handle imbalance
    # Count positive and negative samples
    if hasattr(train_dataset, 'samples'):
        # Direct AudioDataset
        num_pos = sum(1 for _, label in train_dataset.samples if label == 1)
        num_neg = len(train_dataset.samples) - num_pos
    else:
        # Subset from random_split - count from underlying dataset
        underlying = train_dataset.dataset if hasattr(train_dataset, 'dataset') else train_dataset
        if hasattr(underlying, 'samples'):
            num_pos = sum(1 for _, label in underlying.samples if label == 1)
            num_neg = len(underlying.samples) - num_pos
        else:
            num_pos, num_neg = 1, 1  # Fallback to no weighting

    # Weight positive class higher when there are more negatives
    # Cap at 3.0 to balance up to 1:3 ratio without over-correction
    pos_weight_value = min(num_neg / max(num_pos, 1), 3.0)
    pos_weight = torch.tensor([pos_weight_value]).to(device)
    print(f"Class weighting: pos_weight={pos_weight_value:.2f} (positives={num_pos}, negatives={num_neg})")

    # Loss and optimizer
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),  # Only optimize trainable params
        lr=config.learning_rate,
        weight_decay=config.weight_decay
    )
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=config.epochs)

    # Training loop
    best_f1 = 0
    best_metrics = None
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)
    best_model_path = output_dir / 'best_model.pt'
    layers_unfrozen = False

    for epoch in range(config.epochs):
        # Gradual unfreezing: unfreeze all layers after specified epoch
        if is_fine_tuning and freeze_layers and not layers_unfrozen and epoch >= unfreeze_after_epoch:
            print(f"\n*** Unfreezing all layers at epoch {epoch + 1} ***")
            unfreeze_all_layers(model)
            layers_unfrozen = True

            # Recreate optimizer with all parameters and lower learning rate
            optimizer = optim.AdamW(
                model.parameters(),
                lr=config.learning_rate * 0.1,  # Lower LR for unfrozen layers
                weight_decay=config.weight_decay
            )
            # Reset scheduler with remaining epochs
            remaining_epochs = config.epochs - epoch
            scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=remaining_epochs)
            print(f"Learning rate reduced to {config.learning_rate * 0.1} for fine-tuning all layers")

        train_metrics = train_epoch(model, train_loader, criterion, optimizer, device, scaler, use_amp)
        val_metrics = evaluate(model, val_loader, criterion, device, use_amp)
        scheduler.step()

        # Call progress callback
        if progress_callback:
            progress_callback(epoch + 1, config.epochs, val_metrics)

        # Save best model
        if val_metrics['f1'] > best_f1:
            best_f1 = val_metrics['f1']
            best_metrics = val_metrics
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'val_metrics': val_metrics,
            }, best_model_path)

    # Export to ONNX
    if best_model_path.exists():
        checkpoint = torch.load(best_model_path, weights_only=False)
        model.load_state_dict(checkpoint['model_state_dict'])
        model.eval()
        export_to_onnx(model, output_path)

    # Print final training summary
    print("\n" + "=" * 50)
    print("TRAINING COMPLETE" + (" (Fine-tuned)" if is_fine_tuning else " (From scratch)"))
    print("=" * 50)
    if best_metrics:
        print(f"  F1 Score:    {best_metrics.get('f1', 0):.4f}")
        print(f"  Accuracy:    {best_metrics.get('accuracy', 0):.4f}")
        print(f"  Precision:   {best_metrics.get('precision', 0):.4f}")
        print(f"  Recall:      {best_metrics.get('recall', 0):.4f}")
        print(f"  AUC:         {best_metrics.get('auc', 0):.4f}")
    print(f"  Model saved: {output_path}")
    if is_fine_tuning:
        print(f"  Mode: Fine-tuning with {'layer freezing' if freeze_layers else 'all layers trainable'}")
    print("=" * 50 + "\n")

    return {
        'metrics': best_metrics,
        'model_path': str(output_path),
        'fine_tuned': is_fine_tuning,
    }


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
