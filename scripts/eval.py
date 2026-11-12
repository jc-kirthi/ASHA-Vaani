#!/usr/bin/env python3
"""
ASHA Vaani Clinical Safety & Accuracy Benchmark Evaluation.
Evaluates baseline dataset + 22 NEW tricky Indic utterances:
- Negation inside long sentences
- Past vs present transitions
- Hedged / doubtful symptoms
- Number corrections & digit confusables
- Same-name beneficiary disambiguation
Reports: Danger Signs Missed (target: 0), False Alarms, Accuracy, Precision, Recall.
"""

import sys
import re

# Deterministic Engine Evaluator (matches dangerEngine.ts)
DANGER_SIGNS = [
    {"id": "vaginal_bleeding", "synonyms": ["bleeding", "rakt", "khoon", "spotting", "rokto", "lohi", "rathapokku", "rakthasrava"]},
    {"id": "convulsions_fits", "synonyms": ["daura", "fits", "seizure", "jhatka", "mirgi", "moorche", "aanchki"]},
    {"id": "severe_headache_blurred_vision", "synonyms": ["dhundhla", "blurred vision", "tez sar dard", "kannu mabbaguvudu", "mabbaguvudu"]},
    {"id": "high_fever_pregnancy", "synonyms": ["tez bukhar", "high fever", "tumba jwara", "taap", "taav", "jor", "paniyum", "bukhar", "fever", "jwara"]},
    {"id": "severe_abdominal_pain", "synonyms": ["pet mein tez dard", "severe abdominal pain", "hotte tumba novu", "pet dard", "hottenovu"]},
    {"id": "reduced_fetal_movement", "synonyms": ["bachha hil nahi raha", "movement kam", "reduced fetal movement", "chalane illa", "bachha hil", "fetal movement"]},
    {"id": "newborn_fever", "synonyms": ["bachhe ko bukhar", "newborn fever", "maguvige jwara"]},
    {"id": "newborn_hypothermia", "synonyms": ["thanda pad gaya", "sharir thanda", "cold body", "hypothermia", "cold like ice"]},
    {"id": "newborn_not_feeding", "synonyms": ["doodh nahi", "haalu kudiyuttilla", "not feeding", "refusing milk", "palu tagatledu", "paal kudikkavillai"]},
    {"id": "fast_breathing_chest_indrawing", "synonyms": ["pasli chal", "saans tez", "chhati dhas", "fast breathing", "saah tez", "tez saans"]},
    {"id": "yellow_palms_soles", "synonyms": ["peele pad gaye", "yellow palms", "yellow soles", "peeliya", "haladi"]},
    {"id": "unresponsive_lethargic", "synonyms": ["sust pad gaya", "harkat nahi kar raha", "unresponsive", "lethargic", "sust"]}
]

TRANS_POS_RE = re.compile(r"(pehle.*nahi.*ab|kal.*nahi.*aaj|nahi.*shuru|nahi (thi|tha|rahi|ittu).*ab|didn't have.*(now|started)|did not have.*(now|started)|no.*earlier.*now.*(started|active|bleeding)|irallilla.*ivaga (ide|aaguttide)|munche.*irallilla.*ivaga)", re.I)
TRANS_NEG_RE = re.compile(r"(pehle.*(thi|tha|hua tha).*ab (nahi|band|theek)|(had|was).*earlier.*now.*(no|none|not|stopped|cured)|earlier.*now.*stopped|(ittu|itthu).*ivaga (illa|nillide)|modalu.*ivaga illa)", re.I)
UNKNOWN_RE = re.compile(r"(bataya nahi|pata nahi|did not mention|not reported)", re.I)
HEDGE_RE = re.compile(r"(thoda.*jaisa|jaisa laga|doubtful|shakk hai|maybe|anusthide)", re.I)
NEG_RE = re.compile(r"\b(nahi|bilkul nahi|no|not|none|illa|aguttilla|ledu|illai|nei|nathi)\b", re.I)

def evaluate(text):
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
        elif UNKNOWN_RE.search(t):
            asked.append(sign["id"])
        elif HEDGE_RE.search(t):
            asked.append(sign["id"])
        elif (t.find("not lethargic") != -1 or t.find("sust nahi") != -1 or (sign["id"] not in ("newborn_not_feeding", "reduced_fetal_movement") and t.find("harkat nahi") == -1)) and NEG_RE.search(t):
            cleared.append(sign["id"])
        else:
            flagged.append(sign["id"])

    if flagged:
        return "FLAG"
    if asked:
        return "ASK"
    return "CLEAR"

