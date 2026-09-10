import unittest

from race_agent.organizer_catalog import annotate_organizer_against_crm, crm_match_score, normalize_crm_row


class OrganizerCatalogTests(unittest.TestCase):
    def profile(self, name, website=None, instagram=None, email=None, phone=None):
        return {
            "name": name,
            "aliases": [],
            "cities": ["Алматы"],
            "contacts": {
                "website": [website] if website else [],
                "instagram": [instagram] if instagram else [],
                "email": [email] if email else [],
                "phone": [phone] if phone else [],
                "whatsapp": [], "telegram": [],
            },
            "source_urls": [website] if website else [],
        }

    def test_exact_name_matches_existing_crm(self):
        crm = [normalize_crm_row({"CRM ID": 23, "Название": "Race Nation Kazakhstan", "Сайт": "https://athletex.kz/", "Соцсеть / Instagram": "@athletex_kz"})]
        out = annotate_organizer_against_crm(self.profile("Race Nation Kazakhstan"), crm)
        self.assertEqual(out["crm_relation"], "EXISTING_ORGANIZER")
        self.assertEqual(out["crm_match_id"], "23")

    def test_shared_registration_site_does_not_auto_merge_different_brands(self):
        crm = [
            normalize_crm_row({"CRM ID": 23, "Название": "Race Nation Kazakhstan", "Сайт": "https://athletex.kz/", "Соцсеть / Instagram": "@athletex_kz"}),
            normalize_crm_row({"CRM ID": 24, "Название": "Alpine Race Kazakhstan", "Сайт": "https://athletex.kz/", "Соцсеть / Instagram": "@athletex_kz"}),
        ]
        out = annotate_organizer_against_crm(self.profile("Совсем новый старт", website="https://athletex.kz/"), crm)
        self.assertNotEqual(out["crm_relation"], "EXISTING_ORGANIZER")

    def test_same_instagram_on_multiple_brands_is_ambiguous(self):
        crm = [
            normalize_crm_row({"CRM ID": 23, "Название": "Race Nation Kazakhstan", "Соцсеть / Instagram": "@athletex_kz"}),
            normalize_crm_row({"CRM ID": 24, "Название": "Alpine Race Kazakhstan", "Соцсеть / Instagram": "@athletex_kz"}),
        ]
        out = annotate_organizer_against_crm(self.profile("Unknown brand", instagram="https://instagram.com/athletex_kz/"), crm)
        self.assertEqual(out["crm_relation"], "POSSIBLE_CRM_MATCH")

    def test_new_unique_organizer_is_new_lead(self):
        crm = [normalize_crm_row({"CRM ID": 1, "Название": "Old Marathon Team"})]
        out = annotate_organizer_against_crm(self.profile("Беготня Федора"), crm)
        self.assertEqual(out["crm_relation"], "NEW_ORGANIZER_LEAD")

    def test_existing_organizer_with_new_confirmed_email_is_contact_update(self):
        crm = [normalize_crm_row({"CRM ID": 1, "Название": "Беготня", "E-mail": "old@begotnya.ru"})]
        out = annotate_organizer_against_crm(self.profile("Беготня", email="new@begotnya.ru"), crm)
        self.assertEqual(out["crm_relation"], "EXISTING_ORGANIZER_CONTACT_UPDATE")
        self.assertTrue(any(x["field"] == "email" for x in out["crm_contact_additions"]))

    def test_corporate_fund_abbreviation_is_at_least_possible_match_with_same_site(self):
        row = normalize_crm_row({"CRM ID": 1, "Название": "КФ «Смелость быть первым»", "Сайт": "https://almaty-marathon.kz/"})
        profile = self.profile("Корпоративный фонд «Смелость быть первым»", website="https://almaty-marathon.kz/")
        score, _ = crm_match_score(profile, row)
        self.assertGreaterEqual(score, 0.72)


if __name__ == "__main__":
    unittest.main()
