import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace

from micfudiddo.chat_export import MAX_SECONDS, chat_export


def write_wav(path: Path, seconds: float, rate: int = 48000) -> None:
    frames = int(seconds * rate)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        data = bytearray()
        for i in range(frames):
            value = int(math.sin(2 * math.pi * 440 * i / rate) * 8000)
            data += struct.pack("<hh", value, value)
        wav.writeframes(bytes(data))


class ChatExportTests(unittest.TestCase):
    def test_big_wav_becomes_small_mp3(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "som grande.wav"
            write_wav(source, 20)  # ~3,8 MB em WAV
            result = chat_export(str(source), Path(tmp) / "cache", duration=20)
            out = Path(result["path"])
            self.assertTrue(out.is_file())
            self.assertEqual(out.suffix, ".mp3")
            self.assertLess(out.stat().st_size, source.stat().st_size / 5, "o MP3 tem que ser bem menor que o WAV")
            self.assertFalse(result["trimmed"])

    def test_reuses_the_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "a.wav"
            write_wav(source, 1)
            first = chat_export(str(source), Path(tmp) / "cache", duration=1)
            calls = []
            second = chat_export(str(source), Path(tmp) / "cache", duration=1, run=lambda *a, **k: calls.append(a))
            self.assertEqual(first["path"], second["path"])
            self.assertEqual(calls, [], "nao converte de novo se o arquivo nao mudou")

    def test_long_sound_is_marked_as_trimmed_to_three_minutes(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "a.wav"
            write_wav(source, 0.2)
            seen = {}

            def fake_run(command, **kwargs):
                seen["command"] = command
                Path(command[-1]).write_bytes(b"mp3")
                return SimpleNamespace(returncode=0)

            result = chat_export(str(source), Path(tmp) / "cache", duration=400, ffmpeg="ffmpeg", run=fake_run)
            self.assertTrue(result["trimmed"])
            self.assertEqual(result["duration"], MAX_SECONDS)
            self.assertIn(str(MAX_SECONDS), seen["command"])

    def test_missing_file_and_ffmpeg_failure_give_clear_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(RuntimeError):
                chat_export(str(Path(tmp) / "nao-existe.wav"), Path(tmp) / "cache")
            source = Path(tmp) / "a.wav"
            write_wav(source, 0.2)
            with self.assertRaisesRegex(RuntimeError, "preparar"):
                chat_export(str(source), Path(tmp) / "cache", ffmpeg="ffmpeg", run=lambda *a, **k: SimpleNamespace(returncode=1))


if __name__ == "__main__":
    unittest.main()
