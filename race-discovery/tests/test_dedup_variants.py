import unittest

from race_agent.core import deduplicate, match_score
from race_agent.dedup_guard import (
    event_variants,
    incompatible_event_variants,
    purge_incompatible_variant_evidence,
)


class RaceVariantDedupTests(unittest.TestCase):
    def _row(self, name):
        return {
            "name": name,
            "date": "2026-09-13",
            "city": "Чолпон-Ата",
            "country": "Kyrgyzstan",
            "source_urls": ["https://triathlon.kg/events/example"],
            "evidence": [],
            "confidence": 0.87,
            "changes": [],
            "conflicts": [],
        }

    def test_super_sprint_does_not_also_report_plain_sprint(self):
        self.assertEqual(event_variants("Asia Triathlon Cup AG Super Sprint"), {"super_sprint"})

    def test_explicitly_different_formats_are_incompatible(self):
        super_sprint = self._row("2026 VISA Asia Triathlon Cup Cholpon-Ata AG Super Sprint")
        relay = self._row("2026 VISA Asia Triathlon Cup Cholpon-Ata AG Relay")
        standard = self._row("2026 VISA Asia Triathlon Cup Cholpon-Ata AG Standard")
        self.assertTrue(incompatible_event_variants(super_sprint, relay))
        self.assertTrue(incompatible_event_variants(relay, standard))
        self.assertLess(match_score(super_sprint, relay), 0.68)
        self.assertLess(match_score(relay, standard), 0.68)

    def test_same_day_same_domain_three_formats_remain_three_events(self):
        rows = [
            self._row("2026 VISA Asia Triathlon Cup Cholpon-Ata AG Super Sprint"),
            self._row("2026 VISA Asia Triathlon Cup Cholpon-Ata AG Relay"),
            self._row("2026 VISA Asia Triathlon Cup Cholpon-Ata AG Standard"),
        ]
        merged, duplicates = deduplicate(rows)
        self.assertEqual(duplicates, 0)
        self.assertEqual(len(merged), 3)

    def test_generic_edition_still_merges_with_year_suffix(self):
        a = {
            "name": "Caspian Marathon 2026",
            "date": "2026-10-11",
            "city": "Актау",
            "country": "Kazakhstan",
            "source_urls": ["https://caspian-marathon.kz/event"],
            "evidence": [],
            "confidence": 0.98,
            "changes": [],
            "conflicts": [],
        }
        b = {
            "name": "CASPIAN MARATHON",
            "date": "2026-10-11",
            "city": "Актау",
            "country": "Kazakhstan",
            "source_urls": ["https://caspian-marathon.kz/calendar"],
            "evidence": [],
            "confidence": 0.91,
            "changes": [],
            "conflicts": [],
        }
        self.assertFalse(incompatible_event_variants(a, b))
        self.assertGreaterEqual(match_score(a, b), 0.82)
        merged, duplicates = deduplicate([a, b])
        self.assertEqual(duplicates, 1)
        self.assertEqual(len(merged), 1)

    def test_old_super_sprint_record_drops_relay_and_standard_evidence(self):
        super_url = "https://triathlon.kg/events/ag-super-sprint"
        relay_url = "https://triathlon.kg/events/ag-relay"
        standard_url = "https://triathlon.kg/events/ag-standard"
        row = {
            "name": "2026 VISA Asia Triathlon Cup Cholpon-Ata AG Super Sprint",
            "source_urls": [super_url, relay_url, standard_url],
            "evidence": [
                {"field": "name", "value": "2026 VISA Asia Triathlon Cup Cholpon-Ata AG Super Sprint", "url": super_url},
                {"field": "date", "value": "2026-09-13", "url": super_url},
                {"field": "name", "value": "2026 VISA Asia Triathlon Cup Cholpon-Ata AG Relay", "url": relay_url},
                {"field": "distances", "value": ["40 км"], "url": relay_url},
                {"field": "name", "value": "2026 VISA Asia Triathlon Cup Cholpon-Ata AG Standard", "url": standard_url},
                {"field": "distances", "value": ["40 км", "10 км"], "url": standard_url},
            ],
        }
        cleaned, removed, blocked = purge_incompatible_variant_evidence(row)
        self.assertEqual(set(blocked), {relay_url, standard_url})
        self.assertEqual(removed, 4)
        self.assertEqual(cleaned["source_urls"], [super_url])
        self.assertTrue(all(e["url"] == super_url for e in cleaned["evidence"]))
        self.assertEqual(set(cleaned["sanitized_variant_sources"]), {relay_url, standard_url})

    def test_historical_sanitized_sources_clear_false_conflicts_and_restore_status(self):
        super_url = "https://triathlon.kg/events/ag-super-sprint"
        relay_url = "https://triathlon.kg/events/ag-relay"
        standard_url = "https://triathlon.kg/events/ag-standard"
        row = {
            "name": "2026 VISA Asia Triathlon Cup Cholpon-Ata AG Super Sprint",
            "source_urls": [super_url],
            "evidence": [
                {"field": "name", "value": "2026 VISA Asia Triathlon Cup Cholpon-Ata AG Super Sprint", "url": super_url},
            ],
            "confidence": 0.87,
            "status": "CONFLICT",
            "pipeline_status": "NEEDS_REVIEW",
            "changes": [],
            "conflicts": [
                {"field": "name", "incoming": "2026 VISA Asia Triathlon Cup Cholpon-Ata AG Relay", "incoming_sources": [relay_url]},
                {"field": "distances", "incoming": ["40 км"], "incoming_sources": [relay_url]},
                {"field": "name", "incoming": "2026 VISA Asia Triathlon Cup Cholpon-Ata AG Standard", "incoming_sources": [standard_url]},
            ],
            "sanitized_variant_sources": [relay_url, standard_url],
        }

        cleaned, removed, blocked = purge_incompatible_variant_evidence(row)
        self.assertEqual(removed, 0)
        self.assertEqual(set(blocked), {relay_url, standard_url})
        self.assertEqual(cleaned["conflicts"], [])
        self.assertEqual(cleaned["status"], "NEW")
        self.assertEqual(cleaned["pipeline_status"], "DISCOVERED")

        again, removed_again, blocked_again = purge_incompatible_variant_evidence(cleaned)
        self.assertEqual(again, cleaned)
        self.assertEqual(removed_again, 0)
        self.assertEqual(blocked_again, [])


if __name__ == "__main__":
    unittest.main()
