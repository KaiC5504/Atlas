#!/usr/bin/env python3
"""
Audio separation worker using Demucs.
Receives job parameters from Rust via stdin, separates audio stems,
and reports progress/result back via stdout.
"""
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

# Add common module to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import WorkerBase, run_worker, write_progress, write_log

# Lazy import flag 
HAS_DEMUCS = None 
_torch = None
_torchaudio = None
_librosa = None
_np = None
_demucs_get_model = None
_demucs_apply_model = None


def _lazy_import_demucs():
    """Lazy import heavy ML modules only when needed."""
    global HAS_DEMUCS, _torch, _torchaudio, _librosa, _np, _demucs_get_model, _demucs_apply_model

    if HAS_DEMUCS is not None:
        return HAS_DEMUCS

    try:
        import torch
        import torchaudio
        import librosa
        import numpy as np
        from demucs.pretrained import get_model
        from demucs.apply import apply_model

        _torch = torch
        _torchaudio = torchaudio
        _librosa = librosa
        _np = np
        _demucs_get_model = get_model
        _demucs_apply_model = apply_model
        HAS_DEMUCS = True
    except ImportError:
        HAS_DEMUCS = False

    return HAS_DEMUCS


class AudioSeparatorWorker(WorkerBase):
    """
    Worker for separating audio stems using Demucs.

    Expected input:
    {
        "input_file": "/path/to/audio.mp3",
        "model": "htdemucs_ft" | "htdemucs" | "htdemucs_6s",
        "output_dir": "/path/to/output",
        "job_id": "uuid"
    }

    Output:
    {
        "output_files": [
            {"stem": "vocals", "path": "/path/to/output/vocals.wav"},
            {"stem": "drums", "path": "/path/to/output/drums.wav"},
            {"stem": "bass", "path": "/path/to/output/bass.wav"},
            {"stem": "other", "path": "/path/to/output/other.wav"}
        ]
    }
    """

    def __init__(self):
        super().__init__()
        self.model = None
        self.device = None

    def validate_input(self, input_data: Dict[str, Any]) -> None:
        # Lazy import on first validation
        if not _lazy_import_demucs():
            raise ValueError("Demucs is not installed. Run: pip install demucs")

        if "input_file" not in input_data:
            raise ValueError("Missing required field: input_file")
        if "model" not in input_data:
            raise ValueError("Missing required field: model")
        if "output_dir" not in input_data:
            raise ValueError("Missing required field: output_dir")

        input_file = Path(input_data["input_file"])
        if not input_file.exists():
            raise ValueError(f"Input file not found: {input_file}")

    def _get_device(self):
        """Determine the best device to use (GPU if available)."""
        if _torch.cuda.is_available():
            write_log("Using CUDA GPU for inference")
            return _torch.device("cuda")
        elif hasattr(_torch.backends, "mps") and _torch.backends.mps.is_available():
            write_log("Using Apple MPS GPU for inference")
            return _torch.device("mps")
        else:
            write_log("Using CPU for inference")
            return _torch.device("cpu")

    def _load_model(self, model_name: str) -> None:
        """Load the Demucs model."""
        write_progress(5, f"Loading model: {model_name}")
        self.device = self._get_device()

        # Load pre-trained model
        self.model = _demucs_get_model(model_name)
        self.model.to(self.device)
        self.model.eval()

        write_log(f"Model loaded: {model_name}")

    def _load_audio(self, input_file: Path) -> tuple:
        """Load audio file and prepare for processing."""
        write_progress(10, "Loading audio file...")

        wav_np, sr = _librosa.load(str(input_file), sr=None, mono=False, dtype=_np.float32)

        if wav_np.ndim == 1:
            wav_np = wav_np.reshape(1, -1)

        # Convert to torch tensor
        wav = _torch.from_numpy(wav_np)

        # Resample if needed (Demucs expects 44100 Hz)
        if sr != self.model.samplerate:
            write_log(f"Resampling from {sr} Hz to {self.model.samplerate} Hz")
            resampler = _torchaudio.transforms.Resample(sr, self.model.samplerate)
            wav = resampler(wav)
            sr = self.model.samplerate

        # Convert to stereo if mono
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)

        return wav, sr

    def _separate_audio(self, wav):
        """Run the separation model."""
        write_progress(20, "Separating audio stems...")

        # Add batch dimension
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / ref.std()
        wav = wav.unsqueeze(0).to(self.device)

        # Apply model
        with _torch.no_grad():
            sources = _demucs_apply_model(
                self.model,
                wav,
                device=self.device,
                progress=True,
                num_workers=0
            )

        # Remove batch dimension and denormalize
        sources = sources.squeeze(0) * ref.std() + ref.mean()

        return sources

    def _save_stems(
        self,
        sources,
        output_dir: Path,
        input_file: Path,
        sr: int
    ) -> List[Dict[str, str]]:
        """Save separated stems to output directory."""
        write_progress(80, "Saving separated stems...")

        output_dir.mkdir(parents=True, exist_ok=True)
        stem_names = self.model.sources
        output_files = []

        input_stem = input_file.stem

        for idx, stem_name in enumerate(stem_names):
            progress = 80 + int((idx / len(stem_names)) * 15)
            write_progress(progress, f"Saving {stem_name}...")

            output_path = output_dir / f"{input_stem}_{stem_name}.wav"

            # Get the stem audio
            stem_audio = sources[idx]

            # Save as WAV
            _torchaudio.save(
                str(output_path),
                stem_audio.cpu(),
                sr,
                encoding="PCM_S",
                bits_per_sample=16
            )

            output_files.append({
                "stem": stem_name,
                "path": str(output_path)
            })

            write_log(f"Saved: {output_path}")

        return output_files

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        input_file = Path(input_data["input_file"])
        model_name = input_data["model"]
        output_dir = Path(input_data["output_dir"])

        write_log(f"Starting audio separation: {input_file}")
        write_progress(0, "Initializing...")

        # Load model
        self._load_model(model_name)

        # Load audio
        wav, sr = self._load_audio(input_file)

        # Separate stems
        sources = self._separate_audio(wav)

        # Save stems
        output_files = self._save_stems(sources, output_dir, input_file, sr)

        write_progress(100, "Separation complete!")

        return {
            "output_files": output_files
        }


if __name__ == "__main__":
    run_worker(AudioSeparatorWorker)
