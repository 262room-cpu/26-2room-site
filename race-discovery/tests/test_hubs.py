import unittest

from race_agent.hubs import extract_hub_event_links


class HubTests(unittest.TestCase):
    def test_explicit_calendar_is_split_and_not_one_event(self):
        raw = '''
        <html><body>
          <a href="/competitions/calendar">Календарь</a>
          <a href="/competitions/moscow-marathon-2026">Московский марафон 2026</a>
          <a href="/competitions/night-run-2026">Ночной забег 2026</a>
          <a href="/login">Войти</a>
        </body></html>
        '''
        out = extract_hub_event_links("https://example.ru/competitions/calendar", raw)
        self.assertTrue(out["is_hub"])
        urls = {x["url"] for x in out["event_links"]}
        self.assertIn("https://example.ru/competitions/moscow-marathon-2026", urls)
        self.assertIn("https://example.ru/competitions/night-run-2026", urls)
        self.assertNotIn("https://example.ru/login", urls)

    def test_root_with_many_event_links_is_hub(self):
        raw = '''
        <a href="/race/a">Весенний забег 2026</a>
        <a href="/race/b">Trail Run 2026</a>
        <a href="/race/c">Half Marathon 2026</a>
        '''
        out = extract_hub_event_links("https://example.org/", raw)
        self.assertTrue(out["is_hub"])
        self.assertEqual(len(out["event_links"]), 3)

    def test_single_event_page_is_not_hub(self):
        raw = '''
        <html><body>
          <h1>Yerevan Marathon 2026</h1>
          <a href="/events">All events</a>
          <a href="/events/yerevan-marathon/registration">Registration</a>
        </body></html>
        '''
        out = extract_hub_event_links("https://example.am/events/yerevan-marathon", raw)
        self.assertFalse(out["is_hub"])

    def test_external_social_links_are_not_followed(self):
        raw = '''
        <a href="https://instagram.com/race">Race Instagram</a>
        <a href="https://t.me/race">Race Telegram</a>
        <a href="/events/race-2026">Race 2026</a>
        '''
        out = extract_hub_event_links("https://example.com/events", raw)
        self.assertTrue(out["is_hub"])
        self.assertEqual([x["url"] for x in out["event_links"]], ["https://example.com/events/race-2026"])


if __name__ == "__main__":
    unittest.main()
