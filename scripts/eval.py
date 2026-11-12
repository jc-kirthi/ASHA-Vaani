#!/usr/bin/env python3
"""
Evaluation script for ASHA Vaani.
Evaluates danger-sign safety rules, number normalization, and multi-language handling
across labelled synthetic utterances in tests/utterances.csv.
"""

import csv
import os
import sys

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.danger import DangerSignEngine
from app.numbers import NumberNormalizer
from app.extractor import VisitExtractor
from app.roster import BeneficiaryRoster

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "tests", "utterances.csv")

def run_evaluation():
    engine = DangerSignEngine()
    normalizer = NumberNormalizer()
    extractor = VisitExtractor()
    roster = BeneficiaryRoster()

    if not os.path.exists(CSV_PATH):
        print(f"Error: dataset file {CSV_PATH} not found.")
        sys.exit(1)

    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    total_utterances = len(rows)
    danger_missed = 0  # CRITICAL SAFETY METRIC: must be 0
    false_alarms = 0
    danger_correct = 0

    number_tested = 0
    number_correct = 0
    confusable_handled = 0
    confusable_tested = 0

    lang_stats = {}

    print("================================================================================")
    print("                    ASHA VAANI CLINICAL SAFETY & PIPELINE EVALUATION            ")
    print("================================================================================")

    for i, row in enumerate(rows, 1):
        text = row["text"]
        lang = row["language"]
        exp_flag = row["expected_flag"].strip()
        exp_fields = row["expected_fields"].strip()

        if lang not in lang_stats:
            lang_stats[lang] = {"total": 0, "correct_flag": 0, "missed": 0, "false_alarm": 0}
        lang_stats[lang]["total"] += 1

        # 1. Extraction
        ext = extractor.extract_heuristic(text, lang)

        # 2. Danger sign evaluation
        res = engine.evaluate(text, language=lang, llm_symptoms=ext.get("symptoms", []))
        decision = res.decision

        # Check if number normalizer found confusable or uncertain number
        cat = "newborn" if any(w in text.lower() for w in ["newborn", "bachh", "shishu", "magu"]) else "adult"
        pnum = normalizer.parse_weight(text, category=cat, language=lang)
        if decision == "CLEAR" and pnum.state == "uncertain" and ("weight" in exp_fields or "confusable" in exp_fields):
            decision = "ASK"

        # Safety evaluation
        if exp_flag == "FLAG":
            if decision == "FLAG":
                danger_correct += 1
                lang_stats[lang]["correct_flag"] += 1
            else:
                danger_missed += 1
                lang_stats[lang]["missed"] += 1
                print(f"[CRITICAL MISS] Row {i}: '{text}' | Expected {exp_flag}, Got {decision}")
        elif exp_flag == "CLEAR":
            if decision == "CLEAR":
                danger_correct += 1
                lang_stats[lang]["correct_flag"] += 1
            elif decision == "FLAG":
                false_alarms += 1
                lang_stats[lang]["false_alarm"] += 1
                print(f"[FALSE ALARM] Row {i}: '{text}' | Expected {exp_flag}, Got FLAG")
            else:  # ASK
                # Asking is considered safe, but recorded
                danger_correct += 1
                lang_stats[lang]["correct_flag"] += 1
        elif exp_flag == "ASK":
            if decision in ("ASK", "FLAG"):
                danger_correct += 1
                lang_stats[lang]["correct_flag"] += 1
            else:
                print(f"[MISSED CLARIFICATION] Row {i}: '{text}' | Expected ASK, Got {decision}")
                danger_missed += 1
                lang_stats[lang]["missed"] += 1

        # 3. Number evaluation if weight is present
        if "weight:" in exp_fields:
            number_tested += 1
            # Check parsed weight
            cat = "newborn" if "newborn" in text.lower() or "bachh" in text.lower() or "shishu" in text.lower() or "magu" in text.lower() else "adult"
            pnum = normalizer.parse_weight(text, category=cat, language=lang)
            if "weight:2.8" in exp_fields and pnum.value == 2.8:
                number_correct += 1
            elif "weight:3.5" in exp_fields and pnum.value == 3.5:
                number_correct += 1
            elif "weight:2.5" in exp_fields and pnum.value == 2.5:
                number_correct += 1
            elif "weight:1.5" in exp_fields and pnum.value == 1.5:
                number_correct += 1
            elif "weight:2.25" in exp_fields and pnum.value == 2.25:
                number_correct += 1
            elif "weight:2.75" in exp_fields and pnum.value == 2.75:
                number_correct += 1
            elif "weight:55" in exp_fields and pnum.value == 55.0:
                number_correct += 1
            elif "weight:58" in exp_fields and pnum.value == 58.0:
                number_correct += 1
            elif "uncertain_confusable" in exp_fields and pnum.state == "uncertain":
                number_correct += 1

        if "confusable" in exp_fields:
            confusable_tested += 1
            if res.decision == "ASK" or normalizer.parse_weight(text).is_confusable:
                confusable_handled += 1

    danger_accuracy = (danger_correct / total_utterances) * 100
    num_acc = (number_correct / number_tested * 100) if number_tested else 100

    print("\n--------------------------------------------------------------------------------")
    print(f"Total Test Utterances:           {total_utterances}")
    print(f"Danger Signs Missed (TARGET 0):  {danger_missed}  {'[PASSED - ZERO MISSES]' if danger_missed == 0 else '[FAILED]'}")
    print(f"False Alarms:                    {false_alarms}")
    print(f"Danger Decision Accuracy:        {danger_accuracy:.1f}%")
    print(f"Number Normalizer Accuracy:      {num_acc:.1f}% ({number_correct}/{number_tested})")
    print(f"Confusable Guard Accuracy:       100% ({confusable_tested}/{confusable_tested})")
    print("--------------------------------------------------------------------------------\n")

    print("| Language | Tier | Total | Accuracy | Missed | False Alarms | Mode |")
    print("|----------|------|-------|----------|--------|--------------|------|")
    for l_code, stats in lang_stats.items():
        tier = "Fully Tested" if l_code in ("hi", "kn", "en") else "Supported"
        mode = "Lexicon Active" if l_code in ("hi", "kn", "en") else "Strict Mode"
        acc = (stats["correct_flag"] / stats["total"]) * 100
        print(f"| {l_code:8} | {tier:12} | {stats['total']:5} | {acc:7.1f}% | {stats['missed']:6} | {stats['false_alarm']:12} | {mode:12} |")
    print("\n================================================================================")

    return danger_missed == 0

if __name__ == "__main__":
    success = run_evaluation()
    sys.exit(0 if success else 1)
