import unittest

import numpy as np

from micfudiddo.soundboard import render_sound_for_playback

RATE = 48000


def sine(freq, seconds=1.0):
    t = np.arange(int(RATE * seconds)) / RATE
    return (0.5 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def dominant_frequency(samples):
    window = np.hanning(samples.size)
    spectrum = np.abs(np.fft.rfft(samples * window))
    return float(np.argmax(spectrum) * RATE / samples.size)


class SpeedPitchTests(unittest.TestCase):
    def test_speed_up_keeps_pitch_by_default(self):
        out = render_sound_for_playback(sine(440), 1.0, 0.0, 1, speed=2.0, sample_rate=RATE)
        self.assertAlmostEqual(out.size / RATE, 0.5, delta=0.03)
        middle = out[int(out.size * 0.2): int(out.size * 0.8)]
        self.assertAlmostEqual(dominant_frequency(middle), 440, delta=40)

    def test_slow_down_keeps_pitch_by_default(self):
        out = render_sound_for_playback(sine(440), 1.0, 0.0, 1, speed=0.5, sample_rate=RATE)
        self.assertAlmostEqual(out.size / RATE, 2.0, delta=0.06)
        middle = out[int(out.size * 0.2): int(out.size * 0.8)]
        self.assertAlmostEqual(dominant_frequency(middle), 440, delta=40)

    def test_tape_mode_raises_pitch_with_speed(self):
        out = render_sound_for_playback(
            sine(440), 1.0, 0.0, 1, pitch_mode="resample", speed=2.0, sample_rate=RATE
        )
        self.assertAlmostEqual(dominant_frequency(out), 880, delta=40)

    def test_normal_speed_is_untouched(self):
        source = sine(440)
        out = render_sound_for_playback(source, 1.0, 0.0, 1, speed=1.0, sample_rate=RATE)
        self.assertEqual(out.size, source.size)


if __name__ == "__main__":
    unittest.main()
