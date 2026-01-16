"""
Audio Event Detection Worker

Runs inference on audio files to detect target audio segments using a trained ONNX model.

Input (JSON via stdin):
{
  "input_file": "/path/to/audio.mp3",
  "model_path": "/path/to/model.onnx",
  "config": {
    "window_size_ms": 1000,
    "hop_size_ms": 250,
    "confidence_threshold": 0.7,
    "min_segment_duration_ms": 500,
    "merge_gap_ms": 300
  }
}

Output (JSON via stdout):
{
  "type": "result",
  "data": {
    "segments": [
      {"start_seconds": 12.5, "end_seconds": 18.25, "confidence": 0.85, "label": "target_audio"},
      {"start_seconds": 45.0, "end_seconds": 52.75, "confidence": 0.92, "label": "target_audio"}
    ],
    "total_duration_seconds": 180.0,
    "detected_duration_seconds": 13.5,
    "model_version": "v1.0.0"
  }
}

Progress updates (JSON lines to stdout during processing):
{"type": "progress", "percent": 25, "stage": "Extracting features..."}
{"type": "progress", "percent": 50, "stage": "Running inference..."}
{"type": "progress", "percent": 75, "stage": "Post-processing..."}
"""
import json
import sys
import os
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional, TYPE_CHECKING
import numpy as np

if TYPE_CHECKING:
    import onnxruntime as ort

# Add parent directories for imports
sys.path.insert(0, str(Path(__file__).parent))
from common.worker_base import WorkerBase
from common.json_io import write_progress, write_error, write_log
from common.audio_types import (
    ModelConfig, AudioDetectionResult, TimestampSegment, SAMPLE_RATE
)


