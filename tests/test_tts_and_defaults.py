import unittest

from micfudiddo import backend
from micfudiddo.processing import EffectsSettings


class FactoryDefaultsTests(unittest.TestCase):
    def test_voice_monitor_and_auto_route_are_off_by_default(self):
        self.assertFalse(backend.DEFAULT_APP_SETTINGS["autoStartVirtual"])
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
