import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from micfudiddo.storage import atomic_write_json, load_json_with_backup


class StorageTests(unittest.TestCase):
    def test_atomic_write_keeps_a_valid_backup(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            atomic_write_json(path, {"value": 1})
            atomic_write_json(path, {"value": 2})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"value": 2})
            self.assertEqual(json.loads((Path(str(path) + ".bak")).read_text(encoding="utf-8")), {"value": 1})

    def test_corrupt_primary_recovers_from_backup(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "profile.json"
            atomic_write_json(path, {"gain": 2.5})
            path.write_text('{"gain":', encoding="utf-8")
            recovered = load_json_with_backup(path, {}, dict)
            self.assertEqual(recovered, {"gain": 2.5})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"gain": 2.5})

    def test_wrong_primary_type_uses_backup(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "soundboard.json"
            atomic_write_json(path, [{"id": "saved"}])
            path.write_text("{}", encoding="utf-8")
            recovered = load_json_with_backup(path, [], list)
            self.assertEqual(recovered, [{"id": "saved"}])


if __name__ == "__main__":
    unittest.main()
