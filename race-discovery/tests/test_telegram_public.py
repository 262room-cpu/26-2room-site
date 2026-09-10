import unittest

from race_agent.telegram_public import external_message_links, is_public_channel_feed, parse_public_channel


class TelegramPublicTests(unittest.TestCase):
    def test_feed_detection(self):
        self.assertTrue(is_public_channel_feed('https://t.me/s/athletex'))
        self.assertTrue(is_public_channel_feed('https://telegram.me/s/races'))
        self.assertFalse(is_public_channel_feed('https://t.me/athletex/1974'))

    def test_messages_are_split_and_neighbor_facts_do_not_mix(self):
        raw='''
        <div class="tgme_widget_message" data-post="athletex/1974">
          <div class="tgme_widget_message_text">Irbis Race 7 September 2026 Алматы 42 km</div>
          <a href="https://athletex.kz/competitions/IrbisRace2026">Регистрация</a>
          <time datetime="2026-08-01T06:00:00+00:00"></time>
        </div>
        <div class="tgme_widget_message" data-post="athletex/1975">
          <div class="tgme_widget_message_text">Apple Race 22 September 2026 Алматы 4 km</div>
          <br><img src="x">
          <a href="https://example.kz/apple">Подробнее</a>
        </div>
        '''
        rows=parse_public_channel(raw)
        self.assertEqual(len(rows),2)
        self.assertIn('Irbis Race',rows[0]['text'])
        self.assertNotIn('Apple Race',rows[0]['text'])
        self.assertIn('Apple Race',rows[1]['text'])
        self.assertEqual(rows[0]['url'],'https://t.me/athletex/1974')
        self.assertEqual(rows[0]['datetime'],'2026-08-01T06:00:00+00:00')

    def test_external_links_skip_social_self_links(self):
        message={'links':[
            'https://t.me/athletex/1974',
            'https://instagram.com/race',
            'https://athletex.kz/competitions/IrbisRace2026',
        ]}
        self.assertEqual(external_message_links(message),['https://athletex.kz/competitions/IrbisRace2026'])


if __name__=='__main__':
    unittest.main()
