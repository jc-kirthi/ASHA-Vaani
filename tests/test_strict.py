"""
Unit tests for strict-mode behavior in languages without custom lexicons.
"""

import unittest
from app.danger import DangerSignEngine

class TestStrictMode(unittest.TestCase):
    def setUp(self):
        self.engine = DangerSignEngine()

    def test_strict_mode_reported_for_other_languages(self):
        # Bengali, Marathi, Gujarati, etc. should report strict mode
        r_bn = self.engine.evaluate("Bachar khub jor", language="bn")
        self.assertEqual(r_bn.lexicon_mode, "lexicon: none, strict mode")

        r_mr = self.engine.evaluate("Balyala taap", language="mr")
        self.assertEqual(r_mr.lexicon_mode, "lexicon: none, strict mode")

    def test_active_lexicon_reported_for_tier1_languages(self):
        # Hindi, Kannada, English report active lexicon
        r_hi = self.engine.evaluate("bleeding nahi hai", language="hi")
        self.assertEqual(r_hi.lexicon_mode, "lexicon: active")

        r_kn = self.engine.evaluate("rakthasrava illa", language="kn")
        self.assertEqual(r_kn.lexicon_mode, "lexicon: active")

        r_en = self.engine.evaluate("no bleeding", language="en")
        self.assertEqual(r_en.lexicon_mode, "lexicon: active")

    def test_strict_mode_flags_on_unnegated_llm_symptom(self):
        # In strict mode, if LLM outputs an active danger symptom, it must FLAG
        llm_sym = [{"symptom": "newborn_fever", "negated": False, "timing": "present", "certainty": "high"}]
        r = self.engine.evaluate("balak taav chhe", language="gu", llm_symptoms=llm_sym)
        self.assertEqual(r.decision, "FLAG")
        self.assertEqual(r.lexicon_mode, "lexicon: none, strict mode")

if __name__ == "__main__":
    unittest.main()
