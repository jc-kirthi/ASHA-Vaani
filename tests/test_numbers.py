"""
Unit tests for dual-method number normalizer and confusable guard.
"""

import unittest
from app.numbers import NumberNormalizer

class TestNumberNormalizer(unittest.TestCase):
    def setUp(self):
        self.norm = NumberNormalizer()

    def test_saade_teen(self):
        r = self.norm.parse_weight("saade teen kilo", category="newborn")
        self.assertEqual(r.value, 3.5)
        self.assertEqual(r.state, "confirmed")

    def test_dhai_kilo(self):
        r = self.norm.parse_weight("dhai kilo", category="newborn")
        self.assertEqual(r.value, 2.5)
        self.assertEqual(r.state, "confirmed")

    def test_dedh_kilo(self):
        r = self.norm.parse_weight("dedh kilo", category="newborn")
        self.assertEqual(r.value, 1.5)
        self.assertEqual(r.state, "confirmed")

    def test_sawa_do(self):
        r = self.norm.parse_weight("sawa do kilo", category="newborn")
        self.assertEqual(r.value, 2.25)
        self.assertEqual(r.state, "confirmed")

    def test_paune_teen(self):
        r = self.norm.parse_weight("paune teen kilo", category="newborn")
        self.assertEqual(r.value, 2.75)
        self.assertEqual(r.state, "confirmed")

    def test_do_aath(self):
        r = self.norm.parse_weight("do aath kilo", category="newborn")
        self.assertEqual(r.value, 2.8)
        self.assertEqual(r.state, "confirmed")

    def test_kilo_gram_compound(self):
        r = self.norm.parse_weight("2 kilo 800 gram", category="newborn")
        self.assertEqual(r.value, 2.8)
        self.assertEqual(r.state, "confirmed")

    def test_english_point(self):
        r = self.norm.parse_weight("two point eight kg", category="newborn")
        self.assertEqual(r.value, 2.8)
        self.assertEqual(r.state, "confirmed")

    def test_implausible_newborn_weight(self):
        # 7.5 kg for newborn is implausible (>6.0 kg) -> MUST be uncertain
        r = self.norm.parse_weight("7.5 kilo", category="newborn")
        self.assertEqual(r.state, "uncertain")
        self.assertFalse(r.is_plausible)

    def test_confusable_guard(self):
        # "saath" vs "saat"
        r = self.norm.parse_weight("saat kilo", category="adult")
        self.assertTrue(r.is_confusable)
        self.assertEqual(r.state, "uncertain")
        self.assertIsNotNone(r.confusable_prompt)

if __name__ == "__main__":
    unittest.main()
