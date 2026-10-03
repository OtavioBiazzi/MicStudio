import sys
import unittest
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import Mock, patch

from micfudiddo.backend import AppState
from micfudiddo.processing import EffectsSettings


class CommandHotkeyTests(unittest.TestCase):
    def setUp(self):
        self.keyboard = SimpleNamespace(add_hotkey=Mock(return_value="press"), hook=Mock(return_value="release"), remove_hotkey=Mock(), unhook=Mock())
        self.state = AppState.__new__(AppState)
        self.state.engine = SimpleNamespace(running=True, release_time_glitch=Mock(), trigger_time_glitch=Mock())
        self.state.effects = EffectsSettings(time_glitch_enabled=True, time_glitch_trigger_mode="shortcut")
        self.state.settings = {"shortcutCommandGlitch": "Ctrl+Alt+G"}
        self.state.time_glitch_hotkey_handles = []
        self.state.time_glitch_hotkey_down = False
        self.state.monitor_only_active = False
        self.state.voice_bypassed = False

    def register(self):
        with patch.dict(sys.modules, {"keyboard": self.keyboard}):
            self.state.refresh_time_glitch_hotkey()
        return self.keyboard.add_hotkey.call_args.args[1], self.keyboard.hook.call_args.args[0]

    def test_press_ignores_keyboard_auto_repeat_until_key_up(self):
        press, release = self.register()
        press(); press(); press()
        self.state.engine.trigger_time_glitch.assert_called_once_with(hold=False)
        release(SimpleNamespace(event_type="up", name="g"))
        press()
        self.assertEqual(self.state.engine.trigger_time_glitch.call_count, 2)

    def test_releasing_a_modifier_stops_hold(self):
        self.state.effects = replace(self.state.effects, time_glitch_shortcut_mode="hold")
        press, release = self.register()
        self.state.engine.release_time_glitch.reset_mock()
        press()
        release(SimpleNamespace(event_type="up", name="left ctrl"))
        self.state.engine.release_time_glitch.assert_called_once()
        self.assertFalse(self.state.time_glitch_hotkey_down)

    def test_stopped_bypassed_or_monitor_only_voice_cannot_trigger(self):
        press, _ = self.register()
        self.state.engine.running = False
        press()
        self.state.engine.running = True
        self.state.monitor_only_active = True
        press()
        self.state.monitor_only_active = False
        self.state.voice_bypassed = True
        press()
        self.state.engine.trigger_time_glitch.assert_not_called()

    def test_callbacks_from_previous_voice_cannot_trigger(self):
        press, _ = self.register()
        self.state.effects = EffectsSettings()
        press()
        self.state.engine.trigger_time_glitch.assert_not_called()

    def test_global_shortcut_is_not_replaced_by_a_preset_value(self):
        self.state.effects = replace(self.state.effects, time_glitch_shortcut="F2")
        self.register()
        self.assertEqual(self.keyboard.add_hotkey.call_args.args[0], "ctrl+alt+g")


if __name__ == "__main__":
    unittest.main()
