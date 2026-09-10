import unittest

from race_agent.organizer_queue import build_progressive_organizer_research_queue


class OrganizerQueueTests(unittest.TestCase):
    def event(self):
        return {
            "candidate_id": "evt-1",
            "name": "Беготня Москва 2027",
            "city": "Москва",
            "country": "Russia",
            "organizer_id": "org-1",
            "official_site": "https://begotnya.ru/event/2027",
            "source_urls": ["https://begotnya.ru/event/2027", "https://instagram.com/begotnya/"],
        }

    def unresolved(self):
        return {
            "organizer_id": "org-1",
            "name": "",
            "identity_status": "UNRESOLVED",
            "contact_status": "NEEDS_IDENTITY_CHECK",
        }

    def test_unknown_identity_searches_event_domain_before_social(self):
        rows = build_progressive_organizer_research_queue(
            [self.event()], [self.unresolved()], [], "run-1", "2026-09-10T00:00:00Z"
        )
        self.assertEqual(len(rows), 1)
        queries = rows[0]["search_queries"]
        self.assertTrue(queries[0].startswith('site:begotnya.ru'))
        self.assertIn('"Беготня Москва 2027"', queries[0])
        self.assertIn("организатор", queries[0])
        self.assertFalse(queries[0].startswith("site:instagram.com"))

    def test_previous_research_history_survives_queue_rebuild(self):
        previous = [{
            "task_id": "stable-task",
            "candidate_id": "evt-1",
            "status": "FOUND_CANDIDATES_NEEDS_VERIFICATION",
            "created_at": "2026-09-01T00:00:00Z",
            "last_researched_at": "2026-09-09T00:00:00Z",
            "search_hits_checked": 12,
            "contacts_promoted": 1,
            "discovered_contact_candidates": ["https://instagram.com/fedor_run/"],
        }]
        rows = build_progressive_organizer_research_queue(
            [self.event()], [self.unresolved()], previous, "run-2", "2026-09-10T00:00:00Z"
        )
        row = rows[0]
        self.assertEqual(row["task_id"], "stable-task")
        self.assertEqual(row["created_at"], "2026-09-01T00:00:00Z")
        self.assertEqual(row["last_researched_at"], "2026-09-09T00:00:00Z")
        self.assertEqual(row["search_hits_checked"], 12)
        self.assertEqual(row["contacts_promoted"], 1)
        self.assertIn("https://instagram.com/fedor_run/", row["discovered_contact_candidates"])

    def test_ready_organizer_does_not_enter_research_queue(self):
        ready = {
            "organizer_id": "org-1",
            "name": "Федор Иванов",
            "identity_status": "NAMED",
            "contact_status": "READY_TO_CONTACT",
        }
        rows = build_progressive_organizer_research_queue(
            [self.event()], [ready], [], "run-1", "2026-09-10T00:00:00Z"
        )
        self.assertEqual(rows, [])

    def test_named_organizer_search_prioritizes_contact_lookup(self):
        named = {
            "organizer_id": "org-1",
            "name": "Федор Иванов",
            "identity_status": "NAMED",
            "contact_status": "CONTACTS_MISSING",
        }
        rows = build_progressive_organizer_research_queue(
            [self.event()], [named], [], "run-1", "2026-09-10T00:00:00Z"
        )
        self.assertIn('"Федор Иванов"', rows[0]["search_queries"][0])
        self.assertTrue(rows[0]["search_queries"][0].startswith("site:begotnya.ru"))


if __name__ == "__main__":
    unittest.main()
