"""
Model Enhancer Worker

Orchestrates retraining with feedback data collected from the Enhance Model mode.
Takes labeled feedback samples and manual positives to fine-tune the audio detection model.

Input (JSON via stdin):
{
  "feedback_sessions": [...],
  "model_output_path": "/path/to/output/model.onnx",
  "original_model_path": "/path/to/original/model.onnx",
  "config": {
    "epochs": 30,
    "learning_rate": 0.001
  }
}

Output (JSON via stdout):
{
  "type": "result",
  "data": {
    "success": true,
    "model_path": "/path/to/output/model.onnx",
    "samples_used": 127,
    "final_metrics": {"f1": 0.87, "accuracy": 0.91}
  }
}
"""
import sys
from pathlib import Path
from typing import Dict, Any
import tempfile
import shutil
import subprocess

sys.path.insert(0, str(Path(__file__).parent))

from common.worker_base import WorkerBase
from common.json_io import write_progress, write_log


class ModelEnhancer(WorkerBase):
    """Worker for retraining model with feedback data."""

    def validate_input(self, input_data: Dict[str, Any]) -> None:
        has_feedback = input_data.get('feedback_sessions')
        has_bulk_positive = input_data.get('bulk_positive_files')
        has_bulk_negative = input_data.get('bulk_negative_files')

        if not has_feedback and not has_bulk_positive and not has_bulk_negative:
            raise ValueError("Need either feedback_sessions or bulk files")

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        feedback_sessions = input_data.get('feedback_sessions', [])
        bulk_positive_files = input_data.get('bulk_positive_files', [])
        bulk_negative_files = input_data.get('bulk_negative_files', [])
        model_output_path = input_data.get('model_output_path')
        original_model_path = input_data.get('original_model_path')
        config = input_data.get('config', {})

        # Fine-tuning defaults (better for incremental improvement)
        fine_tune = config.get('fine_tune', True)
        freeze_layers = config.get('freeze_layers', True)
        unfreeze_after = config.get('unfreeze_after', 5)

        # Use lower learning rate for fine-tuning by default
        default_lr = 0.0001 if fine_tune else 0.001
        default_epochs = 15 if fine_tune else 30

        epochs = config.get('epochs', default_epochs)
        learning_rate = config.get('learning_rate', default_lr)

        # Window size for slicing bulk files (in seconds)
        bulk_window_size = config.get('bulk_window_size', 1.0)
        bulk_hop_size = config.get('bulk_hop_size', 0.5)  # 50% overlap

        # Check if we have an existing model to fine-tune
        pretrained_path = None
        if fine_tune and original_model_path:
            # Look for .pt checkpoint next to the ONNX model
            onnx_path = Path(original_model_path)
            pt_path = onnx_path.parent / 'best_model.pt'
            if pt_path.exists():
                pretrained_path = str(pt_path)
                write_log(f"Found pretrained checkpoint: {pt_path}", "info")
            elif onnx_path.exists():
                write_log(f"ONNX model exists but no .pt checkpoint found - training from scratch", "info")
            else:
                write_log("No existing model found - training from scratch", "info")

        write_progress(5, "Preparing feedback data...")

        correct_samples = []
        wrong_samples = []
        manual_positives = []
        bulk_positives = []
        bulk_negatives = []  

        for session in feedback_sessions:
            source_file = session['source_file']

            for sample in session.get('samples', []):
                sample_data = {
                    'source_file': source_file,
                    'start_seconds': sample['start_seconds'],
                    'end_seconds': sample['end_seconds'],
                }
                if sample['user_label'] == 'correct':
                    correct_samples.append(sample_data)
                else:
                    wrong_samples.append(sample_data)

            # Manual positives (false negatives user marked)
            for manual in session.get('manual_positives', []):
                manual_positives.append({
                    'source_file': source_file,
                    'start_seconds': manual['start_seconds'],
                    'end_seconds': manual['end_seconds'],
                })

        # Process bulk positive files - slice into windows
        for bulk_file in bulk_positive_files:
            file_path = bulk_file if isinstance(bulk_file, str) else bulk_file.get('path')
            if not file_path or not Path(file_path).exists():
                write_log(f"Bulk file not found: {file_path}", "warning")
                continue

            # Get audio duration
            try:
                import librosa
                duration = librosa.get_duration(path=file_path)
                write_log(f"Processing bulk positive file: {Path(file_path).name} ({duration:.1f}s)", "info")

                # Slice into windows
                current_time = 0.0
                while current_time + bulk_window_size <= duration:
                    bulk_positives.append({
                        'source_file': file_path,
                        'start_seconds': current_time,
                        'end_seconds': current_time + bulk_window_size,
                    })
                    current_time += bulk_hop_size

                write_log(f"  -> Created {len([b for b in bulk_positives if b['source_file'] == file_path])} windows", "info")
            except Exception as e:
                write_log(f"Error processing bulk file {file_path}: {e}", "warning")

        # Process bulk negative files - slice into windows
        for bulk_file in bulk_negative_files:
            file_path = bulk_file if isinstance(bulk_file, str) else bulk_file.get('path')
            if not file_path or not Path(file_path).exists():
                write_log(f"Bulk negative file not found: {file_path}", "warning")
                continue

            # Get audio duration
            try:
                import librosa
                duration = librosa.get_duration(path=file_path)
                write_log(f"Processing bulk negative file: {Path(file_path).name} ({duration:.1f}s)", "info")

                # Slice into windows
                current_time = 0.0
                while current_time + bulk_window_size <= duration:
                    bulk_negatives.append({
                        'source_file': file_path,
                        'start_seconds': current_time,
                        'end_seconds': current_time + bulk_window_size,
                    })
                    current_time += bulk_hop_size

                write_log(f"  -> Created {len([b for b in bulk_negatives if b['source_file'] == file_path])} windows", "info")
            except Exception as e:
                write_log(f"Error processing bulk negative file {file_path}: {e}", "warning")

        total_feedback = len(correct_samples) + len(wrong_samples) + len(manual_positives)
        total_bulk = len(bulk_positives) + len(bulk_negatives)
        total_samples = total_feedback + total_bulk

        write_log(f"Collected {total_samples} total samples", "info")
        write_log(f"  - Correct (true positives): {len(correct_samples)}", "info")
        write_log(f"  - Wrong (false positives -> negatives): {len(wrong_samples)}", "info")
        write_log(f"  - Manual positives (false negatives): {len(manual_positives)}", "info")
        write_log(f"  - Bulk positive windows: {len(bulk_positives)}", "info")
        write_log(f"  - Bulk negative windows: {len(bulk_negatives)}", "info")

        if total_samples < 2:
            raise ValueError("Need at least 2 samples to train")

        write_progress(10, f"Processing {total_samples} feedback samples...")

        # Create temp directory for extracted audio
        temp_dir = Path(tempfile.mkdtemp(prefix="atlas_training_"))

        try:
            # Extract audio segments
            write_progress(15, "Extracting audio segments...")

            positive_dir = temp_dir / 'train' / 'positive'
            negative_dir = temp_dir / 'train' / 'negative'
            positive_dir.mkdir(parents=True, exist_ok=True)
            negative_dir.mkdir(parents=True, exist_ok=True)

            # Also create val directories for 80/20 split
            val_positive_dir = temp_dir / 'val' / 'positive'
            val_negative_dir = temp_dir / 'val' / 'negative'
            val_positive_dir.mkdir(parents=True, exist_ok=True)
            val_negative_dir.mkdir(parents=True, exist_ok=True)

            all_positives = correct_samples + manual_positives + bulk_positives
            all_negatives = wrong_samples + bulk_negatives

            # Extract correct samples and manual positives as positives
            positive_count = 0
            for i, sample in enumerate(all_positives):
                output_path = positive_dir / f"pos_{i}.wav"
                success = self._extract_segment(
                    sample['source_file'],
                    sample['start_seconds'],
                    sample['end_seconds'],
                    output_path
                )
                if success:
                    positive_count += 1

                if i % 5 == 0:
                    percent = 15 + int((i / max(1, total_samples)) * 10)
                    write_progress(percent, f"Extracting positive sample {i+1}/{len(all_positives)}...")

            # Extract wrong samples as negatives
            negative_count = 0
            for i, sample in enumerate(all_negatives):
                output_path = negative_dir / f"neg_{i}.wav"
                success = self._extract_segment(
                    sample['source_file'],
                    sample['start_seconds'],
                    sample['end_seconds'],
                    output_path
                )
                if success:
                    negative_count += 1

                if i % 5 == 0:
                    percent = 15 + int(((len(all_positives) + i) / max(1, total_samples)) * 10)
                    write_progress(percent, f"Extracting negative sample {i+1}/{len(all_negatives)}...")

            write_log(f"Extracted {positive_count} positive and {negative_count} negative samples", "info")

            if positive_count == 0:
                raise ValueError("No positive samples could be extracted. Check that audio files exist.")

            if negative_count == 0:
                write_log("Warning: No negative samples. Model may overfit to positives.", "warning")

            write_progress(25, "Preparing training dataset...")

            # Convert WAV files to mel spectrograms for training
            self._prepare_spectrograms(temp_dir, positive_dir, negative_dir)

            # Determine training mode
            if pretrained_path:
                write_progress(30, "Starting fine-tuning (loading existing model)...")
                write_log(f"Fine-tuning mode: epochs={epochs}, lr={learning_rate}, freeze_layers={freeze_layers}", "info")
            else:
                write_progress(30, "Starting model training from scratch...")
                write_log(f"Training from scratch: epochs={epochs}, lr={learning_rate}", "info")

            # Import and run training
            from ml_training.train import train_model_with_progress

            def progress_callback(epoch, total_epochs, metrics):
                percent = 30 + int((epoch / total_epochs) * 65)  # 30-95%
                mode_str = "Fine-tuning" if pretrained_path else "Training"
                stage = f"{mode_str} - Epoch {epoch}/{total_epochs}"
                if metrics:
                    stage += f" - F1: {metrics.get('f1', 0):.4f}, Acc: {metrics.get('accuracy', 0):.4f}"
                write_progress(percent, stage)

            # Build fine-tuning config if we have a pretrained model
            fine_tuning_config = None
            if pretrained_path:
                fine_tuning_config = {
                    'pretrained_path': pretrained_path,
                    'freeze_layers': freeze_layers,
                    'unfreeze_after': unfreeze_after,
                }

            result = train_model_with_progress(
                str(temp_dir),
                model_output_path,
                progress_callback,
                config_overrides={
                    'epochs': epochs,
                    'learning_rate': learning_rate,
                },
                fine_tuning=fine_tuning_config
            )

            write_progress(100, "Training complete!")

            return {
                'success': True,
                'model_path': str(model_output_path),
                'samples_used': total_samples,
                'final_metrics': result.get('metrics', {}),
                'fine_tuned': result.get('fine_tuned', False),
            }

        finally:
            # Cleanup temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _extract_segment(self, source_file: str, start: float, end: float, output_path: Path) -> bool:
        """Extract audio segment using ffmpeg."""
        try:
            # Check source file exists
            if not Path(source_file).exists():
                write_log(f"Source file not found: {source_file}", "warning")
                return False

            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start),
                '-t', str(end - start),
                '-i', source_file,
                '-acodec', 'pcm_s16le',
                '-ar', '16000',  # Match training sample rate
                '-ac', '1',      # Mono
                str(output_path)
            ]
            result = subprocess.run(cmd, capture_output=True, check=True)
            return output_path.exists()
        except subprocess.CalledProcessError as e:
            write_log(f"FFmpeg error extracting segment: {e.stderr.decode()[:200] if e.stderr else str(e)}", "warning")
            return False
        except Exception as e:
            write_log(f"Error extracting segment: {e}", "warning")
            return False

    def _prepare_spectrograms(self, temp_dir: Path, positive_dir: Path, negative_dir: Path) -> None:
        """Convert WAV files to mel spectrograms for training."""
        import numpy as np

        try:
            import librosa
        except ImportError:
            raise RuntimeError("librosa is required for spectrogram extraction")

        # Feature extraction parameters (same as inference)
        n_mels = 128
        n_fft = 2048
        hop_length = 512
        sample_rate = 16000

        def process_wav_dir(wav_dir: Path, output_dir: Path):
            output_dir.mkdir(parents=True, exist_ok=True)
            wav_files = list(wav_dir.glob('*.wav'))

            for wav_file in wav_files:
                try:
                    # Load audio
                    audio, sr = librosa.load(wav_file, sr=sample_rate, mono=True)
                    # Normalize audio waveform (must match inference preprocessing)
                    audio = librosa.util.normalize(audio)

                    # Compute mel spectrogram
                    mel_spec = librosa.feature.melspectrogram(
                        y=audio, sr=sr, n_mels=n_mels,
                        n_fft=n_fft, hop_length=hop_length
                    )
                    mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)

                    # Save as numpy array
                    output_path = output_dir / f"{wav_file.stem}.npy"
                    np.save(output_path, mel_spec_db)

                except Exception as e:
                    write_log(f"Error processing {wav_file}: {e}", "warning")

        # Process positive samples
        process_wav_dir(positive_dir, temp_dir / 'train' / 'positive')

        # Process negative samples
        process_wav_dir(negative_dir, temp_dir / 'train' / 'negative')

        # Create empty val directories with at least one sample for validation
        # (The training code will handle 80/20 split if val is empty)


if __name__ == '__main__':
    worker = ModelEnhancer()
    sys.exit(worker.run())
