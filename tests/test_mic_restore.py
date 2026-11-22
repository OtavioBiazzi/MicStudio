import unittest

from micfudiddo.mic_restore import Endpoint, describe_defaults, is_virtual_name, pick_restore_target, read_saved_defaults

CABLE = Endpoint("{cable}", "CABLE Output (VB-Audio Virtual Cable)")
JBL_NEW = Endpoint("{jbl-novo}", "Microfone (JBL Quantum810 Wireless)")
FIFINE = Endpoint("{fifine}", "Microfone (FIFINE Microphone)")


class MicRestoreTests(unittest.TestCase):
    def test_id_that_disappeared_is_found_by_name(self):
        # o id antigo do JBL sumiu (era o "Elemento nao encontrado"), mas o nome continua igual
        target = pick_restore_target([CABLE, JBL_NEW, FIFINE], wanted_id="{jbl-antigo}", wanted_name="Microfone (JBL Quantum810 Wireless)")
        self.assertEqual(target, JBL_NEW)

    def test_same_id_wins_when_it_still_exists(self):
        self.assertEqual(pick_restore_target([CABLE, JBL_NEW, FIFINE], wanted_id="{fifine}", wanted_name="outro"), FIFINE)

    def test_never_restores_the_cable_itself(self):
        self.assertIsNone(pick_restore_target([CABLE], wanted_id="{cable}", wanted_name="CABLE Output (VB-Audio Virtual Cable)"))
        self.assertTrue(is_virtual_name(CABLE.name))

    def test_uses_the_app_microphone_as_last_resort(self):
        target = pick_restore_target([CABLE, JBL_NEW, FIFINE], wanted_id="{sumiu}", wanted_name="", fallback_names=["FIFINE"])
        self.assertEqual(target, FIFINE)

    def test_cable_is_not_saved_as_the_original_microphone(self):
        saved = describe_defaults({0: "{cable}", 1: "{jbl-novo}", 2: "{cable}"}, [CABLE, JBL_NEW])
        self.assertEqual(saved, {"ids": {"1": "{jbl-novo}"}, "names": {"1": "Microfone (JBL Quantum810 Wireless)"}})

    def test_reads_old_and_new_safety_files(self):
        self.assertEqual(read_saved_defaults({"0": "{a}", "1": "{a}"}), ({0: "{a}", 1: "{a}"}, {}))
        self.assertEqual(read_saved_defaults({"ids": {"0": "{a}"}, "names": {"0": "Mic A"}}), ({0: "{a}"}, {0: "Mic A"}))
        self.assertEqual(read_saved_defaults("lixo"), ({}, {}))


if __name__ == "__main__":
    unittest.main()
