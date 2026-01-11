"""
Export trained PyTorch model (.pt) to ONNX format for inference.

Usage:
    python python_workers/ml_training/export_onnx.py <path_to_checkpoint.pt> [output_path.onnx]

Example:
    python python_workers/ml_training/export_onnx.py "D:/Tools/training_data/output/best_model.pt"
"""
import argparse
import sys
from pathlib import Path

import torch

# Add parent directory for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from ml_training.model import create_model, export_to_onnx, verify_onnx_model


def main():
    parser = argparse.ArgumentParser(description="Export PyTorch model to ONNX")
    parser.add_argument(
        'checkpoint',
        help='Path to the .pt checkpoint file'
    )
    parser.add_argument(
        'output',
        nargs='?',
        default=None,
        help='Output ONNX path (default: same directory as checkpoint)'
    )
    args = parser.parse_args()

    checkpoint_path = Path(args.checkpoint)
    if not checkpoint_path.exists():
        print(f"Error: Checkpoint not found: {checkpoint_path}")
        sys.exit(1)

    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = checkpoint_path.parent / "audio_event_detector.onnx"

    print(f"Loading checkpoint: {checkpoint_path}")
    checkpoint = torch.load(checkpoint_path, map_location='cpu')

    # Get model architecture from checkpoint config
    config = checkpoint.get('config', {})
    architecture = config.get('model', {}).get('architecture', 'cnn_v1')

    print(f"Model architecture: {architecture}")
    print(f"Trained for {checkpoint.get('epoch', '?')} epochs")
    print(f"Validation metrics: {checkpoint.get('val_metrics', {})}")

    # Create and load model
    model = create_model(architecture)
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()

    print(f"\nExporting to ONNX: {output_path}")
    export_to_onnx(model, str(output_path))

    print("\nVerifying ONNX model...")
    if verify_onnx_model(str(output_path), model):
        print(f"\nSuccess! ONNX model saved to: {output_path}")
        print(f"\nYou can now use it with the audio detector:")
        print(f'  echo {{"input_file": "video.mp4", "model_path": "{output_path}"}} | python python_workers/audio_event_detector.py')
    else:
        print("\nWarning: ONNX verification failed, but model was exported.")


if __name__ == '__main__':
    main()
