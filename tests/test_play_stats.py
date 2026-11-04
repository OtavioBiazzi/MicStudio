import json
import tempfile
import threading
import time
import unittest
from pathlib import Path

from micfudiddo.soundboard import SoundItem, SoundLibrary


def make_library(base: Path) -> SoundLibrary:
    library = SoundLibrary.__new__(SoundLibrary)
    library.index_path = base / "soundboard.json"
    library.revision = 1
    library._stats_lock = threading.Lock()
    library._stats_timer = None
    audio = base / "a.wav"
    audio.write_bytes(b"RIFF")
    library.items = [SoundItem(id="a", name="A", path=str(audio))]
    return library


class PlayStatsTests(unittest.TestCase):
    def test_playing_does_not_write_the_file_or_change_the_revision(self):
        with tempfile.TemporaryDirectory() as tmp:
            library = make_library(Path(tmp))
            library.record_play("a")
            library.record_play("a")
            self.assertEqual(library.items[0].play_count, 2)
            self.assertFalse(library.index_path.exists(), "nao pode gravar o JSON a cada play")
            self.assertEqual(library.revision, 1, "tocar um som nao e mudanca da biblioteca")
            library.flush_stats()

    def test_several_plays_become_one_background_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            library = make_library(Path(tmp))
            for _ in range(5):
                library.record_play("a")
            library.flush_stats()
            data = json.loads(library.index_path.read_text(encoding="utf-8"))
            self.assertEqual(data[0]["play_count"], 5)
            self.assertEqual(library.revision, 1)

    def test_flush_without_pending_plays_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            library = make_library(Path(tmp))
            library.flush_stats()
            self.assertFalse(library.index_path.exists())

    def test_the_background_timer_saves_by_itself(self):
        with tempfile.TemporaryDirectory() as tmp:
            library = make_library(Path(tmp))
            library.save_stats_later(delay=0.05)
            library.items[0].play_count = 3
            time.sleep(0.3)
            data = json.loads(library.index_path.read_text(encoding="utf-8"))
            self.assertEqual(data[0]["play_count"], 3)

    def test_real_changes_still_bump_the_revision(self):
        with tempfile.TemporaryDirectory() as tmp:
            library = make_library(Path(tmp))
            library.save()
            self.assertEqual(library.revision, 2)


if __name__ == "__main__":
    unittest.main()
