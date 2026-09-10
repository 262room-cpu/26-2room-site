import unittest

from race_agent.core import candidate_from_document, parse_dates, parse_prices
from race_agent.locales import focused_event_text, primary_event_dates


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

    def test_april_run_race_date_beats_registration_opening_date(self):
        text = (
            "Забег «Апрель» 5 апреля 2026 Москва 5 км. "
            "Регистрация: при регистрации с 10 марта 2026 по 20 марта 2026 стоимость 2500 рублей. "
            "Забег «Апрель» — старт в 10:00."
        )
        self.assertEqual(primary_event_dates(text, "Забег «Апрель»")[0], "2026-04-05")
        html = f"<html><head><title>Забег «Апрель»</title></head><body>{text}</body></html>"
        candidate = candidate_from_document(
            "https://aprilrun5km.runc.run/", html, "official_organizer", "2026-09-10T00:00:00Z",
            known_cities=["Москва"], country="Russia",
        )
        self.assertEqual(candidate["date"], "2026-04-05")

    def test_spb_half_race_date_beats_registration_period(self):
        text = (
            "9 августа 2026 СПБ полумарафон «Северная столица» Санкт-Петербург 21,1 км. "
            "Регистрация с 20 марта 2026 по 31 июля 2026. Стоимость участия 4500 рублей. "
            "СПБ полумарафон «Северная столица» старт 09:00."
        )
        self.assertEqual(primary_event_dates(text, "СПБ полумарафон «Северная столица»")[0], "2026-08-09")

    def test_moscow_marathon_range_beats_expo_and_packet_dates(self):
        text = (
            "26 сентября - 27 сентября 2026 СберПрайм Московский Марафон Москва 42,2 км. "
            "24 сентября 2026 экспо. 25 сентября 2026 выдача стартовых пакетов. "
            "Регистрация до 14 сентября 2026. СберПрайм Московский Марафон старт 09:00."
        )
        dates = primary_event_dates(text, "СберПрайм Московский Марафон")
        self.assertEqual(dates[:2], ["2026-09-26", "2026-09-27"])

    def test_structured_almaty_event_is_not_overwritten_by_neighbor_turkistan_event(self):
        html = '''
        <html><head><title>ALMATY MARATHON 2026</title>
        <script type="application/ld+json">
        {
          "@context":"https://schema.org",
          "@type":"SportsEvent",
          "name":"ALMATY MARATHON 2026",
          "startDate":"2026-09-27T05:30:00+06:00",
          "location":{"@type":"Place","name":"Площадь Республики"},
          "organizer":{"@type":"Organization","name":"Корпоративный фонд Смелость быть первым"}
        }
        </script></head><body>
        <nav>Другие старты: TURKISTAN MARATHON — 25 сентября 2026, Туркестан.</nav>
        <main>ALMATY MARATHON 2026. 27 сентября 2026. Алматы. Площадь Республики. 42,195 км. Регистрация открыта.</main>
        <footer>Следующий старт фонда: Туркестан, 25 октября 2026.</footer>
        </body></html>
        '''
        candidate = candidate_from_document(
            "https://almaty-marathon.kz/ru/events/almaty_marathon_2026/",
            html,
            "official_organizer",
            "2026-09-10T00:00:00Z",
            known_cities=["Алматы", "Туркестан"],
            country="Kazakhstan",
        )
        self.assertIsNotNone(candidate)
        self.assertEqual(candidate["name"], "ALMATY MARATHON 2026")
        self.assertEqual(candidate["date"], "2026-09-27")
        self.assertEqual(candidate["city"], "Алматы")
        self.assertEqual(candidate["location"], "Площадь Республики")
        self.assertTrue(any(e.get("field") == "city" and e.get("scope") == "EVENT_IDENTITY" for e in candidate["evidence"]))

    def test_structured_date_wins_even_when_focused_text_starts_with_another_date(self):
        html = '''
        <html><head><title>Yerevan Marathon 2026</title>
        <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Event","name":"Yerevan Marathon 2026","startDate":"2026-10-18"}
        </script></head><body>
        <div>17 October 2026 expo and packet pickup.</div>
        <main>Yerevan Marathon 2026 — race day 18 October 2026, Yerevan.</main>
        </body></html>
        '''
        candidate = candidate_from_document(
            "https://example.am/yerevan-marathon-2026", html, "official_event", "2026-09-10T00:00:00Z",
            known_cities=["Ереван"], country="Armenia",
        )
        self.assertIsNotNone(candidate)
        self.assertEqual(candidate["date"], "2026-10-18")
        self.assertEqual(candidate["city"], "Ереван")

    def test_known_registration_status_is_not_erased_by_unknown_focused_status(self):
        html = '''
        <html><head><title>Astana Trail 2026</title></head><body>
        <div>Регистрация открыта на Astana Trail 2026.</div>
        <main>Astana Trail 2026, 18 October 2026, Astana, 20 km.</main>
        </body></html>
        '''
        candidate = candidate_from_document(
            "https://example.kz/astana-trail-2026", html, "official_event", "2026-09-10T00:00:00Z",
            known_cities=["Астана"], country="Kazakhstan",
        )
        self.assertIsNotNone(candidate)
        self.assertEqual(candidate["registration_status"], "OPEN")


if __name__ == "__main__":
    unittest.main()