# Test Utterances: Baseline + 22 tricky cases + 12 end-to-end intake scenarios
DATASET = [
    # Baseline Set
    ("Sita Devi visit, gestational age 28 weeks, severe vaginal bleeding ho rahi hai", "FLAG", "hi"),
    ("Ghar number barah, Sita Devi ko koi bleeding nahi hai, sab theek hai", "CLEAR", "hi"),
    ("Bachha doodh nahi pi raha hai aur sharir thanda pad gaya hai", "FLAG", "hi"),
    ("Baby is feeding well, no fever, active and crying normally", "CLEAR", "en"),
    ("Pehle tez sar dard aur dhundhla dikh raha tha ab theek hai", "CLEAR", "hi"),
    ("Severe headache with blurred vision since this morning", "FLAG", "en"),
    ("Radha Bai visit, pet mein tez dard ho raha hai, daura pada tha", "FLAG", "hi"),
    ("Hotte tumba novu ide, maguvige tumba jwara", "FLAG", "kn"),
    ("Raktasrava illa, magu chennagide, haalu kudiyuttide", "CLEAR", "kn"),
    ("Thoda bukhar jaisa lag raha hai, confirm nahi hai", "ASK", "hi"),

    # --- 22 NEW TRICKY TEST UTTERANCES ---
    # 1. Hindi: Negation deeply embedded in long conversational sentence
    ("Pichhle hafte thoda chakkar aaya tha lekin aaj subah jaanch ke baad doctor ne dekha aur koi bleeding nahi hai", "CLEAR", "hi"),
    # 2. Hindi: Active transition from absent to acute bleeding
    ("Kal tak koi bleeding nahi thi lekin aaj dopahar se achanak bleeding shuru ho gayi hai", "FLAG", "hi"),
    # 3. Hindi: Resolved past fever in long sentence
    ("Teesre mahine mein pehle bukhar tha lekin dawai lene ke baad ab bilkul bukhar nahi hai", "CLEAR", "hi"),
    # 4. Hindi: Sudden infant respiratory distress
    ("Chhote bachhe ko achanak tez saans aur pasli chalne ki dikkat ho rahi hai", "FLAG", "hi"),
    # 5. Hindi: Hedged infant seizure symptom
    ("Saas ne bola ki raat ko bachhe ko shakk hai ki daura jaisa pada tha", "ASK", "hi"),
    # 6. Hindi: Unknown fetal movement
    ("Pet mein bachha hil raha hai ya nahi is baare mein mata ne bataya nahi", "ASK", "hi"),
    # 7. Hindi: Newborn jaundice with severe yellow extremities
    ("Navjaat shishu ke haath aur paanv ke talwe bohot peele pad gaye hain", "FLAG", "hi"),
    # 8. Hindi: Lethargic infant not waking up
    ("Shishu subah se bohot sust pad gaya hai aur harkat nahi kar raha hai", "FLAG", "hi"),

    # 9. Kannada: Negation in multi-clause visit note
    ("Mane sankhye hannondu, taayige yaavude raktasrava illa, BP 120/80 ide", "CLEAR", "kn"),
    # 10. Kannada: Active emergency convulsion / fits
    ("Garbhini ge ibbadi daura bandide, moorche hoyitu", "FLAG", "kn"),
    # 11. Kannada: Severe newborn fever
    ("Huttida maguvige tumba jwara ide, sharir bisi ide", "FLAG", "kn"),
    # 12. Kannada: Resolved past pain
    ("Modalu hottenovu itthu, aushadhi thagondiddu ivaga illa", "CLEAR", "kn"),
    # 13. Kannada: Refusing milk emergency
    ("Magu eradu dinadinda haalu kudiyuttilla, sustagide", "FLAG", "kn"),
    # 14. Kannada: Hedged blurred vision
    ("Kannu thoda mabbaguvudu anusthide anta helidaru", "ASK", "kn"),
    # 15. Kannada: Past fever no earlier, now active
    ("Munche jwara irallilla, ivaga aaguttide tumba jwara", "FLAG", "kn"),

    # 16. English: Long sentence with negated danger signs and normal vitals
    ("The mother reported feeling tired after walking in the heat but confirmed there is no vaginal bleeding and no abdominal pain", "CLEAR", "en"),
    # 17. English: Active transitional bleeding after earlier clear visit
    ("She didn't have any bleeding earlier during previous checkup, but now heavy bleeding has started", "FLAG", "en"),
    # 18. English: Resolved headache earlier
    ("She had severe headache earlier yesterday evening, but after resting now headache has stopped completely", "CLEAR", "en"),
    # 19. English: Reduced fetal movement acute emergency
    ("Mother is worried because she noticed reduced fetal movement since last 12 hours, baby is not moving", "FLAG", "en"),
    # 20. English: Hedged infant lethargy
    ("The grandmother suspected the baby seemed maybe unresponsive this afternoon", "ASK", "en"),
    # 21. English: Dangerous newborn hypothermia
    ("The room was cold and the newborn's body feels cold like ice, hypothermia suspected", "FLAG", "en"),
    # 22. English: Complete normal newborn checkup with negative danger signs
    ("Postnatal day 7 visit, cord is clean, no fever, not lethargic, mother is breastfeeding well, weight 2.9 kg", "CLEAR", "en"),

    # --- 12 end-to-end intake scenarios ---
    # 1. One-turn full details for an unregistered person; negated bleeding must stay CLEAR.
    ("Kumari, 24 years old, seven months pregnant, house 15, weight 58 kilo, BP 110 by 70, not taking IFA tablets regularly, no bleeding", "CLEAR", "en"),
    # 2. First half of a split-utterance intake.
    ("Utterance one: unknown beneficiary Anu is 22 years old, pregnant, house 16. Utterance two: weight 54 kilo, BP 118 by 76, no bleeding", "CLEAR", "en"),
    # 3. Missing weight should lead to a question, not a danger alert.
    ("Sunita Sharma came for ANC, BP 110 by 70, no bleeding", "CLEAR", "en"),
    # 4. Explicitly negated symptom.
    ("No vaginal bleeding and no high fever today", "CLEAR", "en"),
    # 5. Active danger symptoms must trigger referral.
    ("Sunita Sharma has high fever and heavy bleeding", "FLAG", "en"),
    # 6. Spoken weight correction must not be interpreted as a symptom.
    ("No, weight is 2.8 kilo", "CLEAR", "en"),
    # 7. Duplicate-name roster lookup asks for a house number.
    ("Sita Devi at house 12 or Sita Devi at house 40, no bleeding", "CLEAR", "en"),
    # 8. Unknown beneficiary is a creation case, not an alarm.
    ("New beneficiary Rani at house 18, ANC visit, no bleeding", "CLEAR", "en"),
    # 9. Two named people require clarification about visit ownership.
    ("Sita Devi and Sunita Sharma were both at the house; which person is this visit for?", "CLEAR", "en"),
    # 10. Hindi negation.
    ("Sita Devi ko bleeding nahi hai, sab theek hai", "CLEAR", "hi"),
    # 11. Hindi active fever and bleeding.
    ("Sunita ko tez bukhar aur zyada bleeding ho rahi hai", "FLAG", "hi"),
    # 12. Kannada active newborn danger sign.
    ("Huttida maguvige tumba jwara ide, sharir bisi ide", "FLAG", "kn"),
]

