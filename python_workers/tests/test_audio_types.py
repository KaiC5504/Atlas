import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.audio_types import TrainingManifest, TrainingSample


def test_training_manifest_has_hard_negative_samples():
    """Verify field renamed from hard_negatives to hard_negative_samples."""
    manifest = TrainingManifest()
    assert hasattr(manifest, 'hard_negative_samples')
    assert not hasattr(manifest, 'hard_negatives')


def test_training_manifest_serialization():
    """Verify JSON serialization uses hard_negative_samples key."""
    sample = TrainingSample(
        file='test.wav',
        label='target_audio',
        source='test'
    )
    manifest = TrainingManifest(
        positive_samples=[sample],
        negative_samples=[],
        hard_negative_samples=[sample]
    )
    data = manifest.to_dict()
    assert 'hard_negative_samples' in data
    assert 'hard_negatives' not in data
