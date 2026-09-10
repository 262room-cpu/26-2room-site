import unittest
from race_agent.catalog import annotate_against_catalog, normalize_catalog_row
from race_agent.providers import SearchHit
from race_agent.signals import accept_hit, relevance_score, should_fetch_direct

CFG = {
    "cities": ["Алматы", "Астана", "Караганда"],
    "event_terms": ["марафон", "забег", "trail", "триатлон", "гонка с препятствиями"],
    "source_hints": {"athletex.kz": "registration"},
}

class SignalAndCatalogTests(unittest.TestCase):
    def test_rejects_obvious_web_noise(self):
        hit = SearchHit("Best Forex Brokers 2026", "https://compareforexbrokers.com/us/usa/", "Compare brokers")
        self.assertEqual(relevance_score(hit, CFG), 0.0)
        self.assertFalse(accept_hit(hit, CFG))

    def test_accepts_social_race_signal(self):
        hit = SearchHit("Almaty Trail Run 2026", "https://instagram.com/example", "Забег в Алматы, регистрация открыта")
        self.assertTrue(accept_hit(hit, CFG))
        self.assertFalse(should_fetch_direct(hit.url))

    def test_only_isolated_public_telegram_targets_are_fetchable(self):
        self.assertTrue(should_fetch_direct("https://t.me/s/athletex"))
        self.assertTrue(should_fetch_direct("https://t.me/athletex/1974"))
        self.assertFalse(should_fetch_direct("https://t.me/athletex"))
        self.assertFalse(should_fetch_direct("https://instagram.com/athletex_kz"))
        self.assertFalse(should_fetch_direct("https://facebook.com/raceclub"))

    def test_catalog_suppresses_existing_event(self):
        app = normalize_catalog_row({"id":"app1","name":"Caspian Marathon 2026","date":"2026-10-11","city":"Актау","website":"https://caspian-marathon.kz"})
        candidate = {"name":"Caspian Marathon 2026","date":"2026-10-11","city":"Актау","location":"","distances":[],"registration_status":"UNKNOWN","registration_url":"","instagram":"","organizer":"","source_urls":["https://caspian-marathon.kz/ru/calendar"]}
        out = annotate_against_catalog(candidate, [app])
        self.assertEqual(out["catalog_relation"], "ALREADY_IN_APP")
        self.assertEqual(out["app_match_id"], "app1")

    def test_catalog_detects_changed_date(self):
        app = normalize_catalog_row({"id":"app2","name":"Qaragandy Half Marathon","date":"2026-08-29","city":"Караганда"})
        candidate = {"name":"Qaragandy Half Marathon","date":"2026-09-20","city":"Караганда","location":"","distances":[],"registration_status":"UNKNOWN","registration_url":"","instagram":"","organizer":"","source_urls":[]}
        out = annotate_against_catalog(candidate, [app])
        self.assertEqual(out["catalog_relation"], "IN_APP_CHANGED")
        self.assertTrue(any(d["field"] == "date" for d in out["app_diffs"]))

if __name__ == "__main__":
    unittest.main()
