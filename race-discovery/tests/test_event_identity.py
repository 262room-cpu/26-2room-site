import unittest

from race_agent.core import candidate_from_document
from race_agent.event_identity import event_heading, explicitly_labeled_event_dates


class EventIdentityTests(unittest.TestCase):
    def test_federation_browser_title_yields_event_h1(self):
        html = '''
        <html><head><title>Федерация Триатлона Кыргызской Республики</title></head><body>
        <h1>Чемпионат Республики по дуатлону 2026</h1>
        <div>4 октября 2026 года. Дуатлон: 5 км бег, 20 км велогонка, 2,5 км бег.</div>
        </body></html>
        '''
        self.assertEqual(
            event_heading(html, "Федерация Триатлона Кыргызской Республики", "https://triathlon.kg/events/cempionat-respubliki-po-duatlonu-2026"),
            "Чемпионат Республики по дуатлону 2026",
        )
        candidate = candidate_from_document(
            "https://triathlon.kg/events/cempionat-respubliki-po-duatlonu-2026",
            html,
            "federation",
            "2026-09-10T00:00:00Z",
            known_cities=["Бишкек", "Чолпон-Ата"],
            country="Kyrgyzstan",
        )
        self.assertIsNotNone(candidate)
        self.assertEqual(candidate["name"], "Чемпионат Республики по дуатлону 2026")
        self.assertEqual(candidate["date"], "2026-10-04")
        self.assertTrue(any(e.get("field") == "name" and e.get("scope") == "EVENT_HEADING" for e in candidate["evidence"]))

    def test_distinct_federation_event_pages_get_distinct_ids(self):
        def make(name, date, slug):
            html = f'''<html><head><title>Федерация Триатлона Кыргызской Республики</title></head>
            <body><h1>{name}</h1><div>Дата проведения: {date}. Чолпон-Ата.</div></body></html>'''
            return candidate_from_document(
                f"https://triathlon.kg/events/{slug}", html, "federation", "2026-09-10T00:00:00Z",
                known_cities=["Чолпон-Ата"], country="Kyrgyzstan",
            )
        sprint = make("2026 VISA Asia Triathlon Cup Cholpon-Ata AG Super Sprint", "13 сентября 2026", "ag-super-sprint")
        relay = make("2026 VISA Asia Triathlon Cup Cholpon-Ata AG Relay", "12 сентября 2026", "ag-relay")
        self.assertIsNotNone(sprint)
        self.assertIsNotNone(relay)
        self.assertNotEqual(sprint["name"], relay["name"])
        self.assertNotEqual(sprint["candidate_id"], relay["candidate_id"])
        self.assertEqual(sprint["city"], "Чолпон-Ата")

    def test_explicit_event_date_beats_packet_pickup_before_event_block(self):
        text = (
            "Выдача стартовых наборов состоится 25-26 сентября 2026 года. "
            "ALMATY MARATHON 2026. Дата 27 сентября 2026. Место старта: Площадь Республики."
        )
        self.assertEqual(explicitly_labeled_event_dates(text), ["2026-09-27"])
        html = f"<html><head><title>ALMATY MARATHON 2026</title></head><body><h1>ALMATY MARATHON 2026</h1>{text}</body></html>"
        candidate = candidate_from_document(
            "https://almaty-marathon.kz/ru/events/almaty_marathon_2026/", html, "official_organizer",
            "2026-09-10T00:00:00Z", known_cities=["Алматы", "Туркестан"], country="Kazakhstan",
        )
        self.assertEqual(candidate["date"], "2026-09-27")
        self.assertEqual(candidate["city"], "Алматы")

    def test_moscow_hostname_and_adjective_beat_neighbor_petersburg(self):
        html = '''<html><head><title>СберПрайм Московский Марафон</title></head><body>
        <nav>Следующий старт в Санкт-Петербурге 10 октября 2026.</nav>
        <main><h1>СберПрайм Московский Марафон</h1>26 сентября - 27 сентября 2026. Москва. 42,2 км.</main>
        </body></html>'''
        candidate = candidate_from_document(
            "https://moscowmarathon.runc.run/", html, "official_organizer", "2026-09-10T00:00:00Z",
            known_cities=["Москва", "Санкт-Петербург"], country="Russia",
        )
        self.assertEqual(candidate["date"], "2026-09-26")
        self.assertEqual(candidate["city"], "Москва")


if __name__ == "__main__":
    unittest.main()
