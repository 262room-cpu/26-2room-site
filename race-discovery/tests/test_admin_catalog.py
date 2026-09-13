import pathlib
import tempfile
import unittest

from race_agent.admin_catalog import extract_rows
from race_agent.catalog import normalize_catalog_row
from race_agent.catalog_snapshot import decode_snapshot_text, import_snapshot


class AdminCatalogTests(unittest.TestCase):
    def test_extracts_common_admin_shapes(self):
        rows = extract_rows({"data": {"events": [{"id": "1", "title": "Test Run"}]}})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "Test Run")

    def test_extracts_explicit_nested_path(self):
        rows = extract_rows({"payload": {"catalog": {"items": [{"id": "2"}]}}}, "payload.catalog.items")
        self.assertEqual(rows, [{"id": "2"}])

    def test_snapshot_import_accepts_csv(self):
        text = "id,title,date,city\napp-1,Caspian Marathon,2026-10-11,Aktau\n"
        rows = decode_snapshot_text(text, ".csv")
        self.assertEqual(rows[0]["id"], "app-1")
        normalized = normalize_catalog_row(rows[0])
        self.assertEqual(normalized["name"], "Caspian Marathon")
        self.assertEqual(normalized["date"], "2026-10-11")

    def test_snapshot_import_writes_jsonl(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = pathlib.Path(tmp) / "events.json"
            output = pathlib.Path(tmp) / "snapshot.jsonl"
            source.write_text('[{"id":"x","eventName":"Road Race","startDate":"2026-09-20"}]', encoding="utf-8")
            count = import_snapshot(source, output)
            self.assertEqual(count, 1)
            self.assertIn('"eventName": "Road Race"', output.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
