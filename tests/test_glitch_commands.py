import unittest
from dataclasses import replace

import numpy as np

from micfudiddo.engine import AudioEngine
from micfudiddo.processing import VoiceEffectsProcessor, EffectsSettings, DualDelayPitchShifter


class GlitchCommandRegressionTests(unittest.TestCase):
    def setUp(self):
        self.rate = 8000
        self.settings = EffectsSettings(time_glitch_enabled=True, time_glitch_mix=1,
            time_glitch_trigger_mode="shortcut", time_glitch_fragment_ms=100,
            time_glitch_lookback_s=.02, time_glitch_repeats=100, time_glitch_direction="forward")
        self.signal = (np.sin(np.arange(self.rate, dtype=np.float32) * .12) * .2).astype(np.float32)
        self.processor = VoiceEffectsProcessor(self.rate)
        self.processor.process(self.signal, self.settings)

    def trigger(self, hold=False):
        self.processor.trigger_time_glitch(hold=hold)
        self.processor.process(np.zeros(128, dtype=np.float32), self.settings)

    def test_short_history_still_captures_available_audio(self):
        processor = VoiceEffectsProcessor(self.rate)
        settings = replace(self.settings, time_glitch_fragment_ms=1500)
        processor.process(self.signal[:800], settings)
        processor.trigger_time_glitch()
        processor.process(self.signal[:128], settings)
        self.assertEqual(processor.time_glitch_grain.size, 800)
        self.assertGreater(processor.time_glitch_event_remaining, 0)

    def test_trigger_waits_for_audio_instead_of_disappearing(self):
        processor = VoiceEffectsProcessor(self.rate)
        processor.trigger_time_glitch(hold=True)
        for index in range(5):
            processor.process(self.signal[index * 128:(index + 1) * 128], self.settings)
        self.assertGreater(processor.time_glitch_event_remaining, 0)
        self.assertFalse(processor._time_glitch_trigger.is_set())

    def test_speed_changes_the_current_repeat_without_recapturing(self):
        self.trigger(hold=True)
        old_source = self.processor._time_glitch_source.copy()
        old_size = self.processor.time_glitch_grain.size
        self.processor.process(np.zeros(128, dtype=np.float32), replace(self.settings, time_glitch_speed=2))
        self.assertEqual(self.processor.time_glitch_grain.size, old_size // 2)
        np.testing.assert_array_equal(self.processor._time_glitch_source, old_source)

    def test_pitch_and_direction_change_current_repeat(self):
        self.trigger(hold=True)
        before = self.processor.time_glitch_grain.copy()
        settings = replace(self.settings, time_glitch_direction="reverse")
        self.processor.process(np.zeros(128, dtype=np.float32), settings)
        np.testing.assert_allclose(self.processor.time_glitch_grain, before[::-1], atol=1e-6)
        before = self.processor.time_glitch_grain.copy()
        self.processor.process(np.zeros(128, dtype=np.float32), replace(settings, time_glitch_pitch_semitones=7))
        self.assertGreater(float(np.mean(np.abs(before - self.processor.time_glitch_grain))), .001)

    def test_reducing_repeats_stops_a_long_running_repeat(self):
        self.trigger()
        self.processor.process(np.zeros(1600, dtype=np.float32), self.settings)
        self.processor.process(np.zeros(128, dtype=np.float32), replace(self.settings, time_glitch_repeats=1))
        self.assertEqual(self.processor.time_glitch_event_remaining, 0)

    def test_stop_and_parameter_changes_cannot_restart_a_repeat(self):
        self.trigger(hold=True)
        self.processor.release_time_glitch()
        settings = replace(self.settings, time_glitch_speed=2, time_glitch_repeats=10000)
        self.processor.process(np.zeros(256, dtype=np.float32), settings)
        output = self.processor.process(np.zeros(256, dtype=np.float32), settings)
        self.assertEqual(self.processor.time_glitch_event_remaining, 0)
        np.testing.assert_array_equal(output, np.zeros(256, dtype=np.float32))

    def test_zero_mix_keeps_recording_new_history(self):
        self.processor.process(np.full(1600, .1, dtype=np.float32), replace(self.settings, time_glitch_mix=0))
        self.trigger()
        self.assertAlmostEqual(float(np.mean(self.processor._time_glitch_source)), .1, places=5)

    def test_new_automatic_interval_does_not_wait_for_old_countdown(self):
        settings = replace(self.settings, time_glitch_trigger_mode="automatic", time_glitch_interval_s=5)
        processor = VoiceEffectsProcessor(self.rate)
        processor.process(self.signal[:4000], settings)
        processor.time_glitch_event_remaining = 0
        processor.time_glitch_samples_until_event = 30000
        processor.process(self.signal[:1000], replace(settings, time_glitch_interval_s=.05))
        self.assertGreater(processor.time_glitch_event_remaining, 0)

    def engine(self):
        engine = AudioEngine()
        engine._effects_processor = VoiceEffectsProcessor(self.rate)
        engine._pitch = DualDelayPitchShifter(self.rate)
        engine.set_controls(1, 0, self.settings)
        return engine

    def test_engine_reset_does_not_erase_a_subsequent_command(self):
        engine = self.engine()
        engine.reset_voice_effects()
        engine.trigger_time_glitch(hold=True)
        for index in range(6):
            block = self.signal[index * 128:(index + 1) * 128]
            engine._process_audio_block(block, block.size)
        self.assertGreater(engine._effects_processor.time_glitch_event_remaining, 0)
        self.assertTrue(engine._effects_processor._time_glitch_hold.is_set())

    def test_engine_updates_do_not_cancel_automatic_glitch(self):
        engine = self.engine()
        settings = replace(self.settings, time_glitch_trigger_mode="automatic")
        engine.set_controls(1, 0, settings)
        engine._process_audio_block(self.signal[:4000], 4000)
        before = engine._effects_processor.time_glitch_event_remaining
        self.assertGreater(before, 1000)
        engine.set_controls(1, 0, settings, monitor_volume=.3)
        engine._process_audio_block(self.signal[:128], 128)
        self.assertEqual(engine._effects_processor.time_glitch_event_remaining, before - 128)

    def test_last_stop_command_wins_before_next_callback(self):
        engine = self.engine()
        engine.trigger_time_glitch(hold=True)
        engine.release_time_glitch()
        engine._process_audio_block(self.signal, self.signal.size)
        self.assertEqual(engine._effects_processor.time_glitch_event_remaining, 0)

    def test_hold_remains_active_when_parameters_change_after_many_cycles(self):
        settings = replace(self.settings, time_glitch_repeats=1)
        self.processor.trigger_time_glitch(hold=True)
        self.processor.process(np.zeros(16000, dtype=np.float32), settings)
        self.processor.process(np.zeros(128, dtype=np.float32), replace(settings, time_glitch_speed=2))
        self.assertGreater(self.processor.time_glitch_event_remaining, 0)


if __name__ == "__main__":
    unittest.main()
