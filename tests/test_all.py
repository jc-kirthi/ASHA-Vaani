#!/usr/bin/env python3
"""
Unit Test Suite for ASHA Vaani Clinical Safety & Verification Rules.
Tests danger sign detection (FLAG/CLEAR/ASK), number parsing, and roster matching.
"""

import sys
import re

# --- Deterministic Clinical Danger Sign Rule Engine (Matches dangerEngine.ts) ---

DANGER_SIGNS = [
    {"id": "vaginal_bleeding", "name": "Vaginal Bleeding", "synonyms": ["bleeding", "rakt", "khoon", "spotting", "rokto", "lohi", "rathapokku", "rakthasrava"]},
    {"id": "convulsions_fits", "name": "Convulsions / Fits", "synonyms": ["daura", "fits", "seizure", "jhatka", "mirgi", "moorche", "aanchki"]},
    {"id": "severe_headache_blurred_vision", "name": "Severe Headache with Blurred Vision", "synonyms": ["dhundhla", "blurred vision", "tez sar dard", "kannu mabbaguvudu"]},
    {"id": "high_fever_pregnancy", "name": "High Fever / Sepsis", "synonyms": ["tez bukhar", "high fever", "tumba jwara", "taap", "taav", "jor", "paniyum", "bukhar", "fever", "jwara"]},
    {"id": "severe_abdominal_pain", "name": "Severe Abdominal Pain", "synonyms": ["pet mein tez dard", "severe abdominal pain", "hotte tumba novu", "pet dard", "hottenovu"]},
    {"id": "reduced_fetal_movement", "name": "Reduced Fetal Movement", "synonyms": ["bachha hil nahi raha", "movement kam", "reduced fetal movement", "chalane illa"]},
    {"id": "newborn_fever", "name": "Newborn High Fever", "synonyms": ["bachhe ko bukhar", "newborn fever", "maguvige jwara"]},
    {"id": "newborn_hypothermia", "name": "Very Cold Body (Hypothermia)", "synonyms": ["thanda pad gaya", "sharir thanda", "cold body", "hypothermia"]},
    {"id": "newborn_not_feeding", "name": "Unable to Feed / Refusing Milk", "synonyms": ["doodh nahi", "haalu kudiyuttilla", "not feeding", "refusing milk", "palu tagatledu", "paal kudikkavillai"]},
    {"id": "fast_breathing_chest_indrawing", "name": "Fast Breathing / Chest Indrawing", "synonyms": ["pasli chal", "saans tez", "chhati dhas", "fast breathing", "saah tez"]},
    {"id": "yellow_palms_soles", "name": "Yellow Palms and Soles (Severe Jaundice)", "synonyms": ["peele pad gaye", "yellow palms", "yellow soles", "peeliya", "haladi"]},
    {"id": "unresponsive_lethargic", "name": "Lethargic or Unresponsive", "synonyms": ["sust pad gaya", "harkat nahi kar raha", "unresponsive", "lethargic", "sust"]}
]

TRANS_POS_RE = re.compile(r"(pehle.*nahi.*ab|nahi (thi|tha|rahi|ittu).*ab|didn't have.*(now|started)|did not have.*(now|started)|no.*earlier.*now.*(started|active|bleeding)|irallilla.*ivaga (ide|aaguttide)|munche.*irallilla.*ivaga)", re.I)
TRANS_NEG_RE = re.compile(r"(pehle.*(thi|tha|hua tha).*ab (nahi|band|theek)|(had|was).*earlier.*now.*(no|none|not|stopped|cured)|earlier.*now.*stopped|(ittu|itthu).*ivaga (illa|nillide)|modalu.*ivaga illa)", re.I)
HEDGE_RE = re.compile(r"(thoda.*jaisa|jaisa laga|doubtful|shakk hai|maybe|anusthide|suspected)", re.I)
UNKNOWN_RE = re.compile(r"(bataya nahi|pata nahi|did not mention|not reported)", re.I)
NEG_RE = re.compile(r"\b(nahi|bilkul nahi|no|not|none|illa|aguttilla|ledu|illai|nei|nathi)\b", re.I)

def evaluate_danger_signs(text):
    t = text.lower()
    flagged = []
    asked = []
    cleared = []

    for sign in DANGER_SIGNS:
        matched = False
        for syn in sign["synonyms"]:
            if syn.lower() in t:
                matched = True
                break
        if not matched:
            continue

        if TRANS_POS_RE.search(t):
            flagged.append(sign["id"])
        elif TRANS_NEG_RE.search(t):
            cleared.append(sign["id"])
        elif HEDGE_RE.search(t):
            asked.append(sign["id"])
        elif UNKNOWN_RE.search(t):
            asked.append(sign["id"])
        elif sign["id"] not in ("newborn_not_feeding", "reduced_fetal_movement") and NEG_RE.search(t):
            cleared.append(sign["id"])
        else:
            flagged.append(sign["id"])

    if flagged:
        return "FLAG", flagged
    if asked:
        return "ASK", asked
    return "CLEAR", cleared

