import json
import os
import pathlib
import tempfile
import unittest
from unittest import mock

from race_agent.catalog import load_catalog
from race_agent.supabase_catalog import fetch_catalog


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self, _limit=-1):
        return json.dumps(self.payload).encode("utf-8")


class SupabaseCatalogTests(unittest.TestCase):
    def test_fetch_catalog_is_get_only_and_uses_publishable_key(self):
        requests = []

        def fake_urlopen(request, timeout=0):
            requests.append((request, timeout))
            return _Response([
                {"id": "1", "name": "Race One"},
                {"id": "2", "name": "Race Two"},
            ])

        with mock.patch("race_agent.supabase_catalog.urllib.request.urlopen", side_effect=fake_urlopen):
            rows = fetch_catalog(
                "https://demo.supabase.co",
                "anon-public-key",
                resource="events_with_stats",
            )

        self.assertEqual(len(rows), 2)
        self.assertEqual(len(requests), 1)
        request, timeout = requests[0]
        self.assertEqual(request.get_method(), "GET")
        self.assertIn("/rest/v1/events_with_stats?select=*", request.full_url)
        self.assertEqual(request.headers.get("Apikey"), "anon-public-key")
        self.assertEqual(request.headers.get("Authorization"), "Bearer anon-public-key")
        self.assertEqual(request.headers.get("Range"), "0-999")
        self.assertGreater(timeout, 0)

    def test_catalog_prefers_supabase_when_configured(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {
                "APP_SUPABASE_URL": "https://demo.supabase.co",
                "APP_SUPABASE_ANON_KEY": "anon-public-key",
                "APP_SUPABASE_EVENTS_RESOURCE": "events_with_stats",
            }
            with mock.patch.dict(os.environ, env, clear=False):
                with mock.patch(
                    "race_agent.catalog.load_supabase_catalog",
                    return_value=([{"id": "app1", "name": "Almaty Marathon", "date": "2026-09-27", "city": "Алматы"}], "SUPABASE:demo.supabase.co/events_with_stats"),
                ):
                    rows, source = load_catalog(pathlib.Path(tmp))

        self.assertEqual(source, "SUPABASE:demo.supabase.co/events_with_stats")
        self.assertEqual(rows[0]["app_event_id"], "app1")
        self.assertEqual(rows[0]["name"], "Almaty Marathon")

    def test_supabase_failure_falls_back_to_local_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime = pathlib.Path(tmp)
            (runtime / "app_catalog_snapshot.jsonl").write_text(
                json.dumps({"id": "snap1", "name": "Snapshot Race"}, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            env = {
                "APP_SUPABASE_URL": "https://demo.supabase.co",
                "APP_SUPABASE_ANON_KEY": "anon-public-key",
            }
            with mock.patch.dict(os.environ, env, clear=False):
                with mock.patch("race_agent.catalog.load_supabase_catalog", side_effect=RuntimeError("denied")):
                    rows, source = load_catalog(runtime)

        self.assertEqual(rows[0]["app_event_id"], "snap1")
        self.assertEqual(source, "SUPABASE_UNAVAILABLE:RuntimeError->LOCAL_SNAPSHOT")


if __name__ == "__main__":
    unittest.main()
