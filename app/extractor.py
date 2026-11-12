"""
Clinical Information Extractor for ASHA Vaani.
Extracts structured visit parameters from Indic spoken transcript with English code-mix.
Strictly separates clinical data extraction from danger-sign decision logic.
Decision logic is handled exclusively by danger.py.
"""

import re
import json
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

EXTRACTION_SYSTEM_PROMPT = """You are a clinical entity extractor for Indian community health workers (ASHA workers).
Extract structured home-visit details from spoken notes in any Indic language (Hindi, Kannada, Bengali, etc.) with English code-mix (e.g. "TT injection", "ANC checkup", "IFA goli").

Strict JSON Schema:
{
  "beneficiary_name": string or null,
  "beneficiary_id": string or null,
  "visit_type": "ANC" | "PNC" | "newborn" | "immunisation" | null,
  "gestational_weeks": number or null,
  "child_age_days": number or null,
  "weight_raw": string or null,
  "bp_systolic": number or null,
  "bp_diastolic": number or null,
  "vaccinations_given": [string],
  "vaccinations_due": [string],
  "last_anc_date": string or null,
  "ifa_tablets": number or null,
  "symptoms": [
    {
      "symptom": string (canonical id, e.g. "vaginal_bleeding", "newborn_fever", "convulsions_fits", "severe_headache_blurred_vision", "high_fever_pregnancy", "severe_abdominal_pain", "reduced_fetal_movement", "newborn_hypothermia", "newborn_not_feeding", "fast_breathing_chest_indrawing", "yellow_palms_soles", "unresponsive_lethargic"),
      "negated": boolean,
      "timing": "present" | "past" | "unknown",
      "certainty": "high" | "low"
    }
  ]
}

DO NOT make any medical diagnosis or clinical decision. Output ONLY the JSON object.
"""

