import unittest

from race_agent.organizers import (
    build_organizer_database,
    organizer_lead_from_document,
    organizer_match_score,
)


class OrganizerIdentityGuardTests(unittest.TestCase):
    def _event(self, event_id, name):
        return {
            "candidate_id": event_id,
            "name": name,
            "date": "2026-10-10",
            "city": "Москва",
            "country": "Russia",
            "organizer": "",
            "instagram": "https://www.instagram.com/random_partner/",
            "official_site": "https://race.example/race",
            "source_urls": ["https://race.example/race"],
            "confidence": 0.9,
            "evidence": [],
        }

    def test_random_instagram_never_becomes_organizer_name(self):
        event = self._event("event-a", "Беготня")
        html = '<html><a href="https://www.instagram.com/random_partner/">partner</a></html>'
        lead = organizer_lead_from_document(event, html, "https://race.example/race", "official_event", "2026-09-10T00:00:00Z")
        self.assertIsNotNone(lead)
        self.assertEqual(lead["identity_status"], "UNRESOLVED")
        self.assertEqual(lead["name"], "")
        self.assertIn("Беготня", lead["display_name"])
        self.assertEqual(lead["contacts"]["instagram"], [])
        self.assertIn("https://www.instagram.com/random_partner/", lead["contact_candidates"]["instagram"])

    def test_same_partner_instagram_does_not_merge_two_unknown_organizers(self):
        html = '<html><a href="https://www.instagram.com/sponsor/">sponsor</a></html>'
        first = organizer_lead_from_document(self._event("event-a", "Race A"), html, "https://race.example/a", "official_event", "2026-09-10T00:00:00Z")
        second = organizer_lead_from_document(self._event("event-b", "Race B"), html, "https://race.example/b", "official_event", "2026-09-10T00:00:00Z")
        self.assertNotEqual(first["organizer_id"], second["organizer_id"])
        self.assertEqual(organizer_match_score(first, second), 0.0)

    def test_legacy_provisional_identity_is_not_preserved_as_truth(self):
        event = self._event("event-a", "Беготня")
        previous = [{
            "schema_version": 2,
            "organizer_id": "legacy",
            "name": "random_partner",
            "country": "Russia",
            "event_ids": ["event-a"],
            "identity_status": "PROVISIONAL_IDENTITY",
            "contact_status": "NEEDS_IDENTITY_CHECK",
            "contacts": {"instagram": [], "telegram": [], "whatsapp": [], "email": [], "phone": [], "website": []},
            "contact_candidates": {"instagram": ["https://www.instagram.com/random_partner/"], "telegram": [], "whatsapp": [], "email": [], "phone": [], "website": []},
        }]
        rows = build_organizer_database([event], [], previous, "2026-09-10T00:00:00Z")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["identity_status"], "UNRESOLVED")
        self.assertEqual(rows[0]["name"], "")
        self.assertNotEqual(rows[0]["organizer_id"], "legacy")

    def test_explicit_named_organizer_stays_named(self):
        event = self._event("event-a", "Беготня")
        event["organizer"] = "Федор Иванов"
        rows = build_organizer_database([event], [], [], "2026-09-10T00:00:00Z")
        named = [row for row in rows if row.get("identity_status") == "NAMED"]
        self.assertEqual(len(named), 1)
        self.assertEqual(named[0]["name"], "Федор Иванов")


if __name__ == "__main__":
    unittest.main()
