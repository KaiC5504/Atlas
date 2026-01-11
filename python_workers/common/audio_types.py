"""
Audio Event Detection type definitions for Python workers.
These types match the TypeScript and Rust type definitions.
"""
from dataclasses import dataclass, field
from typing import List, Optional, Literal, Dict, Any
from enum import Enum


class AudioDetectionStatus(str, Enum):
    """Job status enum"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TimestampSegment:
    """A detected timestamp segment with confidence score"""
    start_seconds: float
    end_seconds: float
    confidence: float  # 0.0 - 1.0
    label: str = "target_audio"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "start_seconds": round(self.start_seconds, 2),
            "end_seconds": round(self.end_seconds, 2),
            "confidence": round(self.confidence, 3),
            "label": self.label
        }


@dataclass
class AudioDetectionResult:
    """Result of audio event detection inference"""
    segments: List[TimestampSegment]
    total_duration_seconds: float
    detected_duration_seconds: float
    model_version: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "segments": [s.to_dict() for s in self.segments],
            "total_duration_seconds": round(self.total_duration_seconds, 2),
            "detected_duration_seconds": round(self.detected_duration_seconds, 2),
            "model_version": self.model_version
        }


@dataclass
class ModelConfig:
    """Model configuration for inference"""
    model_path: Optional[str] = None
    window_size_ms: int = 1000  # 1 second windows
    hop_size_ms: int = 250      # 75% overlap
    confidence_threshold: float = 0.7
    min_segment_duration_ms: int = 500  # Ignore short detections
    merge_gap_ms: int = 300     # Merge segments closer than this

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ModelConfig':
        return cls(
            model_path=data.get('model_path'),
            window_size_ms=data.get('window_size_ms', 1000),
            hop_size_ms=data.get('hop_size_ms', 250),
            confidence_threshold=data.get('confidence_threshold', 0.7),
            min_segment_duration_ms=data.get('min_segment_duration_ms', 500),
            merge_gap_ms=data.get('merge_gap_ms', 300)
        )


@dataclass
class TrainingSample:
    """A training sample entry"""
    file: str
    label: Literal["target_audio", "other"]
    source: str  # Creator identifier

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file": self.file,
            "label": self.label,
            "source": self.source
        }


@dataclass
class TrainingManifest:
    """Training data manifest"""
    positive_samples: List[TrainingSample] = field(default_factory=list)
    negative_samples: List[TrainingSample] = field(default_factory=list)
    hard_negatives: List[TrainingSample] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TrainingManifest':
        return cls(
            positive_samples=[
                TrainingSample(**s) for s in data.get('positive_samples', [])
            ],
            negative_samples=[
                TrainingSample(**s) for s in data.get('negative_samples', [])
            ],
            hard_negatives=[
                TrainingSample(**s) for s in data.get('hard_negatives', [])
            ]
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "positive_samples": [s.to_dict() for s in self.positive_samples],
            "negative_samples": [s.to_dict() for s in self.negative_samples],
            "hard_negatives": [s.to_dict() for s in self.hard_negatives]
        }


@dataclass
class TrainingConfig:
    """Training configuration"""
    batch_size: int = 32
    learning_rate: float = 0.001
    weight_decay: float = 0.01
    epochs: int = 100
    early_stopping_patience: int = 10

    # Data augmentation
    time_mask_max_width: int = 5
    freq_mask_max_width: int = 10
    gain_range: tuple = (-3, 3)  # dB
    mixup_alpha: float = 0.2

    # Class weights
    positive_weight: float = 1.0
    negative_weight: float = 1.0

    # Output
    output_dir: str = "./trained_models"
    export_onnx: bool = True

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TrainingConfig':
        aug = data.get('augmentation', {})
        weights = data.get('class_weights', {})
        return cls(
            batch_size=data.get('batch_size', 32),
            learning_rate=data.get('learning_rate', 0.001),
            weight_decay=data.get('weight_decay', 0.01),
            epochs=data.get('epochs', 100),
            early_stopping_patience=data.get('early_stopping_patience', 10),
            time_mask_max_width=aug.get('time_mask_max_width', 5),
            freq_mask_max_width=aug.get('freq_mask_max_width', 10),
            gain_range=tuple(aug.get('gain_range', [-3, 3])),
            mixup_alpha=aug.get('mixup_alpha', 0.2),
            positive_weight=weights.get('positive', 1.0),
            negative_weight=weights.get('negative', 1.0),
            output_dir=data.get('output_dir', './trained_models'),
            export_onnx=data.get('export_onnx', True)
        )


# Feature extraction constants
SAMPLE_RATE = 16000  # 16kHz for audio classification
N_MELS = 128         # Number of mel frequency bins
N_FFT = 2048         # FFT window size (~128ms at 16kHz)
HOP_LENGTH = 512     # FFT hop length (~32ms)
