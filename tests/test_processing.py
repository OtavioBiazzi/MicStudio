import math
import unittest

import numpy as np

from micfudiddo.processing import (
    DualDelayPitchShifter,
    EffectsSettings,
    VoiceEffectsProcessor,
    apply_gain,
    hard_clip_for_output,
    semitones_to_ratio,
)


class ProcessingTests(unittest.TestCase):
    def test_gain_allows_large_values_without_clipping(self):
        samples = np.array([0.25, -0.5, 1.0], dtype=np.float32)
        out = apply_gain(samples, 25.0)
        self.assertTrue(np.all(np.isfinite(out)))
        self.assertAlmostEqual(float(out[0]), 6.25, places=4)
        self.assertAlmostEqual(float(out[1]), -12.5, places=4)

    def test_output_clip_flattens_boosted_audio(self):
        samples = np.array([6.25, -12.5, 0.2], dtype=np.float32)
        out = hard_clip_for_output(samples)
        self.assertAlmostEqual(float(out[0]), 0.98, places=4)
        self.assertAlmostEqual(float(out[1]), -0.98, places=4)
        self.assertAlmostEqual(float(out[2]), 0.2, places=4)

    def test_optional_effects_are_bypassed_by_default(self):
        samples = np.linspace(-0.5, 0.5, 64, dtype=np.float32)
        processor = VoiceEffectsProcessor(48000)
        out = processor.process(samples, EffectsSettings())
        self.assertTrue(np.allclose(out, samples))

    def test_output_volume_effect_boosts_when_enabled(self):
        samples = np.array([0.1, -0.2], dtype=np.float32)
        processor = VoiceEffectsProcessor(48000)
        out = processor.process(samples, EffectsSettings(output_volume_enabled=True, output_volume=3.0))
        self.assertTrue(np.allclose(out, np.array([0.3, -0.6], dtype=np.float32)))

    def test_bitcrush_effect_changes_waveform(self):
        samples = np.linspace(-0.75, 0.75, 32, dtype=np.float32)
        processor = VoiceEffectsProcessor(48000)
        out = processor.process(samples, EffectsSettings(bitcrush_enabled=True, bitcrush_bits=4))
        self.assertEqual(out.shape, samples.shape)
        self.assertTrue(np.all(np.isfinite(out)))
        self.assertFalse(np.allclose(out, samples))

    def test_reverse_and_alien_glitch_effects_change_waveform(self):
        samples = np.sin(np.linspace(0.0, 8.0 * np.pi, 256, dtype=np.float32)) * 0.35
        processor = VoiceEffectsProcessor(48000)
        out = processor.process(
            samples,
            EffectsSettings(
                reverse_enabled=True,
                reverse_mix=0.85,
                alien_glitch_enabled=True,
                alien_glitch_mix=0.72,
            ),
        )
        self.assertEqual(out.shape, samples.shape)
        self.assertTrue(np.all(np.isfinite(out)))
        self.assertFalse(np.allclose(out, samples))

    def test_glitch_effect_outputs_finite_changed_waveform(self):
        samples = np.sin(np.linspace(0.0, 12.0 * np.pi, 512, dtype=np.float32)) * 0.3
        processor = VoiceEffectsProcessor(48000)
        out = processor.process(
            samples,
            EffectsSettings(glitch_enabled=True, glitch_mix=0.8, glitch_rate_hz=28.0),
        )
        self.assertEqual(out.shape, samples.shape)
        self.assertTrue(np.all(np.isfinite(out)))
        self.assertFalse(np.allclose(out, samples))

    def test_time_glitch_replays_recent_audio_across_blocks(self):
        sample_rate = 48000
        processor = VoiceEffectsProcessor(sample_rate)
        settings = EffectsSettings(
            time_glitch_enabled=True,
            time_glitch_mix=1.0,
            time_glitch_rate_hz=16.0,
            time_glitch_depth=1.0,
        )
        t = np.arange(sample_rate, dtype=np.float32) / sample_rate
        samples = (0.3 * np.sin(2.0 * np.pi * (180.0 + 240.0 * t) * t)).astype(np.float32)
        blocks = [processor.process(block, settings) for block in np.array_split(samples, 48)]
        out = np.concatenate(blocks)
        self.assertEqual(out.shape, samples.shape)
        self.assertTrue(np.all(np.isfinite(out)))
        self.assertFalse(np.allclose(out, samples))

        processor.reset()
        self.assertEqual(processor.time_glitch_history_filled, 0)
        self.assertEqual(processor.time_glitch_event_remaining, 0)

    def test_time_glitch_accepts_voice_specific_timing(self):
        sample_rate = 48000
        processor = VoiceEffectsProcessor(sample_rate)
        settings = EffectsSettings(
            time_glitch_enabled=True,
            time_glitch_mix=0.9,
            time_glitch_depth=0.8,
            time_glitch_interval_s=0.05,
            time_glitch_fragment_ms=35,
            time_glitch_lookback_s=0.2,
            time_glitch_repeats=7,
            time_glitch_reverse_chance=1.0,
            time_glitch_pingpong_chance=0.0,
        )
        samples = np.sin(np.linspace(0.0, 70.0 * np.pi, sample_rate // 2, dtype=np.float32)) * 0.25
        out = np.concatenate([
            processor.process(block, settings)
            for block in np.array_split(samples, 24)
        ])
        self.assertTrue(np.all(np.isfinite(out)))
        self.assertFalse(np.allclose(out, samples))

    def test_double_voice_keeps_streaming_state_and_changes_audio(self):
        sample_rate = 48000
        processor = VoiceEffectsProcessor(sample_rate)
        settings = EffectsSettings(
            double_voice_enabled=True,
            double_voice_mix=0.7,
            double_voice_delay_ms=45,
            double_voice_pitch_semitones=-7,
        )
        samples = np.sin(np.linspace(0.0, 50.0 * np.pi, sample_rate // 4, dtype=np.float32)) * 0.2
        out = np.concatenate([
            processor.process(block, settings)
            for block in np.array_split(samples, 12)
        ])
        self.assertEqual(out.shape, samples.shape)
        self.assertTrue(np.all(np.isfinite(out)))
        self.assertFalse(np.allclose(out, samples))

        processor.reset()
        self.assertEqual(processor.double_voice_pos, 0)
        self.assertFalse(np.any(processor.double_voice_buffer))

    def test_radio_static_adds_finite_crackle_texture(self):
        samples = np.zeros(4096, dtype=np.float32)
        processor = VoiceEffectsProcessor(48000)
        out = processor.process(
            samples,
            EffectsSettings(
                radio_static_enabled=True,
                radio_static_mix=0.8,
                radio_crackle_rate_hz=40,
            ),
        )
        self.assertTrue(np.all(np.isfinite(out)))
        self.assertGreater(float(np.max(np.abs(out))), 0.0001)

    def test_procedural_ambience_modes_are_finite_and_distinct(self):
        processor = VoiceEffectsProcessor(48000)
        silence = np.zeros(4096, dtype=np.float32)
        modes = []
        for mode in ("space", "infernal", "haunted", "digital"):
            processor.reset()
            modes.append(processor.process(
                silence,
                EffectsSettings(
                    ambience_enabled=True,
                    ambience_mode=mode,
                    ambience_volume=0.5,
                ),
            ))
        self.assertTrue(all(np.all(np.isfinite(out)) for out in modes))
        self.assertTrue(all(float(np.max(np.abs(out))) > 0.0001 for out in modes))
        self.assertFalse(np.allclose(modes[0], modes[1]))

    def test_pitch_ratio(self):
        self.assertTrue(math.isclose(semitones_to_ratio(12.0), 2.0, rel_tol=0.0001))
        self.assertTrue(math.isclose(semitones_to_ratio(-12.0), 0.5, rel_tol=0.0001))

    def test_pitch_shifter_outputs_finite_audio(self):
        sample_rate = 48000
        t = np.arange(sample_rate // 10, dtype=np.float32) / sample_rate
        wave = (0.2 * np.sin(2.0 * np.pi * 220.0 * t)).astype(np.float32)
        shifter = DualDelayPitchShifter(sample_rate)
        shifter.set_pitch_semitones(7.0)
        out = shifter.process(wave)
        self.assertEqual(out.shape, wave.shape)
        self.assertTrue(np.all(np.isfinite(out)))
        self.assertGreater(float(np.max(np.abs(out))), 0.001)


if __name__ == "__main__":
    unittest.main()
