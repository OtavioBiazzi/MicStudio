import json
import shutil
import subprocess
import unittest
from dataclasses import fields
from pathlib import Path

import numpy as np

from micfudiddo.processing import EffectsSettings, VoiceEffectsProcessor, DualDelayPitchShifter, apply_gain, hard_clip_for_output


class VoiceCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parents[1]
        if not shutil.which("node"):
            raise unittest.SkipTest("Node is required to audit the shipped preset catalog")
        output = subprocess.check_output([
            "node", "--input-type=module", "-e",
            "import {voicePresets} from './src/voicePresets.js'; console.log(JSON.stringify(voicePresets));"
        ], cwd=root, text=True, encoding="utf-8")
        cls.presets = json.loads(output)

    def test_catalog_has_unique_ids_supported_fields_and_fourteen_new_voices(self):
        ids = [voice["id"] for voice in self.presets]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(sum(bool(voice.get("isNew")) for voice in self.presets), 14)
        supported = {field.name for field in fields(EffectsSettings)}
        for voice in self.presets:
            with self.subTest(voice=voice["id"]):
                self.assertFalse(set(voice["effects"]) - supported)
                settings = EffectsSettings(**voice["effects"])
                for control in voice.get("controls", []):
                    if control["target"] == "effect":
                        self.assertIn(control["key"], supported)
                        self.assertIn(control["enableKey"], supported)
                self.assertIsNotNone(settings)

    def test_saved_effects_ignore_unknown_and_invalid_fields(self):
        settings = EffectsSettings.from_mapping({"future_field": 42, "echo_enabled": "false", "delay_mix": float("nan"), "time_glitch_repeats": 3.5, "robot_enabled": True})
        self.assertFalse(settings.echo_enabled)
        self.assertEqual(settings.delay_mix, 0.3)
        self.assertEqual(settings.time_glitch_repeats, 3)
        self.assertTrue(settings.robot_enabled)

    def test_every_voice_produces_finite_audible_bounded_streaming_audio(self):
        rate = 16000
        t = np.arange(rate, dtype=np.float32) / rate
        reference = (0.14 * np.sin(2 * np.pi * 180 * t) + 0.07 * np.sin(2 * np.pi * 430 * t)) * (0.7 + 0.3 * np.sin(2 * np.pi * 3 * t))
        for voice in self.presets:
            with self.subTest(voice=voice["id"]):
                processor = VoiceEffectsProcessor(rate)
                processor.noise_rng = np.random.default_rng(7)
                shifter = DualDelayPitchShifter(rate)
                shifter.set_pitch_semitones(voice["pitch"])
                settings = EffectsSettings(**voice["effects"])
                parts = []
                for start in range(0, rate, 256):
                    if start >= rate // 2 and settings.time_glitch_trigger_mode == "shortcut":
                        if not parts or processor.time_glitch_event_total == 0:
                            processor.trigger_time_glitch()
                    block = reference[start:start + 256]
                    parts.append(hard_clip_for_output(processor.process(apply_gain(shifter.process(block), voice["gain"]), settings)))
                output = np.concatenate(parts)
                self.assertEqual(output.shape, reference.shape)
                self.assertTrue(np.isfinite(output).all())
                self.assertGreater(float(np.max(np.abs(output))), 0.005)
                self.assertLessEqual(float(np.max(np.abs(output))), 0.981)
                if voice["id"] not in ("clean", "personalizado"):
                    self.assertGreater(float(np.mean(np.abs(output - reference))), 0.001)

    def test_command_repeat_counts_are_exact_and_speed_changes_duration(self):
        processor = VoiceEffectsProcessor(8000)
        processor.time_glitch_history[:] = np.sin(np.arange(processor.time_glitch_history.size) * 0.1)
        processor.time_glitch_history_filled = processor.time_glitch_history.size
        for repeats in (1, 2, 100, 10000):
            for speed in (0.5, 1, 2):
                processor._start_time_glitch_event(1, 0.1, 100, 0.02, repeats, 1, 1, speed, exact=True, direction="forward")
                self.assertEqual(processor.time_glitch_grain.size, round(800 / speed))
                self.assertEqual(processor.time_glitch_event_total, processor.time_glitch_grain.size * repeats)

    def test_command_directions_do_not_depend_on_random_chance(self):
        grains = {}
        for direction in ("forward", "reverse", "pingpong"):
            processor = VoiceEffectsProcessor(8000)
            processor.time_glitch_history[:] = np.sin(np.arange(processor.time_glitch_history.size) * 0.1)
            processor.time_glitch_history_filled = processor.time_glitch_history.size
            processor._start_time_glitch_event(1, 0.1, 100, 0.02, 2, 0, 0, exact=True, direction=direction)
            grains[direction] = processor.time_glitch_grain
        np.testing.assert_allclose(grains["reverse"], grains["forward"][::-1], atol=1e-6)
        self.assertEqual(grains["pingpong"].size, grains["forward"].size * 2)

    def test_switch_to_shortcut_mode_does_not_continue_automatic_repeat(self):
        from dataclasses import replace
        processor = VoiceEffectsProcessor(8000)
        settings = EffectsSettings(time_glitch_enabled=True, time_glitch_mix=1, time_glitch_repeats=10000)
        signal = np.sin(np.arange(8000) * 0.1).astype(np.float32) * 0.2
        processor.process(signal, settings)
        self.assertGreater(processor.time_glitch_event_remaining, 0)
        result = processor.process(signal, replace(settings, time_glitch_trigger_mode="shortcut"))
        np.testing.assert_array_equal(result, signal)

    def test_disabled_temporal_effects_forget_old_audio(self):
        for effect in ("time_glitch", "reverse", "double_voice", "echo", "delay", "reverb", "ghost", "chorus", "flanger", "harmony"):
            with self.subTest(effect=effect):
                processor = VoiceEffectsProcessor(8000)
                settings = EffectsSettings(**{f"{effect}_enabled": True})
                processor.process(np.full(8000, 0.2, dtype=np.float32), settings)
                processor.process(np.zeros(256, dtype=np.float32), EffectsSettings())
                output = processor.process(np.zeros(4000, dtype=np.float32), settings)
                self.assertLess(float(np.max(np.abs(output))), 1e-6)

    def test_wobble_is_continuous_and_independent_from_tremolo(self):
        whole = VoiceEffectsProcessor(8000)
        streamed = VoiceEffectsProcessor(8000)
        settings = EffectsSettings(wobble_enabled=True, wobble_mix=1, wobble_rate_hz=3)
        samples = np.ones(4000, dtype=np.float32) * 0.2
        output = whole.process(samples, settings)
        blocks = np.concatenate([streamed.process(block, settings) for block in np.array_split(samples, 20)])
        np.testing.assert_allclose(output, blocks, atol=1e-6)
        self.assertGreater(float(np.ptp(output)), 0.1)
        self.assertEqual(whole.tremolo_phase, 0)

    def test_delay_time_and_feedback_match_impulse_positions(self):
        processor = VoiceEffectsProcessor(8000)
        impulse = np.zeros(4000, dtype=np.float32)
        impulse[0] = 0.2
        output = processor.process(impulse, EffectsSettings(delay_enabled=True, delay_mix=1, delay_time_ms=100, delay_feedback=0.5))
        self.assertAlmostEqual(float(output[800]), 0.2, places=6)
        self.assertAlmostEqual(float(output[1600]), 0.1, places=6)

    def test_vector_pitch_matches_sample_by_sample_reference(self):
        import math
        for pitch in (-24, -5, 7, 24):
            fast = DualDelayPitchShifter(48000)
            reference = DualDelayPitchShifter(48000)
            fast.set_pitch_semitones(pitch)
            reference.set_pitch_semitones(pitch)
            samples = np.random.default_rng(13).normal(0, 0.1, 16000).astype(np.float32)
            expected = np.empty_like(samples)
            phase_step = abs(reference.pitch_ratio - 1) / reference.delay_range
            for index, sample in enumerate(samples):
                reference.buffer[reference.write_pos] = sample
                phases = (reference.phase, (reference.phase + 0.5) % 1)
                value = 0
                for phase in phases:
                    delay = reference.max_delay_samples - phase * reference.delay_range if reference.pitch_ratio > 1 else reference.min_delay_samples + phase * reference.delay_range
                    value += reference._read_delay(delay) * math.sin(math.pi * phase) ** 2
                expected[index] = value
                reference.write_pos = (reference.write_pos + 1) % reference.buffer_len
                reference.phase = (reference.phase + phase_step) % 1
            actual = np.concatenate([fast.process(block) for block in np.array_split(samples, 32)])
            np.testing.assert_allclose(actual, expected, atol=2e-6)


if __name__ == "__main__":
    unittest.main()
