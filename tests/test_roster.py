"""
Unit tests for beneficiary roster lookup and duplicate name disambiguation.
"""

import unittest
from app.roster import BeneficiaryRoster

class TestBeneficiaryRoster(unittest.TestCase):
    def setUp(self):
        self.roster = BeneficiaryRoster()

    def test_single_match(self):
        status, rec, candidates, prompt = self.roster.check_roster("Sunita Sharma")
        self.assertEqual(status, "MATCHED")
        self.assertIsNotNone(rec)
        self.assertEqual(rec["name"], "Sunita Sharma")
        self.assertEqual(rec["house_no"], "5")

    def test_duplicate_name_requires_disambiguation(self):
        # Two Sita Devis in roster (House 12 and House 40)
        status, rec, candidates, prompt = self.roster.check_roster("Sita Devi", lang="hi")
        self.assertEqual(status, "DISAMBIGUATE")
        self.assertIsNone(rec)
        self.assertEqual(len(candidates), 2)
        self.assertIn("12", prompt)
        self.assertIn("40", prompt)

    def test_resolve_disambiguation_by_house(self):
        status, rec, candidates, prompt = self.roster.check_roster("Sita Devi", lang="hi")
        resolved = self.roster.resolve_disambiguation(candidates, "makan number 12")
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved["id"], "BEN-001")
        self.assertEqual(resolved["house_no"], "12")

    def test_unknown_beneficiary_asks_id(self):
        status, rec, candidates, prompt = self.roster.check_roster("Nonexistent Person", lang="hi")
        self.assertEqual(status, "NOT_FOUND")
        self.assertIn("आईडी", prompt)

if __name__ == "__main__":
    unittest.main()
