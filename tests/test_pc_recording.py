import io
import struct
import tempfile
import time
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from micfudiddo.recording import AppAudioRecorder, fill_gap


class FakeProcess:
    """Imita o VozLabAudioTap: manda PCM 48 kHz estereo no stdout e uma linha de 'sources' no stderr."""

    def __init__(self, seconds=0.5, alive=True):
        frames = int(48000 * seconds)
        pcm = b"".join(struct.pack("<hh", 1000, -1000) for _ in range(frames))
        self.stdout = io.BytesIO(pcm)
        self.stderr = io.BytesIO(b'{"type":"sources","names":["Discord","opera"]}\n')
        self._alive = alive
        self.killed = False

    def poll(self):
        return None if self._alive else 3

    def kill(self):
        self.killed = True

    def wait(self, timeout=None):
        return 0


class FillGapTests(unittest.TestCase):
    def test_no_gap_when_blocks_arrive_on_time(self):
        self.assertEqual(fill_gap(captured_frames=48000, elapsed_seconds=1.02, block_frames=960, sample_rate=48000), 0)

    def test_silent_output_gets_its_silence_back(self):
        # a saida ficou muda 2 s: o proximo bloco tem que cair 2 s depois, nao colado no anterior
        gap = fill_gap(captured_frames=48000, elapsed_seconds=3.02, block_frames=960, sample_rate=48000)
        self.assertAlmostEqual(gap / 48000, 2.0, delta=0.05)


class AppAudioRecorderTests(unittest.TestCase):
    def test_records_all_apps_except_vozlab_and_writes_one_stereo_file(self):
        calls = {}

        def fake_popen(args, **kwargs):
            calls["args"] = args
            return FakeProcess(seconds=0.5)

        with tempfile.TemporaryDirectory() as tmp:
            recorder = AppAudioRecorder(Path(tmp), Path("tap.exe"), exclude_pids=[111, 222], popen=fake_popen)
            recorder.start()
            self.assertTrue(recorder.running)
            time.sleep(0.3)
            paths = recorder.stop()
            self.assertEqual(len(paths), 1)
            audio, rate = sf.read(paths[0])
            self.assertEqual(rate, 48000)
            self.assertEqual(audio.shape[1], 2, "grava em estereo")
            self.assertAlmostEqual(len(audio) / 48000, 0.5, delta=0.01)
            self.assertIn("--allow-discord", calls["args"], "a call do Discord entra na gravacao")
            self.assertIn("--system", calls["args"])
            self.assertEqual(calls["args"].count("--exclude-pid"), 2, "o VozLab (app e backend) fica de fora")
            self.assertEqual(recorder.sources, ["Discord", "opera"])

    def test_helper_that_does_not_start_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            recorder = AppAudioRecorder(Path(tmp), Path("tap.exe"), popen=lambda *a, **k: FakeProcess(alive=False))
            with self.assertRaises(RuntimeError):
                recorder.start()
            self.assertFalse(recorder.running)

    def test_discard_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            recorder = AppAudioRecorder(Path(tmp), Path("tap.exe"), popen=lambda *a, **k: FakeProcess(seconds=0.2))
            recorder.start()
            time.sleep(0.2)
            self.assertEqual(recorder.stop(discard=True), [])
            self.assertEqual(list(Path(tmp).glob("*.wav")), [])


if __name__ == "__main__":
    unittest.main()
