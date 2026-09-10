import unittest

from race_agent.core import deduplicate, match_score
from race_agent.dedup_guard import event_variants, incompatible_event_variants


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


if __name__ == "__main__":
    unittest.main()