class AudioEventDetector(WorkerBase):
    """Worker for detecting audio events using ONNX model."""

    MODEL_VERSION = "v1.0.0"

    def validate_input(self, input_data: Dict[str, Any]) -> None:
        """Validate input parameters."""
        if 'input_file' not in input_data:
            raise ValueError("Missing required field: input_file")

        if 'model_path' not in input_data:
            raise ValueError("Missing required field: model_path")

        # Check files exist
        input_file = input_data['input_file']
        model_path = input_data['model_path']

        if not os.path.exists(input_file):
            raise FileNotFoundError(f"Input file not found: {input_file}")

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process audio file and detect target audio segments.

        Args:
            input_data: Dictionary with input_file, model_path, and optional config

        Returns:
            Detection result dictionary
        """
        input_file = input_data['input_file']
        model_path = input_data['model_path']

        # Parse config
        config_dict = input_data.get('config', {})
        config = ModelConfig.from_dict(config_dict) if config_dict else ModelConfig()

        write_progress(0, "Loading audio file...")

        # Import heavy dependencies here to avoid slow startup for validation
        import librosa
        import onnxruntime as ort

        # Check if input is a video file and extract audio if needed
        audio_file = self._handle_video_input(input_file)

        # Load and preprocess audio
        audio, sr = librosa.load(audio_file, sr=SAMPLE_RATE, mono=True)
        audio = librosa.util.normalize(audio)
        total_duration = len(audio) / SAMPLE_RATE

        write_log(f"Loaded audio: {total_duration:.1f}s duration", "info")
        write_progress(10, "Loading model...")

        # Load ONNX model with GPU acceleration if available
        try:
            # Try CUDA first (GPU), fall back to CPU if not available
            available_providers = ort.get_available_providers()
            write_log(f"Available ONNX providers: {available_providers}", "info")

            if 'CUDAExecutionProvider' in available_providers:
                # Try to create session with CUDA provider explicitly
                cuda_options = {
                    'device_id': 0,
                    'arena_extend_strategy': 'kNextPowerOfTwo',
                    'gpu_mem_limit': 4 * 1024 * 1024 * 1024,  # 4GB limit
                    'cudnn_conv_algo_search': 'EXHAUSTIVE',
                    'do_copy_in_default_stream': True,
                }

                providers = [
                    ('CUDAExecutionProvider', cuda_options),
                    'CPUExecutionProvider'
                ]
                write_log("Attempting to load model with CUDA...", "info")

                ort_session = ort.InferenceSession(
                    model_path,
                    providers=providers
                )

                # Check which provider was actually used
                actual_provider = ort_session.get_providers()[0]
                write_log(f"Model loaded with provider: {actual_provider}", "info")

                if actual_provider == 'CUDAExecutionProvider':
                    write_log("✓ Successfully using GPU acceleration (CUDA)", "info")
                else:
                    write_log(f"WARNING: CUDA available but fell back to {actual_provider}", "warning")
                    write_log("Possible reasons: missing cuDNN, incompatible CUDA version, or model incompatibility", "warning")
            else:
                providers = ['CPUExecutionProvider']
                write_log("CUDA not available, using CPU", "info")
                ort_session = ort.InferenceSession(
                    model_path,
                    providers=providers
                )
        except Exception as e:
            write_log(f"Error loading model with CUDA: {e}", "error")
            write_log("Falling back to CPU...", "warning")
            # Fallback to CPU only
            ort_session = ort.InferenceSession(
                model_path,
                providers=['CPUExecutionProvider']
            )

        write_progress(20, "Running inference...")

        # Run sliding window inference
        predictions = self._run_inference(
            audio, ort_session, config
        )

        write_progress(75, "Post-processing results...")

        # Post-process predictions into segments
        segments = self._postprocess_predictions(predictions, config)

        # Calculate detected duration
        detected_duration = sum(
            s.end_seconds - s.start_seconds for s in segments
        )

        write_progress(100, "Complete")

        # Build result
        result = AudioDetectionResult(
            segments=segments,
            total_duration_seconds=total_duration,
            detected_duration_seconds=detected_duration,
            model_version=self.MODEL_VERSION
        )

        return result.to_dict()

    def _handle_video_input(self, input_file: str) -> str:
        """
        Check if input is a video file and extract audio if needed.

        Args:
            input_file: Path to input file (audio or video)

        Returns:
            Path to audio file (either original or extracted temp file)
        """
        # Video file extensions
        video_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v'}
        file_ext = Path(input_file).suffix.lower()

        # If it's not a video file, return as-is
        if file_ext not in video_extensions:
            return input_file

        write_progress(5, "Extracting audio from video...")
        write_log(f"Detected video file: {file_ext}", "info")

        # Extract audio using librosa (which uses audioread/soundfile under the hood)
        # librosa.load can handle many video formats directly
        # If it fails, we could add ffmpeg extraction as a fallback
        try:
            # librosa can extract audio from many video containers
            # We'll just return the original file and let librosa handle it
            write_log("Using librosa to extract audio from video", "info")
            return input_file
        except Exception as e:
            # If librosa can't handle it, try using pydub with ffmpeg
            write_log(f"Librosa extraction failed, trying pydub: {e}", "warning")
            return self._extract_audio_with_pydub(input_file)

    def _extract_audio_with_pydub(self, video_file: str) -> str:
        """
        Extract audio from video using pydub (requires ffmpeg).

        Args:
            video_file: Path to video file

        Returns:
            Path to temporary extracted audio file
        """
        try:
            from pydub import AudioSegment
            import tempfile

            extracted_audio_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            extracted_audio_path = extracted_audio_file.name
            extracted_audio_file.close()

            write_log(f"Extracting audio to temporary file: {extracted_audio_path}", "info")

            # Load video and extract audio
            audio = AudioSegment.from_file(video_file)
            audio.export(extracted_audio_path, format='wav')

            write_log("Audio extraction complete", "info")
            return extracted_audio_path

        except ImportError:
            raise RuntimeError(
                "pydub is required for video processing but not installed. "
                "Install with: pip install pydub"
            )
        except Exception as e:
            raise RuntimeError(f"Failed to extract audio from video: {e}")

    def _run_inference(
        self,
        audio: np.ndarray,
        model: 'ort.InferenceSession',
        config: ModelConfig
    ) -> List[Tuple[float, float]]:
       
        import librosa

        sr = SAMPLE_RATE
        window_samples = int(config.window_size_ms * sr / 1000)
        hop_samples = int(config.hop_size_ms * sr / 1000)

        # Feature extraction parameters
        n_mels = 128
        n_fft = 2048
        hop_length = 512

        # Check if using GPU for batch processing
        using_gpu = 'CUDAExecutionProvider' in model.get_providers()
        batch_size = 32 if using_gpu else 8

        write_log(f"Batch size: {batch_size} ({'GPU' if using_gpu else 'CPU'})", "info")

        write_log("Computing full mel spectrogram (batched optimization)...", "info")
        full_mel_spec = librosa.feature.melspectrogram(
            y=audio, sr=sr, n_mels=n_mels,
            n_fft=n_fft, hop_length=hop_length
        )
        full_mel_spec_db = librosa.power_to_db(full_mel_spec, ref=np.max)

        # Calculate frame indices for each window
        # Each audio sample window corresponds to a range of spectrogram frames
        frames_per_window = int(window_samples / hop_length)
        frames_per_hop = int(hop_samples / hop_length)

        predictions = []
        total_windows = max(1, (full_mel_spec_db.shape[1] - frames_per_window) // frames_per_hop + 1)

        # Prepare window frame indices
        window_frame_starts = list(range(0, full_mel_spec_db.shape[1] - frames_per_window + 1, frames_per_hop))

        for batch_idx in range(0, len(window_frame_starts), batch_size):
            batch_frame_starts = window_frame_starts[batch_idx:batch_idx + batch_size]
            batch_features = []

            # Slice windows from pre-computed spectrogram (fast!)
            for frame_start in batch_frame_starts:
                # Slice the spectrogram window
                mel_window = full_mel_spec_db[:, frame_start:frame_start + frames_per_window]

                # Pad if needed (edge case at end)
                if mel_window.shape[1] < frames_per_window:
                    mel_window = np.pad(mel_window, ((0, 0), (0, frames_per_window - mel_window.shape[1])))

                mel_window = (mel_window - mel_window.mean()) / (mel_window.std() + 1e-8)
                batch_features.append(mel_window)

            batch_input = np.array(batch_features)[:, np.newaxis, :, :].astype(np.float32)

            # Run batch inference
            outputs = model.run(None, {'mel_spectrogram': batch_input})
            batch_probs = outputs[0][:, 0]  

            for i, (frame_start, prob) in enumerate(zip(batch_frame_starts, batch_probs)):
                window_start_sec = (frame_start * hop_length) / sr
                predictions.append((window_start_sec, float(prob)))

            # Emit progress
            progress = batch_idx + len(batch_frame_starts)
            update_frequency = batch_size
            if progress % update_frequency == 0 or progress >= total_windows:
                percent = int((progress / total_windows) * 55) + 20  # 20-75% for inference
                write_progress(percent, f"Running inference... ({progress}/{total_windows} windows)")

        return predictions

    def _postprocess_predictions(
        self,
        predictions: List[Tuple[float, float]],
        config: ModelConfig
    ) -> List[TimestampSegment]:
        threshold = config.confidence_threshold
        min_duration = config.min_segment_duration_ms / 1000
        merge_gap = config.merge_gap_ms / 1000
        window_duration = config.window_size_ms / 1000

        # Step 1: Filter by threshold
        positive_windows = [(t, p) for t, p in predictions if p >= threshold]

        if not positive_windows:
            return []

        segments = []
        current_segment = {
            'start': positive_windows[0][0],
            'end': positive_windows[0][0] + window_duration,
            'confidences': [positive_windows[0][1]]
        }

        for start_time, prob in positive_windows[1:]:
            if start_time <= current_segment['end'] + merge_gap:
                current_segment['end'] = start_time + window_duration
                current_segment['confidences'].append(prob)
            else:
                segments.append(current_segment)
                current_segment = {
                    'start': start_time,
                    'end': start_time + window_duration,
                    'confidences': [prob]
                }

        segments.append(current_segment)

        result = []
        for seg in segments:
            duration = seg['end'] - seg['start']
            if duration >= min_duration:
                result.append(TimestampSegment(
                    start_seconds=seg['start'],
                    end_seconds=seg['end'],
                    confidence=float(np.mean(seg['confidences'])),
                    label='target_audio'
                ))

        return result


def main():
    """Main entry point."""
    worker = AudioEventDetector()
    sys.exit(worker.run())


if __name__ == '__main__':
    main()
