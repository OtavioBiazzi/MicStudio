import unittest

import numpy as np

from micfudiddo.processing import VoiceEffectsProcessor

RATE = 48000


def sine(freq, amplitude, seconds):
    t = np.arange(int(RATE * seconds)) / RATE
    return (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) if x.size else 0.0


def run_gate(samples, threshold=0.08, block=1024):
    processor = VoiceEffectsProcessor(RATE)
    pieces = [processor._noise_gate(samples[i:i + block], threshold) for i in range(0, samples.size, block)]
    return np.concatenate(pieces)


def harmonic_distortion(signal, fundamental):
    window = np.hanning(signal.size)
    spectrum = np.abs(np.fft.rfft(signal * window))
    bin_hz = RATE / signal.size
    fundamental_bin = int(round(fundamental / bin_hz))
    span = 6
    fundamental_energy = np.sum(spectrum[fundamental_bin - span:fundamental_bin + span + 1] ** 2)
    total_energy = np.sum(spectrum[1:] ** 2)
    return float((total_energy - fundamental_energy) / max(total_energy, 1e-12))


class NoiseGateTests(unittest.TestCase):
    def test_loud_voice_passes_through_unchanged(self):
        voice = sine(220, 0.3, 1.0)
        out = run_gate(voice)
        steady = slice(RATE // 5, None)
        self.assertGreater(rms(out[steady]) / rms(voice[steady]), 0.99)

    def test_voice_is_not_distorted_by_the_gate(self):
        voice = sine(220, 0.2, 1.0)
        out = run_gate(voice, threshold=0.08)
        steady = slice(RATE // 5, None)
        # a versao antiga multiplicava cada amostra pelo proprio nivel e gerava muita distorcao harmonica
        self.assertLess(harmonic_distortion(out[steady], 220), 1e-3)

    def test_background_noise_is_reduced(self):
        rng = np.random.default_rng(3)
        noise = (rng.standard_normal(RATE) * 0.01).astype(np.float32)
        out = run_gate(noise, threshold=0.08)
        steady = slice(RATE // 4, None)
        self.assertLess(rms(out[steady]) / rms(noise[steady]), 0.06)

    def test_opens_on_speech_and_closes_after_it(self):
        rng = np.random.default_rng(5)
        quiet = lambda seconds: (rng.standard_normal(int(RATE * seconds)) * 0.008).astype(np.float32)
        burst = sine(180, 0.25, 0.5) + quiet(0.5)
        signal = np.concatenate([quiet(0.5), burst, quiet(1.0)])
        out = run_gate(signal, threshold=0.08)
        during = slice(int(RATE * 0.62), int(RATE * 0.95))
        silence_before = slice(int(RATE * 0.1), int(RATE * 0.45))
        silence_after = slice(int(RATE * 1.9), int(RATE * 2.4))
        self.assertGreater(rms(out[during]) / rms(signal[during]), 0.95)
        self.assertLess(rms(out[silence_before]) / rms(signal[silence_before]), 0.1)
        self.assertLess(rms(out[silence_after]) / rms(signal[silence_after]), 0.1)

    def test_holds_open_across_short_pauses_in_speech(self):
        pause = np.zeros(int(RATE * 0.06), dtype=np.float32)  # pausa curta entre silabas
        signal = np.concatenate([sine(200, 0.25, 0.3), pause, sine(200, 0.25, 0.3)])
        out = run_gate(signal, threshold=0.08)
        second_syllable = slice(int(RATE * 0.39), int(RATE * 0.6))
        self.assertGreater(rms(out[second_syllable]) / rms(signal[second_syllable]), 0.97)

    def test_zero_threshold_is_a_passthrough(self):
        voice = sine(220, 0.01, 0.2)
        processor = VoiceEffectsProcessor(RATE)
        self.assertTrue(np.array_equal(processor._noise_gate(voice, 0.0), voice))

    def test_state_survives_between_blocks(self):
        voice = sine(220, 0.3, 1.0)
        whole = VoiceEffectsProcessor(RATE)._noise_gate(voice, 0.08)
        chunked = run_gate(voice, 0.08, block=1024)
        steady = slice(RATE // 5, None)
        self.assertAlmostEqual(rms(whole[steady]), rms(chunked[steady]), delta=0.01)

    def test_output_is_finite_and_same_length(self):
        rng = np.random.default_rng(9)
        signal = (rng.standard_normal(RATE) * 0.3).astype(np.float32)
        out = run_gate(signal, threshold=0.4)
        self.assertEqual(out.size, signal.size)
        self.assertTrue(np.all(np.isfinite(out)))
        self.assertLessEqual(float(np.max(np.abs(out))), float(np.max(np.abs(signal))) + 1e-6)


if __name__ == "__main__":
    unittest.main()
