"""
CNN model architecture for audio event detection.
"""
import torch
import torch.nn as nn
from typing import Tuple


class AudioEventDetector(nn.Module):
    """
    Lightweight CNN for audio event detection.

    Input: Mel spectrogram (1, 128, 32) - (channels, n_mels, time_frames)
    Output: Binary logits (target_audio vs. other) - apply sigmoid for probability

    Architecture optimized for:
    - Fast CPU inference (< 10ms per window)
    - Small model size (< 5MB)
    - Sufficient capacity for single-creator classification
    """

    def __init__(self, n_mels: int = 128, time_frames: int = 32):
        super().__init__()

        self.n_mels = n_mels
        self.time_frames = time_frames

        # Feature extraction blocks
        self.features = nn.Sequential(
            # Block 1: (1, 128, 32) -> (32, 64, 16)
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),

            # Block 2: (32, 64, 16) -> (64, 32, 8)
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),

            # Block 3: (64, 32, 8) -> (128, 16, 4)
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),

            # Block 4: (128, 16, 4) -> (256, 8, 2)
            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
        )

        # Classifier head (outputs logits, not probabilities)
        self.classifier = nn.Sequential(
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Flatten(),
            nn.Dropout(0.5),
            nn.Linear(256, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(64, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Args:
            x: Input tensor of shape (batch, 1, n_mels, time_frames)

        Returns:
            Logits tensor of shape (batch, 1) - apply sigmoid for probability
        """
        x = self.features(x)
        x = self.classifier(x)
        return x

    def get_feature_dim(self) -> int:
        """Get the dimension of the feature vector before classification."""
        return 256

    def count_parameters(self) -> int:
        """Count total number of trainable parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


class AudioEventDetectorV2(nn.Module):
    """
    Enhanced version with residual connections for better gradient flow.
    Slightly larger but more accurate.
    """

    def __init__(self, n_mels: int = 128, time_frames: int = 32):
        super().__init__()

        self.n_mels = n_mels
        self.time_frames = time_frames

        # Initial convolution
        self.conv1 = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
        )

        # Residual blocks
        self.res_block1 = ResidualBlock(32, 64)
        self.res_block2 = ResidualBlock(64, 128)
        self.res_block3 = ResidualBlock(128, 256)

        # Classifier (outputs logits, not probabilities)
        self.classifier = nn.Sequential(
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Flatten(),
            nn.Dropout(0.5),
            nn.Linear(256, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(64, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.conv1(x)
        x = self.res_block1(x)
        x = self.res_block2(x)
        x = self.res_block3(x)
        x = self.classifier(x)
        return x


class ResidualBlock(nn.Module):
    """Residual block with skip connection."""

    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()

        self.conv_block = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
        )

        # Skip connection
        self.skip = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=1),
            nn.BatchNorm2d(out_channels),
        ) if in_channels != out_channels else nn.Identity()

        self.relu = nn.ReLU(inplace=True)
        self.pool = nn.MaxPool2d(2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        identity = self.skip(x)
        out = self.conv_block(x)
        out = out + identity
        out = self.relu(out)
        out = self.pool(out)
        return out


def create_model(architecture: str = "cnn_v1", **kwargs) -> nn.Module:
    """
    Factory function to create model by architecture name.

    Args:
        architecture: Model architecture name ("cnn_v1" or "cnn_v2")
        **kwargs: Additional arguments passed to model constructor

    Returns:
        Model instance
    """
    if architecture == "cnn_v1":
        return AudioEventDetector(**kwargs)
    elif architecture == "cnn_v2":
        return AudioEventDetectorV2(**kwargs)
    else:
        raise ValueError(f"Unknown architecture: {architecture}")


class ModelWithSigmoid(nn.Module):
    """Wrapper that adds sigmoid to model output for inference/ONNX export."""

    def __init__(self, model: nn.Module):
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.model(x))


def export_to_onnx(
    model: nn.Module,
    output_path: str,
    input_shape: Tuple[int, int, int, int] = (1, 1, 128, 32),
    opset_version: int = None,
    log_fn=None
) -> None:
    """
    Export trained PyTorch model to ONNX format.

    ONNX provides:
    - Faster inference via ONNX Runtime
    - No PyTorch dependency at inference time
    - Smaller runtime footprint

    Args:
        model: Trained PyTorch model (outputs logits)
        output_path: Path to save ONNX model
        input_shape: Input tensor shape (batch, channels, n_mels, time_frames)
        opset_version: ONNX opset version (None = use latest supported)
        log_fn: Optional logging function (default: print)
    """
    if log_fn is None:
        log_fn = print  # Default for CLI

    # Use latest supported opset version if not specified
    # PyTorch's torch.onnx.export() supports up to opset 20
    MAX_PYTORCH_OPSET = 20
    if opset_version is None:
        import onnx
        onnx_opset = onnx.defs.onnx_opset_version()
        opset_version = min(onnx_opset, MAX_PYTORCH_OPSET)
        log_fn(f"Using ONNX opset version: {opset_version} (ONNX lib supports {onnx_opset}, PyTorch supports up to {MAX_PYTORCH_OPSET})")
    # Move model to CPU for ONNX export (ONNX is device-agnostic)
    model_cpu = model.cpu()

    # Wrap model to include sigmoid for inference
    model_with_sigmoid = ModelWithSigmoid(model_cpu)
    model_with_sigmoid.eval()

    # Create dummy input on CPU
    dummy_input = torch.randn(*input_shape)

    # Export to ONNX
    torch.onnx.export(
        model_with_sigmoid,
        dummy_input,
        output_path,
        input_names=['mel_spectrogram'],
        output_names=['probability'],
        dynamic_axes={
            'mel_spectrogram': {0: 'batch_size'},
            'probability': {0: 'batch_size'}
        },
        opset_version=opset_version,
        do_constant_folding=True
    )

    log_fn(f"Model exported to ONNX: {output_path}")


def verify_onnx_model(onnx_path: str, torch_model: nn.Module, log_fn=None) -> bool:
    """
    Verify that ONNX model produces same outputs as PyTorch model.

    Args:
        onnx_path: Path to ONNX model
        torch_model: Original PyTorch model (outputs logits)
        log_fn: Optional logging function (default: print)

    Returns:
        True if outputs match within tolerance
    """
    import onnxruntime as ort
    import numpy as np

    if log_fn is None:
        log_fn = print  # Default for CLI

    # Wrap model with sigmoid to match ONNX output
    model_with_sigmoid = ModelWithSigmoid(torch_model)
    model_with_sigmoid.eval()

    # Create test input
    test_input = torch.randn(1, 1, 128, 32)

    # PyTorch inference (with sigmoid)
    with torch.no_grad():
        torch_output = model_with_sigmoid(test_input).numpy()

    # ONNX inference
    ort_session = ort.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
    onnx_output = ort_session.run(
        None,
        {'mel_spectrogram': test_input.numpy()}
    )[0]

    # Compare outputs
    max_diff = np.max(np.abs(torch_output - onnx_output))
    is_close = max_diff < 1e-5

    if is_close:
        log_fn(f"ONNX verification passed (max diff: {max_diff:.2e})")
    else:
        log_fn(f"ONNX verification FAILED (max diff: {max_diff:.2e})")

    return is_close


if __name__ == '__main__':
    # Quick test
    model = create_model("cnn_v1")
    print(f"Model: AudioEventDetector")
    print(f"Parameters: {model.count_parameters():,}")

    # Test forward pass
    x = torch.randn(4, 1, 128, 32)
    logits = model(x)
    probs = torch.sigmoid(logits)
    print(f"Input shape: {x.shape}")
    print(f"Output shape: {logits.shape}")
    print(f"Logits range: [{logits.min().item():.4f}, {logits.max().item():.4f}]")
    print(f"Probability range: [{probs.min().item():.4f}, {probs.max().item():.4f}]")
