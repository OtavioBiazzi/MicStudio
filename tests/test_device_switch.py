import unittest
from unittest.mock import patch

from micfudiddo.backend import AppState
from micfudiddo.devices import AudioDevice


class FakeEngine:
    def __init__(self):
        self.running = True
        self.stop_count = 0

    def stop(self):
        self.running = False
        self.stop_count += 1


def device(index, name, *, inputs=0, outputs=0):
    return AudioDevice(index, name, "Windows WASAPI", inputs, outputs, 48000.0)


def state_for_switch():
    state = AppState.__new__(AppState)
    state.devices = [
        device(1, "Microfone", inputs=1),
        device(2, "FIFINE", outputs=2),
        device(3, "JBL Quantum Chat", outputs=2),
        device(4, "CABLE Input", outputs=2),
    ]
    state.selected_input = 1
    state.selected_output = 4
    state.selected_monitor = 2
    state.engine = FakeEngine()
    state.monitor_only_active = False
    state.status = "Processando"
    state.saved = 0
    state.update_device_names()
    state.stop = lambda: state.engine.stop()
    state.save_profile = lambda: setattr(state, "saved", state.saved + 1)
    return state


class DeviceSwitchTests(unittest.TestCase):
    @patch("micfudiddo.backend.time.sleep", return_value=None)
    def test_switch_retries_then_saves_confirmed_device(self, _sleep):
        state = state_for_switch()
        attempts = []

        def start():
            attempts.append(state.selected_monitor)
            if len(attempts) == 1:
                raise RuntimeError("dispositivo ainda ocupado")
            state.engine.running = True

        state.start = start
        state.change_device_selection({"monitor": 3})

        self.assertEqual(state.selected_monitor, 3)
        self.assertEqual(state.selected_monitor_name, "JBL Quantum Chat")
        self.assertEqual(attempts, [3, 3])
        self.assertEqual(state.saved, 1)
        self.assertTrue(state.engine.running)

    @patch("micfudiddo.backend.time.sleep", return_value=None)
    def test_failed_switch_rolls_back_without_saving_bad_choice(self, _sleep):
        state = state_for_switch()
        attempts = []

        def start():
            attempts.append(state.selected_monitor)
            if state.selected_monitor == 3:
                raise RuntimeError("JBL indisponivel")
            state.engine.running = True

        state.start = start
        with self.assertRaisesRegex(RuntimeError, "Nao foi possivel usar"):
            state.change_device_selection({"monitor": 3})

        self.assertEqual(state.selected_monitor, 2)
        self.assertEqual(state.selected_monitor_name, "FIFINE")
        self.assertEqual(attempts, [3, 3, 3, 2])
        self.assertEqual(state.saved, 0)
        self.assertTrue(state.engine.running)

    def test_rejects_stale_device_index(self):
        state = state_for_switch()
        with self.assertRaisesRegex(RuntimeError, "nao esta mais disponivel"):
            state.change_device_selection({"monitor": 99})
        self.assertEqual(state.selected_monitor, 2)
        self.assertEqual(state.saved, 0)


if __name__ == "__main__":
    unittest.main()
