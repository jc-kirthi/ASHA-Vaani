"""
Unit tests for deterministic danger signs rule engine.
"""

import unittest
from app.danger import DangerSignEngine

class TestDangerSignEngine(unittest.TestCase):
    def setUp(self):
        self.engine = DangerSignEngine()

    def test_transition_positive_must_flag(self):
        # "nahi thi, ab ho rahi hai" MUST FLAG
        r = self.engine.evaluate("bleeding nahi thi, ab ho rahi hai", language="hi")
        self.assertEqual(r.decision, "FLAG")
        self.assertIn("vaginal_bleeding", [s["id"] for s in r.flagged_signs])

    def test_transition_negative_must_clear(self):
        # "pehle thi, ab nahi" MUST CLEAR
        r = self.engine.evaluate("bleeding pehle thi, ab nahi hai", language="hi")
        self.assertEqual(r.decision, "CLEAR")

    def test_hedged_ambiguous_must_ask(self):
        # "thoda bleeding jaisa laga" MUST ASK
        r = self.engine.evaluate("thoda bleeding jaisa laga", language="hi")
        self.assertEqual(r.decision, "ASK")
        self.assertTrue(len(r.clarification_questions) > 0)

    def test_unknown_status_must_ask(self):
        # "bataya nahi" -> unknown, not negative
        r = self.engine.evaluate("bleeding ke baare me bataya nahi", language="hi")
        self.assertEqual(r.decision, "ASK")

    def test_clear_negation(self):
        r = self.engine.evaluate("bleeding nahi hai, sab normal hai", language="hi")
        self.assertEqual(r.decision, "CLEAR")

    def test_convulsions_fits_flags(self):
        r = self.engine.evaluate("Pooja Yadav ko daura aaya tha", language="hi")
        self.assertEqual(r.decision, "FLAG")
        self.assertIn("convulsions_fits", [s["id"] for s in r.flagged_signs])

    def test_kannada_transitional_positive(self):
        r = self.engine.evaluate("Rakthasrava irallilla ivaga aaguttide", language="kn")
        self.assertEqual(r.decision, "FLAG")

    def test_kannada_transitional_negative(self):
        r = self.engine.evaluate("Rakthasrava ittu ivaga illa", language="kn")
        self.assertEqual(r.decision, "CLEAR")

    def test_referral_slip_generation(self):
        r = self.engine.evaluate(
            "Sunita Sharma ko bleeding ho rahi hai",
            language="hi",
            beneficiary_name="Sunita Sharma",
            beneficiary_id="BEN-003",
            worker_id="ASHA-104"
        )
        self.assertEqual(r.decision, "FLAG")
        self.assertIsNotNone(r.referral_slip)
        self.assertIn("PHC REFERRAL SLIP", r.referral_slip)
        self.assertIn("Sunita Sharma", r.referral_slip)
        self.assertIn("BEN-003", r.referral_slip)

if __name__ == "__main__":
    unittest.main()
