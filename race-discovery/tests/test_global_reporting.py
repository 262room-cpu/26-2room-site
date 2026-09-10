import unittest

from race_agent.market_runner import _global_organizer_identity
from race_agent.report import render_markdown


class GlobalReportingTests(unittest.TestCase):
    def test_unresolved_global_identity_is_event_scoped(self):
        a = {
            "identity_status": "UNRESOLVED", "name": "", "country": "Russia",
            "event_ids": ["race-a"], "organizer_id": "unknown-a", "contacts": {},
        }
        b = {
            "identity_status": "UNRESOLVED", "name": "", "country": "Russia",
            "event_ids": ["race-b"], "organizer_id": "unknown-b", "contacts": {},
        }
        self.assertNotEqual(_global_organizer_identity(a), _global_organizer_identity(b))

    def test_named_contact_identity_uses_contact_route(self):
        organizer = {
            "identity_status": "NAMED", "name": "Федор Иванов", "country": "Russia",
            "countries": ["Russia"], "contacts": {"instagram": ["https://instagram.com/fedor_run/"]},
        }
        self.assertIn("instagram:", _global_organizer_identity(organizer))

    def test_report_never_calls_catalog_items_new_when_catalog_missing(self):
        report = {
            "generated_at": "2026-09-10T00:00:00Z",
            "catalog_connected": False,
            "counts": {
                "events_total": 10, "organizers_total": 5, "outreach_ready": 1,
                "unknown_organizers_with_contact_route": 2, "conflicts_or_review": 3,
                "events_not_in_app": None, "events_changed_in_app": None, "possible_app_matches": None,
            },
            "queues": {
                "new_events_not_in_app": [], "app_changes": [], "conflicts_and_review": [],
                "organizers_ready_to_contact": [], "organizer_identity_research": [],
            },
        }
        md = render_markdown(report)
        self.assertIn("Каталог мобильного 26.2 ROOM ещё не подключён", md)
        self.assertNotIn("Новые относительно приложения: **", md)


if __name__ == "__main__":
    unittest.main()
