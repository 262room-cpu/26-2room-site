import unittest
from race_agent.core import parse_dates, parse_distances, deduplicate, match_score, merge_candidates, infer_registration_status, infer_notice_status, candidate_from_document

class CoreTests(unittest.TestCase):
    def test_ru_date(self):
        self.assertIn("2026-10-03", parse_dates("3 октября 2026"))

    def test_numeric_date(self):
        self.assertIn("2026-09-20", parse_dates("Старт 20.09.2026 в 09:00"))

    def test_distances(self):
        values = parse_distances("42 км 195 м, 21.1 km, 10 км, kids 500 m")
        self.assertIn("42 км", values)
        self.assertIn("21.1 km", values)
        self.assertIn("10 км", values)
        self.assertIn("500 m", values)

    def test_dedupe_same_event(self):
        a = {"name":"Caspian Marathon 2026","date":"2026-10-11","city":"Aktau","source_urls":["https://caspian-marathon.kz/a"],"evidence":[],"confidence":.9}
        b = {"name":"CASPIAN MARATHON","date":"2026-10-11","city":"Aktau","source_urls":["https://caspian-marathon.kz/b"],"evidence":[],"confidence":.8}
        self.assertGreaterEqual(match_score(a,b), .82)
        merged, dup = deduplicate([a,b])
        self.assertEqual(dup, 1)
        self.assertEqual(len(merged), 1)

    def test_conflict_marks_review(self):
        base = {"name":"Race","date":"2026-10-01","source_urls":[],"evidence":[{"field":"date","weight":.8}],"confidence":.8}
        inc = {"name":"Race","date":"2026-10-02","source_urls":["https://official.kz"],"evidence":[{"field":"date","weight":1.0}],"confidence":.95,"last_checked_at":"x"}
        out = merge_candidates(base, inc)
        self.assertEqual(out["status"], "CONFLICT")
        self.assertEqual(out["pipeline_status"], "NEEDS_REVIEW")
        self.assertEqual(out["date"], "2026-10-02")

    def test_historical_change_is_updated_not_conflict(self):
        old = {"name":"Race","date":"2026-10-01","registration_status":"OPEN","source_urls":["https://official.kz/race"],"evidence":[{"field":"date","weight":1.0},{"field":"registration_status","weight":1.0}],"confidence":.95,"conflicts":[],"changes":[]}
        new = {"name":"Race","date":"2026-10-08","registration_status":"CLOSED","source_urls":["https://official.kz/race"],"evidence":[{"field":"date","weight":1.0},{"field":"registration_status","weight":1.0}],"confidence":.95,"last_checked_at":"later"}
        out = merge_candidates(old, new, historical=True)
        self.assertEqual(out["date"], "2026-10-08")
        self.assertEqual(out["registration_status"], "CLOSED")
        self.assertEqual(out["status"], "UPDATED")
        self.assertFalse(out["conflicts"])

    def test_update_match_survives_date_change(self):
        old = {"name":"Qaragandy Half Marathon","date":"2026-08-29","city":"Караганда","source_urls":["https://qhm26.athleticfamily.kz/ru"]}
        new = {"name":"Qaragandy Half Marathon","date":"2026-09-20","city":"Караганда","source_urls":["https://qhm26.athleticfamily.kz/ru"]}
        self.assertGreaterEqual(match_score(old, new), .68)

    def test_registration_and_notice_status(self):
        self.assertEqual(infer_registration_status("Регистрация закрыта"), "CLOSED")
        self.assertEqual(infer_notice_status("Забег перенесён организатором"), "POSTPONED")

    def test_candidate_extracts_city_and_instagram(self):
        raw_html = '<html><title>Test Marathon 2026</title><body>20 сентября 2026 Алматы 10 км <a href="https://instagram.com/test_org">Instagram</a></body></html>'
        c = candidate_from_document("https://example.kz/race", raw_html, "official_event", "now", known_cities=["Алматы"])
        self.assertIsNotNone(c)
        self.assertEqual(c["city"], "Алматы")
        self.assertEqual(c["instagram"], "https://instagram.com/test_org")

if __name__ == "__main__":
    unittest.main()
