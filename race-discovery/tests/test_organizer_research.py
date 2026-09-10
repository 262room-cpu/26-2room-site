import unittest
from unittest.mock import patch

from race_agent.organizer_research import (
    _refresh_contact_status,
    apply_official_web_hit,
    apply_social_hit,
    relation_score,
)
from race_agent.providers import SearchHit


EMPTY = {"instagram": [], "telegram": [], "whatsapp": [], "email": [], "phone": [], "website": []}


class OrganizerResearchTests(unittest.TestCase):
    def setUp(self):
        self.event = {
            "candidate_id": "evt1", "name": "Беготня Москва 2027", "city": "Москва", "country": "Russia",
            "organizer": "",
            "source_urls": ["https://begotnya.ru/event/2027"],
            "official_site": "https://begotnya.ru/event/2027",
        }
        self.profile = {
            "schema_version": 3,
            "organizer_id": "unknown-event-scoped",
            "name": "Федор Иванов",
            "identity_status": "NAMED",
            "contacts": {k: list(v) for k, v in EMPTY.items()},
            "contact_candidates": {**{k: list(v) for k, v in EMPTY.items()}, "instagram": ["https://www.instagram.com/fedor_run/"]},
            "evidence": [{
                "field": "instagram", "value": "https://www.instagram.com/fedor_run/",
                "url": "https://begotnya.ru/event/2027", "source_type": "official_event",
                "association": "UNCONFIRMED_ORGANIZER_RELATION",
            }],
        }

    def _unknown_profile(self):
        return {
            "schema_version": 3,
            "organizer_id": "unknown-event-scoped",
            "name": "",
            "display_name": "Неустановленный организатор — Беготня Москва 2027",
            "identity_status": "UNRESOLVED",
            "identity_source": "EVENT_SCOPED_UNKNOWN",
            "contacts": {k: list(v) for k, v in EMPTY.items()},
            "contact_candidates": {k: list(v) for k, v in EMPTY.items()},
            "evidence": [],
            "contact_status": "NEEDS_IDENTITY_CHECK",
            "confidence": 0.55,
        }

    def test_exact_event_and_organizer_social_hit_scores_high(self):
        hit = SearchHit(
            "Беготня Москва 2027 — организатор Федор Иванов",
            "https://instagram.com/fedor_run",
            "Официальная страница забега",
        )
        self.assertGreaterEqual(relation_score(hit, self.event, self.profile), 0.72)

    def test_search_corroboration_promotes_official_event_social_candidate(self):
        hit = SearchHit(
            "Беготня Москва 2027 — Федор Иванов",
            "https://instagram.com/fedor_run",
            "Организатор забега",
        )
        added, promoted, _ = apply_social_hit(self.profile, self.event, hit, "2026-09-10T00:00:00Z")
        self.assertTrue(added)
        self.assertTrue(promoted)
        self.assertIn("https://www.instagram.com/fedor_run/", self.profile["contacts"]["instagram"])

    def test_unrelated_social_profile_is_rejected(self):
        hit = SearchHit("Coffee shop Moscow", "https://instagram.com/cafe_random", "Завтра скидка на кофе")
        added, promoted, score = apply_social_hit(self.profile, self.event, hit, "2026-09-10T00:00:00Z")
        self.assertFalse(added)
        self.assertFalse(promoted)
        self.assertLess(score, 0.58)

    def test_primary_jsonld_can_resolve_unknown_organizer_identity(self):
        profile = self._unknown_profile()
        raw = '''
        <html><body><h1>Беготня Москва 2027</h1>
        <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Event","name":"Беготня Москва 2027",
         "startDate":"2027-05-15","organizer":{"@type":"Person","name":"Федор Иванов",
         "url":"https://www.instagram.com/fedor_run/"}}
        </script>
        </body></html>
        '''
        hit = SearchHit("Беготня Москва 2027 — организатор", "https://begotnya.ru/event/2027", "Федор Иванов")
        cfg = {"source_hints": {"begotnya.ru": "official_event"}}
        with patch("race_agent.organizer_research.fetch_url", return_value=raw):
            used, promoted, resolved = apply_official_web_hit(profile, self.event, hit, cfg, "2026-09-10T00:00:00Z")
        self.assertTrue(used)
        self.assertTrue(resolved)
        self.assertEqual(profile["identity_status"], "NAMED")
        self.assertEqual(profile["name"], "Федор Иванов")
        self.assertEqual(self.event["organizer"], "Федор Иванов")
        self.assertIn("https://www.instagram.com/fedor_run/", profile["contacts"]["instagram"])

    def test_social_search_alone_never_resolves_unknown_identity(self):
        profile = self._unknown_profile()
        hit = SearchHit("Беготня Москва 2027", "https://instagram.com/fedor_run", "Организатор Федор")
        added, promoted, _ = apply_social_hit(profile, self.event, hit, "2026-09-10T00:00:00Z")
        self.assertTrue(added)
        self.assertFalse(promoted)
        self.assertEqual(profile["identity_status"], "UNRESOLVED")
        self.assertEqual(profile["name"], "")

    def test_primary_email_route_does_not_invent_identity(self):
        profile = self._unknown_profile()
        raw = '''
        <html><body><h1>Беготня Москва 2027</h1>
        Связаться с командой: <a href="mailto:hello@begotnya.ru">hello@begotnya.ru</a>
        </body></html>
        '''
        hit = SearchHit("Беготня Москва 2027 контакты", "https://begotnya.ru/event/2027", "hello@begotnya.ru")
        cfg = {"source_hints": {"begotnya.ru": "official_event"}}
        with patch("race_agent.organizer_research.fetch_url", return_value=raw):
            used, promoted, resolved = apply_official_web_hit(profile, self.event, hit, cfg, "2026-09-10T00:00:00Z")
        self.assertTrue(used)
        self.assertFalse(resolved)
        self.assertGreaterEqual(promoted, 1)
        self.assertIn("hello@begotnya.ru", profile["contacts"]["email"])
        _refresh_contact_status(profile)
        self.assertEqual(profile["identity_status"], "UNRESOLVED")
        self.assertEqual(profile["contact_status"], "CONTACT_ROUTE_FOUND_IDENTITY_PENDING")


if __name__ == "__main__":
    unittest.main()
