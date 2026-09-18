import unittest

import numpy as np
import soundfile as sf
from pathlib import Path
from tempfile import TemporaryDirectory

from micfudiddo.devices import AudioDevice, sample_rate_candidates
from micfudiddo.engine import AudioEngine, block_size_candidates, input_channel_count
from micfudiddo.soundboard import StreamingAudioSource


def device(inputs=1, samplerate=48000):
    return AudioDevice(
        index=1,
        name="Microfone",
        hostapi="Windows WASAPI",
        max_input_channels=inputs,
        max_output_channels=0,
        default_samplerate=samplerate,
    )


class EngineConfigTests(unittest.TestCase):
    def test_preferred_sample_rate_is_tried_first(self):
        values = sample_rate_candidates(device(samplerate=44100), None, preferred_sample_rate=44100)
        self.assertEqual(values[0], 44100)
        self.assertIn(48000, values)

    def test_preferred_block_size_is_tried_first_with_fallbacks(self):
        values = block_size_candidates(256)
        self.assertEqual(values[0], 256)
        self.assertIn(1024, values)
        self.assertIn(512, values)

    def test_input_channels_are_clamped_to_device_capacity(self):
        self.assertEqual(input_channel_count(device(inputs=1), 2), 1)
        self.assertEqual(input_channel_count(device(inputs=2), 2), 2)

    def test_overlapping_playbacks_are_bounded(self):
        engine = AudioEngine()
        samples = np.ones(32, dtype=np.float32)
        for index in range(30):
            engine.play_sound(samples, sound_id=str(index), replace=False)
        self.assertEqual(len(engine.player_states()), 16)

    def test_initial_playback_volume_is_applied(self):
        engine = AudioEngine()
        samples = np.ones(32, dtype=np.float32)
        engine.play_sound(samples, sound_id="preview", initial_volume=0.0)
        self.assertEqual(engine.player_states()[0]["volume"], 0.0)

    def test_streaming_playback_can_exceed_six_minutes(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "long.wav"
            sample_rate = 10
            sf.write(path, np.ones(sample_rate * 361, dtype=np.float32) * 0.25, sample_rate)
            source = StreamingAudioSource(str(path), sample_rate)
            engine = AudioEngine()
            engine._sample_rate = sample_rate
            playback_id = engine.play_sound(source, sound_id="long")

            state = engine.player_states()[0]
            self.assertGreater(state["duration"], 360.0)
            engine.seek_sound(360.0, playback_id=playback_id)
            mixed, _local, _blocked = engine._read_soundboard_mix(5)
            self.assertTrue(np.all(mixed > 0.0))
            engine.stop_sounds()

            loop_source = StreamingAudioSource(str(path), sample_rate)
            loop_id = engine.play_sound(loop_source, sound_id="long-loop", loop=True, initial_speed=2.0)
            engine.seek_sound(360.8, playback_id=loop_id)
            looped, _local, _blocked = engine._read_soundboard_mix(5)
            self.assertTrue(np.all(looped > 0.0))
            self.assertLess(engine.player_states()[0]["current"], 1.0)
            engine.stop_sounds()


if __name__ == "__main__":
    unittest.main()
