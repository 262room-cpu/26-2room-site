import json
import os
import pathlib
import tempfile
import unittest
from unittest import mock

from race_agent.catalog import load_catalog
from race_agent.firebase_catalog import decode_document, fetch_catalog


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self, _limit=-1):
        return json.dumps(self.payload).encode("utf-8")


class FirestoreCatalogTests(unittest.TestCase):
    def test_decode_document_converts_firestore_typed_values(self):
        doc = {
            "name": "projects/demo/databases/(default)/documents/events/abc123",
            "fields": {
                "name": {"stringValue": "Almaty Marathon"},
                "date": {"timestampValue": "2026-09-27T03:00:00Z"},
                "active": {"booleanValue": True},
                "capacity": {"integerValue": "5000"},
                "distances": {"arrayValue": {"values": [
                    {"stringValue": "42.2 km"}, {"stringValue": "21.1 km"}
                ]}},
                "venue": {"mapValue": {"fields": {
                    "city": {"stringValue": "Almaty"}
                }}},
            },
        }
        row = decode_document(doc)
        self.assertEqual(row["id"], "abc123")
        self.assertEqual(row["name"], "Almaty Marathon")
        self.assertEqual(row["capacity"], 5000)
        self.assertEqual(row["distances"], ["42.2 km", "21.1 km"])
        self.assertEqual(row["venue"]["city"], "Almaty")

    def test_fetch_catalog_uses_get_only_and_paginates(self):
        first = {
            "documents": [{
                "name": "projects/demo/databases/(default)/documents/events/one",
                "fields": {"name": {"stringValue": "Race One"}},
            }],
            "nextPageToken": "next-token",
        }
        second = {
            "documents": [{
                "name": "projects/demo/databases/(default)/documents/events/two",
                "fields": {"name": {"stringValue": "Race Two"}},
            }]
        }
        requests = []

        def fake_urlopen(request, timeout=0):
            requests.append((request, timeout))
            return _Response(first if len(requests) == 1 else second)

        with mock.patch("race_agent.firebase_catalog.urllib.request.urlopen", side_effect=fake_urlopen):
            rows = fetch_catalog(
                "room26-2app", "events", bearer_token="read-only-token", api_key="public-api-key"
            )

        self.assertEqual([row["id"] for row in rows], ["one", "two"])
        self.assertEqual(len(requests), 2)
        for request, timeout in requests:
            self.assertEqual(request.get_method(), "GET")
            self.assertEqual(request.headers.get("Authorization"), "Bearer read-only-token")
            self.assertGreater(timeout, 0)
        self.assertIn("pageToken=next-token", requests[1][0].full_url)

    def test_catalog_fails_open_when_firestore_read_is_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {
                "FIRESTORE_CATALOG_PROJECT": "room26-2app",
                "FIRESTORE_CATALOG_COLLECTION": "events",
            }
            with mock.patch.dict(os.environ, env, clear=False):
                with mock.patch("race_agent.catalog.load_firestore_catalog", side_effect=RuntimeError("denied")):
                    rows, source = load_catalog(pathlib.Path(tmp))
        self.assertEqual(rows, [])
        self.assertEqual(source, "FIRESTORE_UNAVAILABLE:RuntimeError")


if __name__ == "__main__":
    unittest.main()
