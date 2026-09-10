import unittest

from race_agent.edition_dedup import canonical_score, collapse_same_editions, same_edition


class EditionDedupTests(unittest.TestCase):
    def _caspian_sparse(self):
        return {
            "candidate_id": "sparse",
            "lineage_id": "caspian-lineage",
            "name": "CASPIAN MARATHON",
            "date": "2026-10-11",
            "city": "Актау",
            "country": "Kazakhstan",
            "location": "Актау",
            "official_site": "https://caspian-marathon.kz/ru/calendar",
            "registration_status": "UNKNOWN",
            "distances": [],
            "source_urls": ["https://caspian-marathon.kz/ru/calendar"],
            "evidence": [{"field": "date", "value": "2026-10-11", "weight": 1.0, "url": "https://caspian-marathon.kz/ru/calendar"}],
            "confidence": 0.91,
            "status": "UPDATED",
            "pipeline_status": "READY_FOR_REVIEW",
            "changes": [{"field": "date", "old": "2026-05-28", "new": "2026-10-11"}],
            "conflicts": [],
            "last_checked_at": "2026-09-10T17:04:45+00:00",
        }

    def _caspian_rich(self):
        return {
            "candidate_id": "rich",
            "lineage_id": "caspian-lineage",
            "name": "Caspian Marathon 2026",
            "date": "2026-10-11",
            "city": "Актау",
            "country": "Kazakhstan",
            "location": "площадь Амфитеатр, 15 микрорайон",
            "official_site": "https://caspian-marathon.kz/ru/calendar/?title=event",
            "registration_url": "https://caspian-marathon.kz",
            "registration_status": "OPEN",
            "distances": ["42,195 км", "21,0975 км", "10 км"],
            "source_urls": ["https://caspian-marathon.kz/ru/calendar/?title=event"],
            "evidence": [{"field": "date", "value": "2026-10-11", "weight": 1.0, "url": "https://caspian-marathon.kz/ru/calendar/?title=event"}],
            "confidence": 0.98,
            "status": "CONFLICT",
            "pipeline_status": "NEEDS_REVIEW",
            "changes": [],
            "conflicts": [{"field": "distances", "existing": ["10 км"], "incoming": ["5 км"]}],
            "last_checked_at": "2026-09-10T12:23:53+00:00",
        }

    def test_same_lineage_and_date_is_same_edition(self):
        self.assertTrue(same_edition(self._caspian_sparse(), self._caspian_rich()))

    def test_richer_record_wins_and_conflict_survives(self):
        sparse = self._caspian_sparse()
        rich = self._caspian_rich()
        self.assertGreater(canonical_score(rich), canonical_score(sparse))
        rows, archived = collapse_same_editions([sparse, rich])
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(archived), 1)
        canonical = rows[0]
        self.assertEqual(canonical["candidate_id"], "rich")
        self.assertEqual(canonical["name"], "Caspian Marathon 2026")
        self.assertEqual(canonical["registration_status"], "OPEN")
        self.assertEqual(canonical["distances"], ["42,195 км", "21,0975 км", "10 км"])
        self.assertEqual(canonical["status"], "CONFLICT")
        self.assertEqual(canonical["pipeline_status"], "NEEDS_REVIEW")
        self.assertTrue(canonical["conflicts"])
        self.assertEqual(set(canonical["source_urls"]), {
            "https://caspian-marathon.kz/ru/calendar",
            "https://caspian-marathon.kz/ru/calendar/?title=event",
        })
        self.assertIn("sparse", canonical["merged_candidate_ids"])
        self.assertEqual(archived[0]["duplicate_of_candidate_id"], "rich")

    def test_different_year_or_date_is_not_collapsed(self):
        a = self._caspian_rich()
        b = self._caspian_sparse()
        b["candidate_id"] = "next-year"
        b["date"] = "2027-10-10"
        rows, archived = collapse_same_editions([a, b])
        self.assertEqual(len(rows), 2)
        self.assertEqual(archived, [])

    def test_explicit_different_formats_never_collapse_even_if_lineage_is_corrupt(self):
        base = {
            "lineage_id": "accidentally-shared",
            "date": "2026-09-13",
            "city": "Чолпон-Ата",
            "country": "Kyrgyzstan",
            "source_urls": [],
            "evidence": [],
            "confidence": 0.8,
        }
        relay = {**base, "candidate_id": "relay", "name": "Asia Triathlon Cup AG Relay"}
        standard = {**base, "candidate_id": "standard", "name": "Asia Triathlon Cup AG Standard"}
        self.assertFalse(same_edition(relay, standard))
        rows, archived = collapse_same_editions([relay, standard])
        self.assertEqual(len(rows), 2)
        self.assertEqual(archived, [])


if __name__ == "__main__":
    unittest.main()
