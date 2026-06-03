import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import soundfile as sf

from micfudiddo.soundboard import (
    SoundDefaults,
    SoundLibrary,
    load_audio_mono,
    render_audio_file_edit,
    render_sound_for_playback,
    resample_by_ratio,
)
from micfudiddo.processing import EffectsSettings


class SoundboardTests(unittest.TestCase):
    def test_pitch_render_preserves_length_by_default(self):
        samples = np.linspace(-0.5, 0.5, 4800, dtype=np.float32)
        pitched = render_sound_for_playback(samples, volume=1.0, pitch_semitones=12.0, repeats=1)
        self.assertEqual(pitched.size, samples.size)
        self.assertTrue(np.all(np.isfinite(pitched)))

    def test_classic_pitch_mode_changes_length(self):
        samples = np.linspace(-0.5, 0.5, 4800, dtype=np.float32)
        pitched = render_sound_for_playback(
            samples,
            volume=1.0,
            pitch_semitones=12.0,
            repeats=1,
            pitch_mode="resample",
        )
        self.assertLess(pitched.size, samples.size)
        self.assertTrue(np.all(np.isfinite(pitched)))

    def test_speed_changes_length_without_touching_pitch_control(self):
        samples = np.linspace(-0.5, 0.5, 4800, dtype=np.float32)
        faster = render_sound_for_playback(samples, volume=1.0, pitch_semitones=0.0, repeats=1, speed=2.0)
        slower = render_sound_for_playback(samples, volume=1.0, pitch_semitones=0.0, repeats=1, speed=0.5)
        self.assertLess(faster.size, samples.size)
        self.assertGreater(slower.size, samples.size)

    def test_repeats_add_more_audio(self):
        samples = np.ones(100, dtype=np.float32) * 0.1
        repeated = render_sound_for_playback(samples, volume=1.0, pitch_semitones=0.0, repeats=3)
        self.assertGreater(repeated.size, samples.size * 3)

    def test_resample_by_ratio_keeps_finite_audio(self):
        samples = np.sin(np.linspace(0, 4, 1000, dtype=np.float32))
        out = resample_by_ratio(samples, 0.5)
        self.assertGreater(out.size, samples.size)
        self.assertTrue(np.all(np.isfinite(out)))

    def test_load_audio_mono_resamples_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "test.wav"
            sf.write(path, np.ones((1000, 2), dtype=np.float32) * 0.25, 24000)
            loaded = load_audio_mono(str(path), 48000)
            self.assertGreater(loaded.size, 1000)
            self.assertAlmostEqual(float(np.max(loaded)), 0.25, places=2)

    def test_library_applies_defaults_to_new_sounds(self):
        with tempfile.TemporaryDirectory() as home, tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(home)):
                library = SoundLibrary()
                library.defaults = SoundDefaults(volume=2.5, pitch_semitones=-4.0, repeats=3, category="Memes", color="#49e2d1")
                library.save_settings()
                source = Path(tmp) / "source.wav"
                sf.write(source, np.ones(100, dtype=np.float32) * 0.1, 48000)
                item = library.add_file(str(source))
        self.assertEqual(item.volume, 2.5)
        self.assertEqual(item.pitch_semitones, -4.0)
        self.assertEqual(item.repeats, 3)
        self.assertEqual(item.category, "Memes")
        self.assertEqual(item.color, "#49e2d1")

    def test_library_records_stats_and_categories(self):
        with tempfile.TemporaryDirectory() as home, tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(home)):
                library = SoundLibrary()
                source = Path(tmp) / "source.wav"
                sf.write(source, np.ones(100, dtype=np.float32) * 0.1, 48000)
                item = library.add_file(str(source))
                item.category = "Alertas"
                library.update(item)
                library.record_play(item.id)
                updated = library.by_id(item.id)
                self.assertIn("Alertas", library.categories())
                self.assertEqual(updated.play_count, 1)
                self.assertGreater(updated.last_played_at, 0)

    def test_save_edited_copy_bakes_pitch_volume_and_trim(self):
        with tempfile.TemporaryDirectory() as home, tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(home)):
                library = SoundLibrary()
                source = Path(tmp) / "source.wav"
                sf.write(source, np.ones(4800, dtype=np.float32) * 0.1, 48000)
                item = library.add_file(str(source))
                copied = library.save_edited(
                    item.id,
                    replace=False,
                    name="Teste",
                    category="Copias",
                    color="#25a7f2",
                    volume=2.0,
                    pitch_semitones=12.0,
                    repeats=1,
                    start_seconds=0.0,
                    end_seconds=0.05,
                )
                data = load_audio_mono(copied.path, 48000)
        self.assertNotEqual(copied.id, item.id)
        self.assertEqual(copied.category, "Copias")
        self.assertLess(data.size, 4800)
        self.assertGreater(float(np.max(np.abs(data))), 0.15)

    def test_render_audio_file_edit_rejects_empty_trim(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.wav"
            sf.write(source, np.ones(100, dtype=np.float32) * 0.1, 48000)
            with self.assertRaises(RuntimeError):
                render_audio_file_edit(str(source), start_seconds=1.0, end_seconds=1.0)

    def test_render_audio_file_edit_applies_effects(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.wav"
            audio = np.linspace(-0.5, 0.5, 4800, dtype=np.float32)
            sf.write(source, audio, 48000)
            clean, _ = render_audio_file_edit(str(source), volume=1.0, pitch_semitones=0.0, repeats=1)
            effected, _ = render_audio_file_edit(
                str(source),
                volume=1.0,
                pitch_semitones=0.0,
                repeats=1,
                effects=EffectsSettings(distortion_enabled=True, distortion_drive=10.0),
            )
        self.assertEqual(clean.shape, effected.shape)
        self.assertTrue(np.all(np.isfinite(effected)))
        self.assertFalse(np.allclose(clean, effected))


if __name__ == "__main__":
    unittest.main()
