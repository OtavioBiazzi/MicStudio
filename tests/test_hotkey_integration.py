import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from micfudiddo import backend
from micfudiddo.hotkeys import HoldTracker


def make_state(mode="restart", play_delay=0.0):
    state = backend.AppState.__new__(backend.AppState)
    state._hold = HoldTracker()
    state._hold_hook = None
    state._hotkey_futures = {}
    state._glitch_hold_mode = False
    state._glitch_signature = "sig"
    state.time_glitch_hotkey_signature = lambda: "sig"
    state.time_glitch_hotkey_down = False
    state.playback_executor = ThreadPoolExecutor(max_workers=2)
    state.events = []
    lock = threading.Lock()

    def play_sound(item_id):
        time.sleep(play_delay)
        with lock:
            state.events.append(("play", item_id))

    state.play_sound = play_sound
    state.library = SimpleNamespace(by_id=lambda item_id: SimpleNamespace(id=item_id, playback_mode=mode))
    state.engine = SimpleNamespace(
        stop_sound=lambda sound_id="", playback_id="": state.events.append(("stop", sound_id)),
        release_time_glitch=lambda: state.events.append(("glitch-release", None)),
    )
    return state


def settle(state):
    state.playback_executor.shutdown(wait=True)


class SoundHotkeyTests(unittest.TestCase):
    def test_holding_the_key_plays_once_not_dozens_of_times(self):
        state = make_state()
        for _ in range(40):  # repeticao automatica do teclado
            state._sound_hotkey_pressed("s1", "ctrl+1")
        settle(state)
        self.assertEqual(state.events.count(("play", "s1")), 1)

    def test_pressing_again_after_release_plays_again(self):
        state = make_state()
        state._sound_hotkey_pressed("s1", "ctrl+1")
        state._hold.key_up("1")
        state._on_hotkey_released("sound:s1")
        state._sound_hotkey_pressed("s1", "ctrl+1")
        settle(state)
        self.assertEqual(state.events.count(("play", "s1")), 2)

    def test_hold_loop_stops_when_the_key_is_released(self):
        state = make_state(mode="hold_loop")
        state._sound_hotkey_pressed("s1", "ctrl+1")
        for _ in range(10):
            state._sound_hotkey_pressed("s1", "ctrl+1")
        for hotkey_id in state._hold.key_up("1"):
            state._on_hotkey_released(hotkey_id)
        settle(state)
        self.assertEqual(state.events, [("play", "s1"), ("stop", "s1")])

    def test_releasing_before_the_sound_finished_loading_still_stops_it(self):
        state = make_state(mode="hold_loop", play_delay=0.15)  # som demora para renderizar
        state._sound_hotkey_pressed("s1", "ctrl+1")
        for hotkey_id in state._hold.key_up("1"):  # solta na hora
            state._on_hotkey_released(hotkey_id)
        settle(state)
        self.assertEqual(state.events, [("play", "s1"), ("stop", "s1")], "o stop tem que vir DEPOIS do play, senao o loop fica preso")

    def test_normal_modes_do_not_stop_the_sound_on_release(self):
        for mode in ("restart", "overlap", "pause", "stop"):
            state = make_state(mode=mode)
            state._sound_hotkey_pressed("s1", "ctrl+1")
            for hotkey_id in state._hold.key_up("1"):
                state._on_hotkey_released(hotkey_id)
            settle(state)
            self.assertEqual(state.events, [("play", "s1")], mode)

    def test_a_failing_sound_does_not_break_the_hotkey(self):
        state = make_state()
        state.play_sound = lambda item_id: (_ for _ in ()).throw(RuntimeError("arquivo sumiu"))
        state._sound_hotkey_pressed("s1", "ctrl+1")
        settle(state)  # nao pode levantar excecao


class GlitchHotkeyTests(unittest.TestCase):
    def test_hold_mode_releases_the_glitch_when_the_key_is_released(self):
        state = make_state()
        state._glitch_hold_mode = True
        self.assertTrue(state._hold.press("glitch", "ctrl+alt+g"))
        state.time_glitch_hotkey_down = True
        for hotkey_id in state._hold.key_up("alt"):
            state._on_hotkey_released(hotkey_id)
        self.assertEqual(state.events, [("glitch-release", None)])
        self.assertFalse(state.time_glitch_hotkey_down)

    def test_press_mode_does_not_cut_the_glitch_on_release(self):
        state = make_state()
        state._glitch_hold_mode = False
        state._hold.press("glitch", "ctrl+alt+g")
        state.time_glitch_hotkey_down = True
        for hotkey_id in state._hold.key_up("g"):
            state._on_hotkey_released(hotkey_id)
        self.assertEqual(state.events, [])
        self.assertFalse(state.time_glitch_hotkey_down)

    def test_global_key_event_only_reacts_to_key_up(self):
        state = make_state()
        state._glitch_hold_mode = True
        state._hold.press("glitch", "ctrl+alt+g")
        state._on_global_key_event(SimpleNamespace(event_type="down", name="g"))
        self.assertTrue(state._hold.is_down("glitch"))
        state._on_global_key_event(SimpleNamespace(event_type="up", name="g"))
        self.assertFalse(state._hold.is_down("glitch"))
        self.assertEqual(state.events, [("glitch-release", None)])


if __name__ == "__main__":
    unittest.main()
