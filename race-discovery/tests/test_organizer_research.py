import unittest

from race_agent.organizer_research import apply_social_hit, relation_score
from race_agent.providers import SearchHit


class OrganizerResearchTests(unittest.TestCase):
    def setUp(self):
        self.event={
            'candidate_id':'evt1','name':'Беготня Москва 2027','city':'Москва','country':'Russia',
            'source_urls':['https://begotnya.ru/event/2027'],'official_site':'https://begotnya.ru/event/2027',
        }
        self.profile={
            'organizer_id':'org1','name':'Федор Иванов','identity_status':'NAMED',
            'contacts':{'instagram':[],'telegram':[],'whatsapp':[],'email':[],'phone':[],'website':[]},
            'contact_candidates':{'instagram':['https://www.instagram.com/fedor_run/'],'telegram':[],'whatsapp':[],'email':[],'phone':[],'website':[]},
            'evidence':[{
                'field':'instagram','value':'https://www.instagram.com/fedor_run/',
                'url':'https://begotnya.ru/event/2027','source_type':'official_event',
                'association':'UNCONFIRMED_ORGANIZER_RELATION',
            }],
        }

    def test_exact_event_and_organizer_social_hit_scores_high(self):
        hit=SearchHit('Беготня Москва 2027 — организатор Федор Иванов','https://instagram.com/fedor_run','Официальная страница забега')
        self.assertGreaterEqual(relation_score(hit,self.event,self.profile),0.72)

    def test_search_corroboration_promotes_official_event_social_candidate(self):
        hit=SearchHit('Беготня Москва 2027 — Федор Иванов','https://instagram.com/fedor_run','Организатор забега')
        added,promoted,_=apply_social_hit(self.profile,self.event,hit,'2026-09-10T00:00:00Z')
        self.assertTrue(added)
        self.assertTrue(promoted)
        self.assertIn('https://www.instagram.com/fedor_run/',self.profile['contacts']['instagram'])

    def test_unrelated_social_profile_is_rejected(self):
        hit=SearchHit('Coffee shop Moscow','https://instagram.com/cafe_random','Завтра скидка на кофе')
        added,promoted,score=apply_social_hit(self.profile,self.event,hit,'2026-09-10T00:00:00Z')
        self.assertFalse(added)
        self.assertFalse(promoted)
        self.assertLess(score,0.58)


if __name__=='__main__':
    unittest.main()
