import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace

from micfudiddo import backend
from micfudiddo import profiles as ap
from micfudiddo.processing import EffectsSettings


class SanitizeTests(unittest.TestCase):
    def test_process_names_are_normalized(self):
        self.assertEqual(ap.normalize_process_name("C:\\Games\\Valorant.EXE"), "valorant.exe")
        self.assertEqual(ap.normalize_process_name(" discord "), "discord.exe")
        self.assertEqual(ap.normalize_process_name("a|b"), "")
        self.assertEqual(ap.normalize_process_name(""), "")

    def test_profile_without_name_is_rejected(self):
        self.assertIsNone(ap.sanitize_profile({"name": "  "}))
        self.assertIsNone(ap.sanitize_profile("lixo"))

    def test_values_are_clamped_and_cleaned(self):
        profile = ap.sanitize_profile(
            {
                "name": "x" * 100,
                "controls": {"gain": 9999, "monitorVolume": -3, "pitch": "abc", "masterMute": 1},
                "processes": ["Discord.exe", "discord", "", "..\\evil|.exe"],
                "id": "../../etc",
            }
        )
        self.assertEqual(len(profile["name"]), 40)
        self.assertEqual(profile["controls"]["gain"], 20.0)
        self.assertEqual(profile["controls"]["monitorVolume"], 0.0)
        self.assertEqual(profile["controls"]["pitch"], 0.0)
        self.assertIs(profile["controls"]["masterMute"], True)
        self.assertEqual(profile["processes"], ["discord.exe"])
        self.assertTrue(profile["id"].isalnum())  # id malicioso trocado por um novo

    def test_import_never_trusts_ids(self):
        profile = ap.sanitize_profile({"name": "A", "id": "abc123"}, keep_id=False)
        self.assertNotEqual(profile["id"], "abc123")

    def test_match_profile_for_process(self):
        profiles = [
            ap.sanitize_profile({"name": "Jogo", "processes": ["valorant.exe"]}),
            ap.sanitize_profile({"name": "Chat", "processes": ["discord.exe"]}),
        ]
        self.assertEqual(ap.match_profile_for_process(profiles, "Discord.EXE")["name"], "Chat")
        self.assertIsNone(ap.match_profile_for_process(profiles, "notepad.exe"))
        self.assertIsNone(ap.match_profile_for_process(profiles, ""))


def make_state():
    state = backend.AppState.__new__(backend.AppState)
    state.lock = threading.RLock()
    state.audio_profiles = []
    state.active_audio_profile_id = ""
    state.profile_notice = ""
    state._last_foreground_exe = ""
    state.active_voice_id = "robot"
    state.gain = 1.5
    state.pitch = 3.0
    state.master_mic_gain = 1.0
    state.master_voice_volume = 1.0
    state.master_pitch = 0.0
    state.master_mute = False
    state.monitor_enabled = True
    state.monitor_volume = 0.8
    state.soundboard_monitor_enabled = True
    state.soundboard_monitor_volume = 0.65
    state.effects = EffectsSettings(robot_enabled=True)
    state.selected_input_name = "Mic A"
    state.selected_input_hostapi = "WASAPI"
    state.selected_output_name = "CABLE Input"
    state.selected_output_hostapi = "WASAPI"
    state.selected_monitor_name = "Fone"
    state.selected_monitor_hostapi = "WASAPI"
    state.saved = 0
    state.save_profile = lambda: setattr(state, "saved", state.saved + 1)
    state.register_hotkeys = lambda: None
    state.applied = []
    state.apply_controls = lambda data: state.applied.append(data)
    state.changed_devices = []
    state.change_device_selection = lambda selection: state.changed_devices.append(selection)
    state.find_device_index = lambda name, hostapi, direction: {"Mic A": 1, "Mic B": 2, "Fone": 7}.get(name)
    return state


class ProfileLifecycleTests(unittest.TestCase):
    def test_create_captures_current_voice_and_controls(self):
        state = make_state()
        profile = state.create_audio_profile({"name": "Stream", "emoji": "🎮"})
        self.assertEqual(profile["voiceId"], "robot")
        self.assertEqual(profile["controls"]["gain"], 1.5)
        self.assertTrue(profile["controls"]["effects"]["robot_enabled"])
        self.assertEqual(profile["devices"]["input"]["name"], "Mic A")
        self.assertEqual(state.active_audio_profile_id, profile["id"])
        self.assertEqual(state.saved, 1)

    def test_create_requires_a_name(self):
        with self.assertRaises(ValueError):
            make_state().create_audio_profile({"name": ""})

    def test_apply_sends_controls_and_resets_voice(self):
        state = make_state()
        profile = state.create_audio_profile({"name": "A"})
        state.active_audio_profile_id = ""
        state.apply_audio_profile(profile["id"])
        sent = state.applied[0]
        self.assertEqual(sent["activeVoiceId"], "robot")
        self.assertTrue(sent["resetVoice"])
        self.assertFalse(sent["voiceBypassed"])
        self.assertEqual(state.active_audio_profile_id, profile["id"])
        self.assertEqual(state.changed_devices, [])  # dispositivos so mudam se a opcao estiver ligada

    def test_apply_can_switch_devices_when_enabled(self):
        state = make_state()
        profile = state.create_audio_profile({"name": "A", "applyDevices": True})
        state.selected_input_name = "Mic B"
        state.update_audio_profile(profile["id"], {})
        stored = state.audio_profiles[0]
        stored["devices"]["input"]["name"] = "Mic B"
        state.apply_audio_profile(profile["id"])
        self.assertEqual(state.changed_devices, [{"input": 2, "monitor": 7}])

    def test_update_with_capture_rewrites_state(self):
        state = make_state()
        profile = state.create_audio_profile({"name": "A"})
        state.gain = 2.0
        state.active_voice_id = "clean"
        state.update_audio_profile(profile["id"], {"capture": True, "name": "B"})
        stored = state.audio_profiles[0]
        self.assertEqual(stored["name"], "B")
        self.assertEqual(stored["controls"]["gain"], 2.0)
        self.assertEqual(stored["voiceId"], "clean")
        self.assertEqual(stored["id"], profile["id"])

    def test_delete_clears_active(self):
        state = make_state()
        profile = state.create_audio_profile({"name": "A"})
        state.delete_audio_profile(profile["id"])
        self.assertEqual(state.audio_profiles, [])
        self.assertEqual(state.active_audio_profile_id, "")

    def test_import_adds_valid_and_skips_invalid(self):
        state = make_state()
        added = state.import_audio_profiles([{"name": "Ok"}, {"name": ""}, "x"])
        self.assertEqual(added, 1)
        self.assertEqual(len(state.audio_profiles), 1)

    def test_profile_limit(self):
        state = make_state()
        for index in range(ap.MAX_PROFILES):
            state.create_audio_profile({"name": f"P{index}"})
        with self.assertRaises(RuntimeError):
            state.create_audio_profile({"name": "extra"})

    def test_missing_profile_raises(self):
        with self.assertRaises(RuntimeError):
            make_state().apply_audio_profile("nao-existe")


if __name__ == "__main__":
    unittest.main()