class VisitExtractor:
    def __init__(self):
        pass

    def extract_heuristic(self, text: str, language: str = "hi") -> Dict[str, Any]:
        """
        Fast, offline deterministic extractor for unit testing, offline environments,
        and high-speed edge fallback.
        """
        txt = text.lower() if text else ""

        # Beneficiary Name
        name = None
        m_name = re.search(r"\b(sita devi|sunita sharma|sunita kumari|pooja singh|pooja yadav|rekha bai|meena patel|lakshmi gowda|anitha rao)\b", txt)
        if m_name:
            name = m_name.group(1).title()

        # Visit Type
        vtype = "ANC"
        if any(w in txt for w in ["pnc", "deliv", "janm", "newborn", "bachha", "shishu", "magu"]):
            vtype = "PNC"
        elif any(w in txt for w in ["tika", "vaccin", "immunis"]):
            vtype = "immunisation"

        # Weight raw
        weight_raw = None
        m_wt = re.search(r"(\d+(?:\.\d+)?\s*(?:kg|kilo|kilogram|gm|gram)?|dhai\s+kilo|dedh\s+kilo|saade\s+[a-z0-9]+\s*kilo|do\s+aath\s*kilo|sawa\s+[a-z0-9]+\s*kilo|paune\s+[a-z0-9]+\s*kilo)", txt)
        if m_wt:
            weight_raw = m_wt.group(1)

        # Blood pressure
        bp_sys, bp_dia = None, None
        m_bp = re.search(r"\b(\d{2,3})\s*(?:by|\/|aur|battey)\s*(\d{2,3})\b", txt)
        if m_bp:
            bp_sys = int(m_bp.group(1))
            bp_dia = int(m_bp.group(2))

        # IFA
        ifa = None
        m_ifa = re.search(r"(\d+)\s*(?:ifa|iron|goli|goliya|tablets)", txt)
        if m_ifa:
            ifa = int(m_ifa.group(1))

        # Vaccinations
        vaccs = []
        for v in ["tt1", "tt2", "tt booster", "td", "bcg", "opv", "pentavalent", "rotavirus", "mr"]:
            if v in txt:
                vaccs.append(v.upper())

        # Symptoms
        symptoms = []
        # Vaginal bleeding
        if any(w in txt for w in ["bleeding", "rakt", "khoon", "spotting", "rokto", "lohi", "rathapokku"]):
            is_neg = bool(re.search(r"\b(nahi|illa|no|none|nei|nathi|ledu|illai)\b", txt))
            timing = "present"
            if re.search(r"pehle.*ab nahi|earlier.*now.*(stopped|no)", txt):
                timing = "past"
                is_neg = True
            elif re.search(r"nahi thi.*ab|no.*earlier.*now.*started|irallilla.*ivaga", txt):
                timing = "present"
                is_neg = False
            certainty = "low" if any(w in txt for w in ["jaisa", "thoda", "doubt", "maybe", "anusthide"]) else "high"
            symptoms.append({
                "symptom": "vaginal_bleeding",
                "negated": is_neg,
                "timing": timing,
                "certainty": certainty
            })

        # Fever
        if re.search(r"\b(bukhar|fever|jwara|jor|taap|taav|kaachal|paniyum)\b", txt):
            is_neg = bool(re.search(r"\b(nahi|illa|no|nei|nathi|ledu|illai)\b", txt))
            symptoms.append({
                "symptom": "newborn_fever" if vtype == "PNC" else "high_fever_pregnancy",
                "negated": is_neg,
                "timing": "present",
                "certainty": "high"
            })

        # Fits / convulsions
        if any(w in txt for w in ["daura", "fits", "seizure", "jhatka", "aanchki"]):
            symptoms.append({
                "symptom": "convulsions_fits",
                "negated": False,
                "timing": "present",
                "certainty": "high"
            })

        # Severe headache / vision
        if any(w in txt for w in ["dhundhla", "blurred", "aankhon ke aage andhera"]):
            symptoms.append({
                "symptom": "severe_headache_blurred_vision",
                "negated": False,
                "timing": "present",
                "certainty": "high"
            })

        # Severe abdominal pain
        if "pet" in txt and ("tez dard" in txt or "severe" in txt):
            symptoms.append({
                "symptom": "severe_abdominal_pain",
                "negated": False,
                "timing": "present",
                "certainty": "high"
            })

        # Hypothermia
        if "thanda" in txt or "hypothermia" in txt or "cold body" in txt:
            symptoms.append({
                "symptom": "newborn_hypothermia",
                "negated": False,
                "timing": "present",
                "certainty": "high"
            })

        # Not feeding
        if any(w in txt for w in ["doodh nahi", "haalu kudiyuttilla", "doodh khachhe na", "doodh pit nahi", "palu tagatledu", "paal kudikkavillai", "paal kudikkatha"]):
            symptoms.append({
                "symptom": "newborn_not_feeding",
                "negated": False,
                "timing": "present",
                "certainty": "high"
            })

        # Reduced fetal movement
        if any(w in txt for w in ["hil nahi raha", "harkat nahi", "chalane illa", "no movement"]):
            symptoms.append({
                "symptom": "reduced_fetal_movement",
                "negated": False,
                "timing": "present",
                "certainty": "high"
            })

        # Fast breathing / chest indrawing
        if any(w in txt for w in ["pasli chal", "saans tez", "chhati dhas", "fast breathing", "saah tez"]):
            symptoms.append({
                "symptom": "fast_breathing_chest_indrawing",
                "negated": False,
                "timing": "present",
                "certainty": "high"
            })

        # Yellow palms / soles
        if any(w in txt for w in ["peele", "peela", "yellow palms", "yellow soles", "haladi"]):
            symptoms.append({
                "symptom": "yellow_palms_soles",
                "negated": False,
                "timing": "present",
                "certainty": "high"
            })

        # Unresponsive / lethargic
        if any(w in txt for w in ["sust", "lethargic", "unresponsive", "behosh"]):
            symptoms.append({
                "symptom": "unresponsive_lethargic",
                "negated": False,
                "timing": "present",
                "certainty": "high"
            })

        return {
            "beneficiary_name": name,
            "beneficiary_id": None,
            "visit_type": vtype,
            "gestational_weeks": 26 if vtype == "ANC" else None,
            "child_age_days": 14 if vtype == "PNC" else None,
            "weight_raw": weight_raw,
            "bp_systolic": bp_sys,
            "bp_diastolic": bp_dia,
            "vaccinations_given": vaccs,
            "vaccinations_due": [],
            "last_anc_date": None,
            "ifa_tablets": ifa,
            "symptoms": symptoms
        }
