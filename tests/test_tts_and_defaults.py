import unittest

from micfudiddo import backend
from micfudiddo.processing import EffectsSettings


class FactoryDefaultsTests(unittest.TestCase):
    def test_voice_starts_on_without_filter_and_monitor_is_off(self):
        self.assertTrue(backend.DEFAULT_APP_SETTINGS["autoStartVirtual"])
        self.assertFalse(backend.DEFAULT_PROFILE["monitor"])
        self.assertEqual(backend.DEFAULT_PROFILE["activeVoiceId"], "clean")

    def test_no_effect_is_enabled_by_default(self):
        enabled = [k for k, v in vars(EffectsSettings()).items() if k.endswith("_enabled") and v]
        self.assertEqual(enabled, [])


class TtsHelpersTests(unittest.TestCase):
    def test_offset_is_clamped_and_signed(self):
        self.assertEqual(backend.format_tts_offset(0, "Hz", 100), "+0Hz")
        self.assertEqual(backend.format_tts_offset(-250, "Hz", 100), "-100Hz")
        self.assertEqual(backend.format_tts_offset("abc", "Hz", 100), "+0Hz")

    def test_long_text_is_split_without_losing_words(self):
        text = " ".join(["palavra"] * 2000)
        chunks = backend.split_tts_text(text, limit=500)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(c) <= 500 for c in chunks))
        self.assertEqual(" ".join(chunks).split(), text.split())

    def test_fallback_voices_have_required_fields(self):
        for voice in backend.TTS_FALLBACK_VOICES:
            self.assertTrue({"id", "name", "lang"} <= set(voice))


if __name__ == "__main__":
    unittest.main()


class SafeStartupTests(unittest.TestCase):
    def test_old_settings_are_migrated_to_voice_on_once(self):
        state = backend.AppState.__new__(backend.AppState)
        state.app_settings_path = None
        original = backend.load_json_with_backup
        try:
            backend.load_json_with_backup = lambda *a, **k: {"autoStartVirtual": False, "safeDefaultsVersion": 1}
            self.assertTrue(state.load_app_settings()["autoStartVirtual"])
            # Depois de migrado, desligar de proposito e respeitado.
            backend.load_json_with_backup = lambda *a, **k: {"autoStartVirtual": False, "settingsDefaultsVersion": 2, "safeDefaultsVersion": 1}
            self.assertFalse(state.load_app_settings()["autoStartVirtual"])
        finally:
            backend.load_json_with_backup = original

    def test_saved_voice_is_ignored_unless_remember_is_on(self):
        state = backend.AppState.__new__(backend.AppState)
        state.profile_path = None
        raw = {"gain": 5.0, "activeVoiceId": "rewind_meme", "monitor": True,
               "effects": {"robot_enabled": True}, "safeDefaultsVersion": 1}
        original = backend.load_json_with_backup
        backend.load_json_with_backup = lambda *a, **k: raw
        try:
            state.settings = {"rememberLastVoice": False}
            profile = state.load_profile()
            self.assertEqual(profile["activeVoiceId"], "clean")
            self.assertEqual(profile["gain"], 1.0)
            self.assertTrue(profile["monitor"])  # preferencia atual do usuario preservada

            state.settings = {"rememberLastVoice": True}
            profile = state.load_profile()
            self.assertEqual(profile["activeVoiceId"], "rewind_meme")
        finally:
            backend.load_json_with_backup = original

    def test_old_profile_without_version_gets_monitor_off(self):
        state = backend.AppState.__new__(backend.AppState)
        state.profile_path = None
        state.settings = {"rememberLastVoice": True}
        original = backend.load_json_with_backup
        backend.load_json_with_backup = lambda *a, **k: {"monitor": True}
        try:
            self.assertFalse(state.load_profile()["monitor"])
        finally:
            backend.load_json_with_backup = original
