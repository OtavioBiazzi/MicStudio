import unittest
from dataclasses import replace
from unittest.mock import Mock

import numpy as np

from micfudiddo.processing import EffectsSettings, VoiceEffectsProcessor
from micfudiddo.backend import AppState


class TemporalCleanVoiceTests(unittest.TestCase):
    def setUp(self):
        self.rate = 8000
        self.settings = EffectsSettings(time_glitch_enabled=True, time_glitch_clean_voice=True,
            time_glitch_trigger_mode="shortcut", time_glitch_mix=.86, time_glitch_voice_duck=.35,
            time_glitch_repeats=5, time_glitch_fragment_ms=80, time_glitch_direction="forward",
            bitcrush_enabled=True, bitcrush_bits=7, glitch_enabled=True, glitch_mix=.18,
            ambience_enabled=True, ambience_mode="digital", ambience_volume=.08)
        self.signal = (np.sin(np.arange(self.rate, dtype=np.float32) * .17) * .3).astype(np.float32)

    def test_texture_does_not_modify_live_voice_between_events(self):
        processor = VoiceEffectsProcessor(self.rate)
        output = processor.process(self.signal, self.settings)
        np.testing.assert_array_equal(output, self.signal)
        np.testing.assert_array_equal(processor.process(np.zeros(512, np.float32), self.settings), np.zeros(512, np.float32))

    def test_zero_mix_is_clean_even_with_digital_texture_enabled(self):
        processor = VoiceEffectsProcessor(self.rate)
        settings = replace(self.settings, time_glitch_mix=0)
        processor.process(self.signal, settings)
        processor.trigger_time_glitch()
        np.testing.assert_array_equal(processor.process(self.signal[:512], settings), self.signal[:512])

    def test_disabling_temporal_effect_does_not_leak_texture_into_the_voice(self):
        processor = VoiceEffectsProcessor(self.rate)
        processor.process(self.signal, self.settings)
        processor.trigger_time_glitch(hold=True)
        processor.process(self.signal[:512], self.settings)
        np.testing.assert_array_equal(processor.process(self.signal, replace(self.settings, time_glitch_enabled=False)), self.signal)

    def test_replayed_audio_retains_texture_and_returns_to_clean_voice(self):
        processor = VoiceEffectsProcessor(self.rate)
        processor.process(self.signal, self.settings)
        processor.trigger_time_glitch()
        output = processor.process(self.signal, self.settings)
        self.assertGreater(float(np.mean(np.abs(output[:1000] - self.signal[:1000]))), .01)
        np.testing.assert_array_equal(output[-1000:], self.signal[-1000:])
        self.assertGreater(float(np.mean(np.abs(processor.time_glitch_grain[50:-50] - processor._time_glitch_source[50:-50]))), .005)

    def test_clean_mix_does_not_overload_correlated_full_scale_audio(self):
        processor = VoiceEffectsProcessor(self.rate)
        settings = replace(self.settings, bitcrush_enabled=False, glitch_enabled=False,
                           ambience_enabled=False, time_glitch_repeat_volume=3)
        source = np.full(8000, .9, dtype=np.float32)
        processor.process(source, settings)
        processor.trigger_time_glitch(hold=True)
        output = processor.process(source, settings)
        self.assertLessEqual(float(np.max(np.abs(output))), .900001)

    def test_texture_edits_update_only_the_captured_repeat(self):
        processor = VoiceEffectsProcessor(self.rate)
        processor.process(self.signal, self.settings)
        processor.trigger_time_glitch(hold=True)
        processor.process(self.signal[:128], self.settings)
        source = processor._time_glitch_source.copy()
        grain = processor.time_glitch_grain.copy()
        processor.process(self.signal[:128], replace(self.settings, bitcrush_bits=3))
        np.testing.assert_array_equal(processor._time_glitch_source, source)
        self.assertFalse(np.allclose(grain, processor.time_glitch_grain))

    def test_other_glitch_presets_keep_their_original_texture(self):
        processor = VoiceEffectsProcessor(self.rate)
        settings = replace(self.settings, time_glitch_clean_voice=False)
        self.assertFalse(np.allclose(processor.process(self.signal, settings), self.signal))

    def apply_profile(self, profile):
        state = AppState.__new__(AppState)
        state.profile = profile
        state.effects = EffectsSettings()
        state.devices = []
        state.selected_input = state.selected_output = state.selected_monitor = None
        state.find_device_index = Mock(return_value=None)
        state.update_device_names = Mock()
        state.engine = Mock(running=False)
        state.apply_profile()
        return state

    def test_existing_active_profile_is_migrated_without_resetting_timing(self):
        state = self.apply_profile({"activeVoiceId": "glitched_temporal", "gain": 2.8,
            "effects": {"time_glitch_enabled": True, "time_glitch_fragment_ms": 130, "time_glitch_repeats": 42}})
        self.assertEqual(state.gain, 1)
        self.assertTrue(state.effects.time_glitch_clean_voice)
        self.assertEqual(state.effects.time_glitch_voice_duck, .35)
        self.assertEqual(state.effects.time_glitch_fragment_ms, 130)
        self.assertEqual(state.effects.time_glitch_repeats, 42)

    def test_new_profile_and_other_voices_keep_their_customizations(self):
        state = self.apply_profile({"activeVoiceId": "glitched_temporal", "gain": 2.8,
            "effects": {"time_glitch_clean_voice": True, "time_glitch_voice_duck": 1}})
        self.assertEqual(state.gain, 2.8)
        self.assertEqual(state.effects.time_glitch_voice_duck, 1)
        state = self.apply_profile({"activeVoiceId": "personalizado", "gain": 2.8})
        self.assertEqual(state.gain, 2.8)
        self.assertFalse(state.effects.time_glitch_clean_voice)


if __name__ == "__main__":
    unittest.main()
