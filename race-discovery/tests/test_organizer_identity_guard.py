import unittest

from race_agent.organizers import (
    build_organizer_database,
    organizer_lead_from_document,
    organizer_match_score,
)


EMPTY = {"instagram": [], "telegram": [], "whatsapp": [], "email": [], "phone": [], "website": []}


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
            "contacts": dict(EMPTY),
            "contact_candidates": {**EMPTY, "instagram": ["https://www.instagram.com/random_partner/"]},
        }]
        rows = build_organizer_database([event], [], previous, "2026-09-10T00:00:00Z")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["identity_status"], "UNRESOLVED")
        self.assertEqual(rows[0]["name"], "")
        self.assertNotEqual(rows[0]["organizer_id"], "legacy")

    def test_safe_unresolved_research_survives_next_discovery_run(self):
        event = self._event("event-a", "Беготня")
        previous = [{
            "schema_version": 3,
            "organizer_id": "safe-unknown",
            "name": "",
            "display_name": "Неустановленный организатор — Беготня",
            "country": "Russia",
            "cities": ["Москва"],
            "event_ids": ["event-a"],
            "identity_status": "UNRESOLVED",
            "identity_source": "EVENT_SCOPED_UNKNOWN",
            "contact_status": "CONTACT_ROUTE_FOUND_IDENTITY_PENDING",
            "contacts": {**EMPTY, "email": ["hello@begotnya.ru"]},
            "contact_candidates": {**EMPTY, "instagram": ["https://www.instagram.com/begotnya/"]},
            "source_urls": ["https://begotnya.ru"],
            "evidence": [{"field": "contact.email", "value": "hello@begotnya.ru"}],
            "first_seen_at": "2026-09-01T00:00:00Z",
            "last_seen_at": "2026-09-09T00:00:00Z",
            "crm_status": "NEW_LEAD",
            "last_contacted_at": "",
            "notes": "",
        }]
        rows = build_organizer_database([event], [], previous, "2026-09-10T00:00:00Z")
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["identity_status"], "UNRESOLVED")
        self.assertIn("hello@begotnya.ru", row["contacts"]["email"])
        self.assertIn("https://www.instagram.com/begotnya/", row["contact_candidates"]["instagram"])
        self.assertEqual(row["contact_status"], "CONTACT_ROUTE_FOUND_IDENTITY_PENDING")
        self.assertEqual(row["first_seen_at"], "2026-09-01T00:00:00Z")

    def test_explicit_named_organizer_stays_named(self):
        event = self._event("event-a", "Беготня")
        event["organizer"] = "Федор Иванов"
        rows = build_organizer_database([event], [], [], "2026-09-10T00:00:00Z")
        named = [row for row in rows if row.get("identity_status") == "NAMED"]
        self.assertEqual(len(named), 1)
        self.assertEqual(named[0]["name"], "Федор Иванов")


if __name__ == "__main__":
    unittest.main()
