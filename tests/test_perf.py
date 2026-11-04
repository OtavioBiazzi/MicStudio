import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

from micfudiddo import backend


def make_state(base_dir: Path):
    state = backend.AppState.__new__(backend.AppState)
    state.lock = threading.RLock()
    state._profile_save_lock = threading.Lock()
    state._profile_save_timer = None
    state._duration_cache_dirty = False
    state._storage_busy = False
    state.duration_cache = {}
    state.library = SimpleNamespace(base_dir=base_dir, sounds_dir=base_dir / "sounds")
    return state


class ProfileSaveTests(unittest.TestCase):
    def test_burst_of_requests_writes_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = make_state(Path(tmp))
            saves = []
            state.save_profile = lambda: saves.append(time.monotonic())
            for _ in range(50):
                state.request_save_profile(delay=0.05)
            time.sleep(0.3)
            self.assertEqual(len(saves), 1)

    def test_flush_writes_pending_profile_immediately(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = make_state(Path(tmp))
            saves = []
            state.save_profile = lambda: saves.append(1)
            state.request_save_profile(delay=30)
            state.flush_profile()
            self.assertEqual(saves, [1])
            state.flush_profile()
            self.assertEqual(saves, [1])


class DurationCacheTests(unittest.TestCase):
    def test_cache_survives_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            state = make_state(base)
            state.duration_cache["a.wav"] = (123, 4.5)
            state._duration_cache_dirty = True
            state.save_duration_cache()

            other = make_state(base)
            other.load_duration_cache()
            self.assertEqual(other.duration_cache["a.wav"], (123, 4.5))


class StorageTests(unittest.TestCase):
    def test_total_storage_does_not_block_and_fills_in_background(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "sounds").mkdir()
            (base / "sounds" / "x.bin").write_bytes(b"0" * 2048)
            state = make_state(base)
            self.assertEqual(state.calculate_total_storage(), 0)
            deadline = time.monotonic() + 3
            while state._storage_busy and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertEqual(state._storage_cache[1], 2048)


class VoiceWatchdogTests(unittest.TestCase):
    def make(self, running=False):
        state = make_state(Path(tempfile.gettempdir()))
        state.voice_wanted = True
        state.voice_problem = ""
        state._voice_recover_failures = 0
        state.monitor_only_active = False
        state.selected_input_name = "Mic A"
        state.voice_notice = ""
        state.status = ""
        state.engine = SimpleNamespace(running=running)
        state.refresh_devices = lambda: None
        return state

    def test_reconnects_when_voice_dropped(self):
        state = self.make()
        started = []
        state.start = lambda: started.append(1)
        state.recover_voice_if_needed()
        self.assertEqual(started, [1])
        self.assertEqual(state.voice_problem, "")

    def test_notifies_when_microphone_changed(self):
        state = self.make()

        def refresh():
            state.selected_input_name = "Mic B"

        state.refresh_devices = refresh
        state.start = lambda: None
        state.recover_voice_if_needed()
        self.assertIn("Mic A", state.voice_notice)
        self.assertIn("Mic B", state.voice_notice)

    def test_does_nothing_when_user_turned_voice_off(self):
        state = self.make()
        state.voice_wanted = False
        state.start = lambda: self.fail("nao deveria religar")
        state.recover_voice_if_needed()

    def test_reports_problem_and_gives_up_after_retries(self):
        state = self.make()
        calls = []

        def boom():
            calls.append(1)
            raise RuntimeError("sem microfone")

        state.start = boom
        for _ in range(10):
            state.recover_voice_if_needed()
        self.assertEqual(len(calls), 5)
        self.assertIn("sem microfone", state.voice_problem)


if __name__ == "__main__":
    unittest.main()
