import unittest

import numpy as np

from micfudiddo.engine import AudioEngine


def tone(frames=4800):
    return np.ones(frames, dtype=np.float32) * 0.1


class MultiPlaybackTests(unittest.TestCase):
    def test_several_sounds_play_together(self):
        engine = AudioEngine()
        for name in ("a", "b", "c"):
            engine.play_sound(tone(), sound_id=name, replace=False)
        ids = sorted(p["soundId"] for p in engine.player_states())
        self.assertEqual(ids, ["a", "b", "c"])

    def test_stopping_one_sound_keeps_the_others(self):
        engine = AudioEngine()
        for name in ("a", "b", "c"):
            engine.play_sound(tone(), sound_id=name, replace=False)
        engine.stop_sound(sound_id="b")
        ids = sorted(p["soundId"] for p in engine.player_states())
        self.assertEqual(ids, ["a", "c"])

    def test_pausing_one_sound_does_not_pause_the_others(self):
        engine = AudioEngine()
        for name in ("a", "b"):
            engine.play_sound(tone(), sound_id=name, replace=False)
        engine.pause_sound(sound_id="a")
        states = {p["soundId"]: p["state"] for p in engine.player_states()}
        self.assertEqual(states["a"], "paused")
        self.assertEqual(states["b"], "playing")
        engine.resume_sound(sound_id="a")
        states = {p["soundId"]: p["state"] for p in engine.player_states()}
        self.assertEqual(states["a"], "playing")

    def test_single_mode_replaces_previous_sound(self):
        engine = AudioEngine()
        engine.play_sound(tone(), sound_id="a", replace=True)
        engine.play_sound(tone(), sound_id="b", replace=True)
        ids = [p["soundId"] for p in engine.player_states()]
        self.assertEqual(ids, ["b"])

    def test_same_sound_twice_can_overlap(self):
        engine = AudioEngine()
        engine.play_sound(tone(), sound_id="a", replace=False)
        engine.play_sound(tone(), sound_id="a", replace=False)
        self.assertEqual(len(engine.player_states()), 2)

    def test_stop_all_clears_everything(self):
        engine = AudioEngine()
        for name in ("a", "b", "c"):
            engine.play_sound(tone(), sound_id=name, replace=False)
        engine.stop_sounds()
        self.assertEqual(engine.player_states(), [])


if __name__ == "__main__":
    unittest.main()