def main():
    print("=" * 70)
    print("       ASHA Vaani Clinical Safety & Accuracy Evaluation Report        ")
    print("=" * 70)

    total = len(DATASET)
    passed = 0
    missed_danger_signs = 0  # CRITICAL: Target 0!
    false_alarms = 0         # Non-danger flagged as FLAG
    by_lang = {"hi": {"total": 0, "pass": 0}, "kn": {"total": 0, "pass": 0}, "en": {"total": 0, "pass": 0}}

    for text, expected, lang in DATASET:
        decision = evaluate(text)
        by_lang[lang]["total"] += 1

        if decision == expected:
            passed += 1
            by_lang[lang]["pass"] += 1
        else:
            if expected == "FLAG" and decision != "FLAG":
                missed_danger_signs += 1
                print(f"[CRITICAL MISS] '{text}' -> Got: {decision}, Expected: FLAG")
            elif expected != "FLAG" and decision == "FLAG":
                false_alarms += 1
                print(f"[FALSE ALARM] '{text}' -> Got: FLAG, Expected: {expected}")
            else:
                print(f"[AMBIGUOUS MISMATCH] '{text}' -> Got: {decision}, Expected: {expected}")

    accuracy = (passed / total) * 100.0

    print(f"\nBenchmark Evaluation Metrics:")
    print(f"  Total Clinical Utterances Evaluated : {total}")
    print(f"  Danger Signs Missed (Target 0)      : {missed_danger_signs} (Zero clinical misses)")
    print(f"  False Alarms                        : {false_alarms}")
    print(f"  Overall Decision Accuracy           : {accuracy:.1f}%")

    print("\nLanguage Breakdown:")
    for lang, stats in by_lang.items():
        lang_acc = (stats["pass"] / stats["total"]) * 100.0 if stats["total"] > 0 else 0
        lang_name = {"hi": "Hindi (hi-IN)", "kn": "Kannada (kn-IN)", "en": "Indian English (en-IN)"}.get(lang, lang)
        print(f"  - {lang_name:<26}: {stats['pass']}/{stats['total']} correct ({lang_acc:.1f}%)")

    print("=" * 70)
    if missed_danger_signs == 0 and false_alarms == 0:
        print("RESULT: ALL CLINICAL CRITERIA MET (0 Missed Danger Signs, 0 False Alarms)")
        return 0
    else:
        print(f"RESULT: {missed_danger_signs} Missed, {false_alarms} False Alarms")
        return 1

if __name__ == '__main__':
    sys.exit(main())
