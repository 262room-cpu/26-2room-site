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

    def _base_report(self):
        return {
            "generated_at": "2026-09-10T00:00:00Z",
            "catalog_connected": False,
            "organizer_crm_connected": False,
            "counts": {
                "events_total": 10, "organizers_total": 5, "outreach_ready": 1,
                "unknown_organizers_with_contact_route": 2, "conflicts_or_review": 3,
                "events_not_in_app": None, "events_changed_in_app": None, "possible_app_matches": None,
                "organizers_existing_in_crm": None, "new_organizer_leads": None,
                "possible_organizer_crm_matches": None, "organizer_contact_updates_for_crm": None,
                "crm_can_help_resolve_identity": None,
            },
            "queues": {
                "new_events_not_in_app": [], "app_changes": [], "conflicts_and_review": [],
                "organizers_ready_to_contact": [], "organizer_identity_research": [],
                "new_organizer_leads": [], "possible_organizer_crm_matches": [],
                "organizer_crm_contact_updates": [], "crm_identity_resolution_candidates": [],
            },
        }

    def test_report_never_calls_catalog_items_new_when_catalog_missing(self):
        report = self._base_report()
        md = render_markdown(report)
        self.assertIn("Каталог мобильного 26.2 ROOM ещё не подключён", md)
        self.assertNotIn("Новые относительно приложения: **", md)

    def test_public_report_says_private_organizer_crm_is_not_loaded(self):
        report = self._base_report()
        md = render_markdown(report)
        self.assertIn("Приватная CRM организаторов не подключена", md)
        self.assertNotIn("Новые подтверждённые лиды организаторов: **", md)

    def test_private_organizer_crm_reporting_is_separate_from_app_catalog(self):
        report = self._base_report()
        report["organizer_crm_connected"] = True
        report["counts"].update({
            "organizers_existing_in_crm": 11,
            "new_organizer_leads": 4,
            "possible_organizer_crm_matches": 3,
            "organizer_contact_updates_for_crm": 2,
            "crm_can_help_resolve_identity": 1,
        })
        md = render_markdown(report)
        self.assertIn("Уже есть в CRM организаторов: **11**", md)
        self.assertIn("Новые подтверждённые лиды организаторов: **4**", md)
        self.assertIn("Каталог мобильного 26.2 ROOM ещё не подключён", md)
        self.assertNotIn("Новые относительно приложения: **4**", md)


if __name__ == "__main__":
    unittest.main()
