import unittest

from race_agent.core import candidate_from_document, parse_dates, parse_prices
from race_agent.locales import focused_event_text


class LocaleParsingTests(unittest.TestCase):
    def test_english_day_and_month_first_dates(self):
        dates = parse_dates("Race day: 27 September 2026. Backup: October 18, 2026.")
        self.assertEqual(dates[:2], ["2026-09-27", "2026-10-18"])

    def test_date_ranges_keep_opening_date_first(self):
        self.assertEqual(parse_dates("26 September - 27 September 2026")[:2], ["2026-09-26", "2026-09-27"])
        self.assertEqual(parse_dates("October 17-18, 2026")[:2], ["2026-10-17", "2026-10-18"])

    def test_local_months_and_mongolian_numeric(self):
        self.assertIn("2026-09-13", parse_dates("13 septembrie 2026"))
        self.assertIn("2026-09-20", parse_dates("20 қыркүйек 2026"))
        self.assertIn("2026-09-27", parse_dates("2026 оны 9-р сарын 27"))

    def test_multi_market_prices(self):
        prices = parse_prices("5500 rubles; 7 500 RUB; 12000 ₸; 9000 KGS; 15000 AMD; 350 MDL; 80 GEL")
        joined = " | ".join(prices).lower()
        for expected in ("5500 rubles", "7 500 rub", "12000 ₸", "9000 kgs", "15000 amd", "350 mdl", "80 gel"):
            self.assertIn(expected.lower(), joined)

    def test_symbol_currencies(self):
        prices = parse_prices("Стартовый взнос: 6500 ₽, 40 ₾, 25 ₼, 12000 ₸, 10000 ֏, 50000 ₮")
        joined = " | ".join(prices)
        for expected in ("6500 ₽", "40 ₾", "25 ₼", "12000 ₸", "10000 ֏", "50000 ₮"):
            self.assertIn(expected, joined)

    def test_focus_ignores_other_races_in_navigation(self):
        text = (
            "21-22 February Speed Race 5 April April Run 11 April Fast Dog "
            "26 September - 27 September 2026 SberPrime Moscow Marathon "
            "42.2 km Start 9:00 Registration 6500 RUB Route Moscow Russia"
        )
        focused = focused_event_text(text, "SberPrime Moscow Marathon")
        self.assertIn("26 September - 27 September 2026", focused)

    def test_candidate_uses_focused_date_not_navigation(self):
        html = '''
        <html><head><title>SberPrime Moscow Marathon</title></head><body>
        <nav>21 February 2026 Speed Race 5 km</nav>
        <main>26 September - 27 September 2026 SberPrime Moscow Marathon 42.2 km Moscow Russia. Registration open. 6500 RUB.</main>
        </body></html>
        '''
        candidate = candidate_from_document(
            "https://moscowmarathon.runc.run/", html, "official_organizer", "2026-09-10T00:00:00Z",
            known_cities=["Москва"], country="Russia",
        )
        self.assertIsNotNone(candidate)
        self.assertEqual(candidate["date"], "2026-09-26")
        self.assertIn("42.2 km", candidate["distances"])
        self.assertNotIn("5 km", candidate["distances"])
        self.assertTrue(any("6500" in x for x in candidate["registration_prices"]))


if __name__ == "__main__":
    unittest.main()