# --- Number Parsing Engine ---

def parse_weight(text, is_newborn=False):
    t = text.lower()
    # Fractional
    if "adhai" in t or "dhai" in t:
        return 2.5
    if "dedh" in t:
        return 1.5
    if "paune tin" in t or "paune teen" in t:
        return 2.75
    if "sawwa tin" in t or "sawwa teen" in t:
        return 3.25

    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:kilo|kg|k\.g)?", t)
    if m:
        val = float(m.group(1))
        if is_newborn and 1.0 <= val <= 6.0:
            return val
        elif not is_newborn and 30.0 <= val <= 150.0:
            return val
    return None

def parse_bp(text):
    m = re.search(r"\b(\d{2,3})\s*(?:by|/|aur|battey)\s*(\d{2,3})\b", text, re.I)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None

# --- Roster Matching ---

ROSTER = [
    {"name": "Sita Devi", "house_no": "12", "id": "BEN-001"},
    {"name": "Lakshmi Gowda", "house_no": "14", "id": "BEN-004"},
    {"name": "Lakshmi Gowda", "house_no": "28", "id": "BEN-007"},
    {"name": "Sunita Bai", "house_no": "45", "id": "BEN-003"}
]

def search_roster(text):
    t = text.lower()
    matches = [b for b in ROSTER if b["name"].lower() in t]
    return matches

# --- Test Execution ---

def run_tests():
    print("=" * 60)
    print("Running ASHA Vaani Unit Tests (Clinical Safety & Normalizers)")
    print("=" * 60)

    passed = 0
    failed = 0

    test_cases = [
        # 1. Unnegated Danger Signs -> FLAG
        ("Sita Devi visit, severe vaginal bleeding ho rahi hai", "FLAG"),
        ("Bachha doodh nahi pi raha, bahut sust hai", "FLAG"),
        ("Mother has severe headache with blurred vision", "FLAG"),
        ("Bachhe ko tez bukhar aur pasli chal rahi hai", "FLAG"),
        ("Tumba jwara ide, hotte tumba novu", "FLAG"),
        ("Lethargic newborn baby, sharir thanda pad gaya", "FLAG"),

        # 2. Negated Symptoms -> CLEAR (Zero False Alarms)
        ("Sita Devi ko koi bleeding nahi hai, sab normal hai", "CLEAR"),
        ("Bukhar nahi hai, doodh theek se pi raha hai", "CLEAR"),
        ("No headache, no vaginal bleeding, BP normal", "CLEAR"),
        ("Hottenovu illa, maguvige jwara illa", "CLEAR"),
        ("Raktasrava illa, vajan 52 kilo", "CLEAR"),

        # 3. Temporal Transitional -> Positives FLAG, Negatives CLEAR
        ("Pehle bleeding nahi thi lekin ab bleeding shuru ho gayi hai", "FLAG"),
        ("Pehle bukhar tha lekin ab theek hai, koi bukhar nahi", "CLEAR"),
        ("Earlier mother had bleeding, now it has completely stopped", "CLEAR"),
        ("Did not have fever earlier but now fever has started", "FLAG"),

        # 4. Hedged / Uncertain -> ASK
        ("Thoda bukhar jaisa lag raha hai", "ASK"),
        ("Doubtful if baby had fits or just shivering", "ASK"),
        ("Bleeding ke baare mein bataya nahi", "ASK"),
    ]

    for utterance, expected in test_cases:
        decision, _ = evaluate_danger_signs(utterance)
        if decision == expected:
            passed += 1
        else:
            failed += 1
            print(f"FAIL: '{utterance}' -> got {decision}, expected {expected}")

    # Number parsing checks
    assert parse_weight("vajan 52.4 kilo", False) == 52.4
    assert parse_weight("baby weight adhai kilo", True) == 2.5
    assert parse_weight("newborn dedh kilo", True) == 1.5
    sys_val, dia_val = parse_bp("BP 120/80 mmHg")
    assert sys_val == 120 and dia_val == 80
    sys_val2, dia_val2 = parse_bp("BP 130 battey 90")
    assert sys_val2 == 130 and dia_val2 == 90
    passed += 5

    # Roster disambiguation check
    matches_single = search_roster("Sita Devi visit note")
    assert len(matches_single) == 1
    matches_collision = search_roster("Lakshmi Gowda visit note")
    assert len(matches_collision) == 2  # Disambiguation trigger!
    passed += 2

    print(f"\nAll Core Unit Tests Completed: {passed} passed, {failed} failed.")
    if failed == 0:
        print("RESULT: PASS")
        return 0
    else:
        print("RESULT: FAIL")
        return 1

if __name__ == '__main__':
    sys.exit(run_tests())
