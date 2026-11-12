"""
Master test suite runner for ASHA Vaani.
Executes all unit test modules: danger rules, number normalizer, roster, and strict mode.
"""

import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tests.test_danger import TestDangerSignEngine
from tests.test_numbers import TestNumberNormalizer
from tests.test_roster import TestBeneficiaryRoster
from tests.test_strict import TestStrictMode

def suite():
    s = unittest.TestSuite()
    s.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestDangerSignEngine))
    s.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestNumberNormalizer))
    s.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestBeneficiaryRoster))
    s.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestStrictMode))
    return s

if __name__ == "__main__":
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite())
    sys.exit(0 if result.wasSuccessful() else 1)
