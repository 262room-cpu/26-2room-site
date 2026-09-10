import unittest

from race_agent.provenance import compact_evidence


class ProvenanceTests(unittest.TestCase):
    def test_identical_rechecks_collapse_and_keep_time_range(self):
        rows = [
            {
                "field": "date", "value": "2026-09-27", "url": "https://race.kz/event",
                "source_type": "official_event", "content_hash": "abc", "weight": 1.0,
                "observed_at": "2026-09-01T00:00:00Z",
            },
            {
                "field": "date", "value": "2026-09-27", "url": "https://race.kz/event",
                "source_type": "official_event", "content_hash": "abc", "weight": 1.0,
                "observed_at": "2026-09-10T00:00:00Z",
            },
        ]
        out = compact_evidence(rows)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["first_observed_at"], "2026-09-01T00:00:00Z")
        self.assertEqual(out[0]["last_observed_at"], "2026-09-10T00:00:00Z")

    def test_changed_content_hash_remains_separate_evidence(self):
        rows = [
            {"field":"date","value":"2026-09-27","url":"https://race.kz","source_type":"official_event","content_hash":"old","observed_at":"2026-09-01"},
            {"field":"date","value":"2026-09-27","url":"https://race.kz","source_type":"official_event","content_hash":"new","observed_at":"2026-09-10"},
        ]
        self.assertEqual(len(compact_evidence(rows)), 2)

    def test_conflicting_values_are_never_collapsed(self):
        rows = [
            {"field":"date","value":"2026-09-25","url":"https://race.kz","source_type":"official_event","content_hash":"a","observed_at":"2026-09-01"},
            {"field":"date","value":"2026-09-27","url":"https://race.kz","source_type":"official_event","content_hash":"a","observed_at":"2026-09-01"},
        ]
        self.assertEqual(len(compact_evidence(rows)), 2)

    def test_different_sources_remain_separate(self):
        rows = [
            {"field":"date","value":"2026-09-27","url":"https://official.kz","source_type":"official_event","content_hash":"a","observed_at":"2026-09-01"},
            {"field":"date","value":"2026-09-27","url":"https://news.kz","source_type":"secondary","content_hash":"a","observed_at":"2026-09-01"},
        ]
        self.assertEqual(len(compact_evidence(rows)), 2)


if __name__ == "__main__":
    unittest.main()
