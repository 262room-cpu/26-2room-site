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
        self.assertEqual(rows[0]["query_offset"], 0)
        self.assertEqual(rows[0]["research_round"], 1)

    def test_previous_research_history_survives_queue_rebuild(self):
        previous = [{
            "task_id": "stable-task",
            "candidate_id": "evt-1",
            "status": "FOUND_CANDIDATES_NEEDS_VERIFICATION",
            "reason": "ORGANIZER_IDENTITY_AMBIGUOUS",
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
        self.assertEqual(row["query_offset"], 2)

    def test_successive_runs_rotate_first_query_after_real_worker_pass(self):
        first = build_progressive_organizer_research_queue(
            [self.event()], [self.unresolved()], [], "run-1", "2026-09-10T00:00:00Z"
        )[0]
        first_query = first["search_queries"][0]
        first["status"] = "RESEARCHED_NO_CONTACT"
        first["last_researched_at"] = "2026-09-10T00:01:00Z"
        second = build_progressive_organizer_research_queue(
            [self.event()], [self.unresolved()], [first], "run-2", "2026-09-11T00:00:00Z"
        )[0]
        self.assertNotEqual(second["search_queries"][0], first_query)
        self.assertEqual(second["query_offset"], 2)
        self.assertEqual(second["research_round"], 2)
        self.assertEqual(second["status"], "PENDING_RECHECK")

    def test_unprocessed_pending_batch_does_not_advance(self):
        first = build_progressive_organizer_research_queue(
            [self.event()], [self.unresolved()], [], "run-1", "2026-09-10T00:00:00Z"
        )[0]
        second = build_progressive_organizer_research_queue(
            [self.event()], [self.unresolved()], [first], "run-2", "2026-09-11T00:00:00Z"
        )[0]
        self.assertEqual(second["research_round"], first["research_round"])
        self.assertEqual(second["query_offset"], first["query_offset"])
        self.assertEqual(second["search_queries"][0], first["search_queries"][0])

    def test_deep_research_eventually_checkpoints_for_review(self):
        previous = []
        row = None
        for i in range(20):
            row = build_progressive_organizer_research_queue(
                [self.event()], [self.unresolved()], previous, f"run-{i}", f"2026-09-{10 + (i % 18):02d}T00:00:00Z"
            )[0]
            if row.get("deep_research_exhausted"):
                break
            row["status"] = "RESEARCHED_NO_CONTACT"
            row["last_researched_at"] = "2026-09-10T00:01:00Z"
            previous = [row]
        self.assertIsNotNone(row)
        self.assertTrue(row["deep_research_exhausted"])
        self.assertEqual(row["status"], "DEEP_RESEARCH_EXHAUSTED_NEEDS_REVIEW")
        self.assertEqual(row["escalation_recommended"], "STRONG_MODEL_OR_MANUAL_REVIEW")
        self.assertEqual(row["search_queries"], [])
        final = build_progressive_organizer_research_queue(
            [self.event()], [self.unresolved()], [row], "final", "2026-09-30T00:00:00Z"
        )[0]
        self.assertEqual(final["status"], "DEEP_RESEARCH_EXHAUSTED_NEEDS_REVIEW")
        self.assertEqual(final["search_queries"], [])

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
