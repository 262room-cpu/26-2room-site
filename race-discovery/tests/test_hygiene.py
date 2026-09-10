import unittest

from race_agent.hygiene import artifact_reason


class CandidateHygieneTests(unittest.TestCase):
    def test_css_title_is_quarantined(self):
        row = {
            "name": "race-card { border-left: 4px solid var(--color-primary); }",
            "source_urls": ["https://reg.elordasport.kz/ru/"],
        }
        self.assertEqual(artifact_reason(row), "CSS_OR_TEMPLATE_AS_EVENT_TITLE")

    def test_json_schema_fragment_is_quarantined(self):
        row = {
            "name": 'org", "@type": "WebSite", "name": "Triathlon", "url": "https://www.example.kg"',
            "source_urls": ["https://triathlon.example.kg/"],
        }
        self.assertEqual(artifact_reason(row), "JSON_OR_SCHEMA_FRAGMENT_AS_EVENT_TITLE")

    def test_calendar_page_serialized_as_event_is_quarantined(self):
        row = {
            "name": "Tengriseries",
            "source_urls": ["https://athletex.kz/competitions/calendar"],
            "distances": ["5 km", "10 km", "21 km", "42 km"],
        }
        self.assertEqual(artifact_reason(row), "CALENDAR_PAGE_SERIALIZED_AS_EVENT")

    def test_specific_event_calendar_lead_is_preserved(self):
        row = {
            "name": "Salomon Trail 2026",
            "source_urls": ["https://athletex.kz/competitions/calendar"],
            "distances": [],
            "status": "NEW",
        }
        self.assertEqual(artifact_reason(row), "")

    def test_organizer_homepage_aggregate_is_quarantined(self):
        row = {
            "name": "Беговое сообщество",
            "source_urls": ["https://runc.run/"],
            "distances": ["400 м", "800 м", "5 км", "10 км", "21,1 км", "42,2 км"],
        }
        self.assertEqual(artifact_reason(row), "ORGANIZER_HOMEPAGE_SERIALIZED_AS_EVENT")

    def test_kids_series_parent_is_quarantined_but_specific_kids_event_is_kept(self):
        parent = {
            "name": "Детские забеги",
            "source_urls": ["https://kids.runc.run/"],
            "distances": ["400 м", "800 м"],
        }
        child = {
            "name": "Детский забег на Московском марафоне 2026",
            "source_urls": ["https://kids.runc.run/moscow-marathon-2026"],
            "distances": ["400 м", "800 м"],
        }
        self.assertEqual(artifact_reason(parent), "SERIES_LANDING_PAGE_SERIALIZED_AS_SINGLE_EVENT")
        self.assertEqual(artifact_reason(child), "")

    def test_ancillary_program_item_without_distance_is_quarantined(self):
        row = {
            "name": "Pasta Party",
            "source_urls": ["https://almaty-marathon.kz/ru/events/pasta_party/"],
            "distances": [],
        }
        self.assertEqual(artifact_reason(row), "ANCILLARY_PROGRAM_ITEM_NOT_RACE")

    def test_real_event_with_calendar_as_secondary_evidence_is_not_quarantined(self):
        row = {
            "name": "Salomon Trail 2026",
            "source_urls": [
                "https://example.kz/events/salomon-trail-2026",
                "https://example.kz/events/calendar",
            ],
        }
        self.assertEqual(artifact_reason(row), "")

    def test_real_single_event_landing_page_is_not_quarantined(self):
        row = {
            "name": "Yerevan Marathon 2026",
            "source_urls": ["https://armenia.example/"],
        }
        self.assertEqual(artifact_reason(row), "")


if __name__ == "__main__":
    unittest.main()
