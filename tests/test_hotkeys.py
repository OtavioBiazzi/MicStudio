import unittest

from micfudiddo.hotkeys import HoldTracker, hotkey_keys, normalize_hotkey_text, normalize_key_name


class NormalizeTests(unittest.TestCase):
    def test_key_names_from_keyboard_and_text_match(self):
        self.assertEqual(normalize_key_name("Left Ctrl"), "ctrl")
        self.assertEqual(normalize_key_name("right shift"), "shift")
        self.assertEqual(normalize_key_name("Control"), "ctrl")
        self.assertEqual(normalize_key_name("Windows"), "win")
        self.assertEqual(normalize_key_name("G"), "g")

    def test_hotkey_keys(self):
        self.assertEqual(hotkey_keys("Ctrl+Alt+G"), {"ctrl", "alt", "g"})
        self.assertEqual(hotkey_keys("control + shift + F5"), {"ctrl", "shift", "f5"})
        self.assertEqual(hotkey_keys(""), frozenset())

    def test_hotkey_text_puts_modifiers_first(self):
        self.assertEqual(normalize_hotkey_text("G+Ctrl+Alt"), "alt+ctrl+g")
        self.assertEqual(normalize_hotkey_text("Control+F5"), "ctrl+f5")


class HoldTrackerTests(unittest.TestCase):
    def test_keyboard_auto_repeat_fires_only_once(self):
        tracker = HoldTracker()
        fired = [tracker.press("s1", "ctrl+1") for _ in range(30)]
        self.assertEqual(fired.count(True), 1)
        self.assertTrue(tracker.is_down("s1"))

    def test_release_allows_the_next_press(self):
        tracker = HoldTracker()
        self.assertTrue(tracker.press("s1", "ctrl+1"))
        self.assertEqual(tracker.key_up("1"), ["s1"])
        self.assertFalse(tracker.is_down("s1"))
        self.assertTrue(tracker.press("s1", "ctrl+1"))

    def test_releasing_a_modifier_also_releases_the_combo(self):
        tracker = HoldTracker()
        tracker.press("s1", "Ctrl+Alt+G")
        self.assertEqual(tracker.key_up("left ctrl"), ["s1"])

    def test_unrelated_key_up_does_nothing(self):
        tracker = HoldTracker()
        tracker.press("s1", "ctrl+1")
        self.assertEqual(tracker.key_up("space"), [])
        self.assertTrue(tracker.is_down("s1"))

    def test_one_key_up_releases_every_hotkey_that_uses_it(self):
        tracker = HoldTracker()
        tracker.press("a", "ctrl+1")
        tracker.press("b", "ctrl+2")
        self.assertEqual(sorted(tracker.key_up("ctrl")), ["a", "b"])

    def test_recovers_when_the_release_event_was_missed(self):
        held = {"value": True}
        tracker = HoldTracker(still_held=lambda hotkey: held["value"])
        self.assertTrue(tracker.press("glitch", "ctrl+alt+g"))
        self.assertFalse(tracker.press("glitch", "ctrl+alt+g"), "ainda apertado: repeticao")
        held["value"] = False  # o usuario soltou, mas o evento de soltar se perdeu
        self.assertTrue(tracker.press("glitch", "ctrl+alt+g"), "deve disparar de novo em vez de ficar preso")

    def test_a_failing_still_held_check_counts_as_held(self):
        def broken(_hotkey):
            raise RuntimeError("sem teclado")

        tracker = HoldTracker(still_held=broken)
        self.assertTrue(tracker.press("x", "ctrl+x"))
        self.assertFalse(tracker.press("x", "ctrl+x"))

    def test_clear_returns_everything_that_was_down(self):
        tracker = HoldTracker()
        tracker.press("a", "ctrl+1")
        tracker.press("b", "ctrl+2")
        self.assertEqual(sorted(tracker.clear()), ["a", "b"])
        self.assertFalse(tracker.is_down("a"))


if __name__ == "__main__":
    unittest.main()
