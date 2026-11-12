"""
Dual-method Number Normalizer and Confusable Guard for ASHA Vaani.
Parses Indian spoken fractions and colloquial numbers:
- 'saade teen' -> 3.5
- 'dhai kilo' -> 2.5
- 'dedh' -> 1.5
- 'sawa do' -> 2.25
- 'paune teen' -> 2.75
- 'do aath' -> 2.8
- '2 kilo 800 gram' -> 2.8
- 'two point eight' -> 2.8
Performs plausibility validation and confusable word detection.
"""

import re
from typing import Optional, Dict, Any, Tuple, List
from dataclasses import dataclass

HINDI_BASE_NUMS = {
    "ek": 1, "do": 2, "teen": 3, "chaar": 4, "paanch": 5,
    "cheh": 6, "chhe": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
    "gyarah": 11, "baarah": 12, "terah": 13, "chaudah": 14, "pandrah": 15,
    "solah": 16, "satrah": 17, "athaarah": 18, "unnees": 19, "bees": 20,
    "tees": 30, "chaalis": 40, "pachaas": 50, "saath": 60, "sattar": 70,
    "assi": 80, "navve": 90, "sau": 100
}

KANNADA_BASE_NUMS = {
    "ondu": 1, "ondhu": 1, "eradu": 2, "mooru": 3, "naalku": 4, "aydu": 5, "aidu": 5,
    "aaru": 6, "elu": 7, "entu": 8, "ombattu": 9, "hattu": 10,
    "hannondu": 11, "hanneradu": 12, "hadimooru": 13, "hadinaalku": 14, "hadinaidu": 15,
    "hadinaaru": 16, "hadinelu": 17, "hadinentu": 18, "hattombattu": 19, "ippattu": 20,
    "moovattu": 30, "nalavattu": 40, "aivattu": 50, "aravattu": 60, "eppattu": 70,
    "embattu": 80, "tombattu": 90, "nooru": 100
}

ENGLISH_BASE_NUMS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
    "eighty": 80, "ninety": 90, "hundred": 100
}

CONFUSABLE_MAP = {
    "hi": [
        {"words": ["saat", "saath"], "values": [7, 60], "prompt": "सात (7) या साठ (60)?"},
        {"words": ["chaar", "chaalis"], "values": [4, 40], "prompt": "चार (4) या चालीस (40)?"},
        {"words": ["tees"], "values": [3, 30], "prompt": "तीन (3) या तीस (30)?"},
        {"words": ["navve"], "values": [9, 90], "prompt": "नौ (9) या नब्बे (90)?"},
        {"words": ["pandrah", "pachaas"], "values": [15, 50], "prompt": "पंद्रह (15) या पचास (50)?"}
    ],
    "kn": [
        {"words": ["moovattu"], "values": [3, 30], "prompt": "ಮೂರು (3) ಅಥವಾ ಮೂವತ್ತು (30)?"},
        {"words": ["nalavattu"], "values": [4, 40], "prompt": "ನಾಲ್ಕು (4) ಅಥವಾ ನಲವತ್ತು (40)?"},
        {"words": ["aravattu"], "values": [6, 60], "prompt": "ಆರು (6) ಅಥವಾ ಅರವತ್ತು (60)?"},
        {"words": ["eppattu"], "values": [7, 70], "prompt": "ಏಳು (7) ಅಥವಾ ಎಪ್ಪತ್ತು (70)?"},
        {"words": ["embattu"], "values": [8, 80], "prompt": "ಎಂಟು (8) ಅಥವಾ ಎಂಬತ್ತು (80)?"},
        {"words": ["tombattu"], "values": [9, 90], "prompt": "ಒಂಬತ್ತು (9) ಅಥವಾ ತೊಂಬತ್ತು (90)?"}
    ],
    "en": [
        {"words": ["fifteen", "fifty"], "values": [15, 50], "prompt": "one five (15) or five zero (50)?"},
        {"words": ["fourteen", "forty"], "values": [14, 40], "prompt": "one four (14) or four zero (40)?"},
        {"words": ["thirteen", "thirty"], "values": [13, 30], "prompt": "one three (13) or three zero (30)?"},
        {"words": ["sixteen", "sixty"], "values": [16, 60], "prompt": "one six (16) or six zero (60)?"},
        {"words": ["seventeen", "seventy"], "values": [17, 70], "prompt": "one seven (17) or seven zero (70)?"},
        {"words": ["eighteen", "eighty"], "values": [18, 80], "prompt": "one eight (18) or eight zero (80)?"},
        {"words": ["nineteen", "ninety"], "values": [19, 90], "prompt": "one nine (19) or nine zero (90)?"}
    ]
}

@dataclass
class ParsedNumberResult:
    value: Optional[float]
    raw_text: str
    method1_value: Optional[float]  # Rule / colloquial fraction parser
    method2_value: Optional[float]  # Standard float / digit parser
    is_plausible: bool
    is_confusable: bool
    confusable_prompt: Optional[str]
    state: str  # "confirmed", "uncertain", "missing"
    explanation: str

class NumberNormalizer:
    def __init__(self):
        pass

    def parse_weight(
        self,
        text: str,
        category: str = "newborn",
        language: str = "hi",
        llm_value: Optional[float] = None
    ) -> ParsedNumberResult:
        """
        Parse weight using dual independent methods.
        category: 'newborn' (0.8 - 6.0 kg) or 'adult'/'ANC' (30.0 - 130.0 kg).
        """
        if not text or not text.strip():
            return ParsedNumberResult(
                value=None,
                raw_text="",
                method1_value=None,
                method2_value=None,
                is_plausible=False,
                is_confusable=False,
                confusable_prompt=None,
                state="missing",
                explanation="No weight utterance provided"
            )

        text_clean = text.lower().strip()

        # Method 1: Spoken / Indic fraction & colloquial parser
        m1_val = self._parse_spoken_fractions(text_clean, language)

        # Method 2: Standard digit / decimal / compound unit parser
        m2_val = self._parse_standard_digits(text_clean)

        # Candidate value selection
        chosen_val = None
        if m1_val is not None and m2_val is not None:
            # If both agree within 0.05
            if abs(m1_val - m2_val) <= 0.05:
                chosen_val = m1_val
            else:
                chosen_val = m1_val  # candidate, but mismatch will trigger uncertain
        elif m1_val is not None:
            chosen_val = m1_val
        elif m2_val is not None:
            chosen_val = m2_val
        elif llm_value is not None:
            chosen_val = float(llm_value)

        # Plausibility bounds
        if category == "newborn":
            min_wt, max_wt = 0.8, 6.0
        else:
            min_wt, max_wt = 30.0, 130.0

        is_plausible = False
        if chosen_val is not None:
            is_plausible = (min_wt <= chosen_val <= max_wt)

        # Confusable number check
        is_confusable, conf_prompt = self._check_confusables(text_clean, language)

        # State determination
        state = "confirmed"
        reasons = []

        if chosen_val is None:
            state = "missing"
            reasons.append("could_not_parse_number")
        elif not is_plausible:
            state = "uncertain"
            reasons.append(f"implausible_weight_{chosen_val}_outside_{min_wt}-{max_wt}kg")
        elif m1_val is not None and m2_val is not None and abs(m1_val - m2_val) > 0.05:
            state = "uncertain"
            reasons.append(f"dual_method_mismatch_m1_{m1_val}_vs_m2_{m2_val}")
        elif llm_value is not None and abs(chosen_val - float(llm_value)) > 0.1:
            state = "uncertain"
            reasons.append(f"normalizer_llm_mismatch_{chosen_val}_vs_{llm_value}")
        elif is_confusable:
            state = "uncertain"
            reasons.append("sound_alike_confusable_detected")

        explanation = "; ".join(reasons) if reasons else "valid_and_confirmed"

        return ParsedNumberResult(
            value=round(chosen_val, 2) if chosen_val is not None else None,
            raw_text=text,
            method1_value=m1_val,
            method2_value=m2_val,
            is_plausible=is_plausible,
            is_confusable=is_confusable,
            confusable_prompt=conf_prompt,
            state=state,
            explanation=explanation
        )

    def _parse_spoken_fractions(self, text: str, lang: str) -> Optional[float]:
        """
        Parses colloquial Hindi/Indic spoken fractions:
        - 'dhai' -> 2.5
        - 'dedh' -> 1.5
        - 'saade teen' -> 3.5
        - 'sawa do' -> 2.25
        - 'paune teen' -> 2.75
        - 'do aath' -> 2.8
        - Kannada: 'mooru vare' -> 3.5, 'ondhu vare' -> 1.5, 'eradu vare' -> 2.5
        """
        # Exact colloquial keywords
        if re.search(r"\b(dhai|dhaai|dhayi)\b", text):
            return 2.5
        if re.search(r"\b(dedh|deadh)\b", text):
            return 1.5

        # 'saade <num>' -> num + 0.5 (e.g. saade teen -> 3.5, saade chaar -> 4.5)
        m_saade = re.search(r"\b(saade|saadhe|sade)\s+([a-z0-9]+)\b", text)
        if m_saade:
            num_word = m_saade.group(2)
            base = HINDI_BASE_NUMS.get(num_word)
            if base is None and num_word.isdigit():
                base = int(num_word)
            if base is not None:
                return float(base) + 0.5

        # 'sawa <num>' -> num + 0.25 (e.g. sawa do -> 2.25)
        m_sawa = re.search(r"\b(sawa|sawwa)\s+([a-z0-9]+)\b", text)
        if m_sawa:
            num_word = m_sawa.group(2)
            base = HINDI_BASE_NUMS.get(num_word)
            if base is None and num_word.isdigit():
                base = int(num_word)
            if base is not None:
                return float(base) + 0.25

        # 'paune <num>' -> (num - 1) + 0.75 (e.g. paune teen -> 2.75)
        m_paune = re.search(r"\b(paune|paunein)\s+([a-z0-9]+)\b", text)
        if m_paune:
            num_word = m_paune.group(2)
            base = HINDI_BASE_NUMS.get(num_word)
            if base is None and num_word.isdigit():
                base = int(num_word)
            if base is not None:
                return float(base) - 0.25

        # 'do aath' -> 2.8 (spoken decimal without word 'point')
        m_pair = re.search(r"\b(ek|do|teen|chaar|paanch)\s+(ek|do|teen|chaar|paanch|cheh|saat|aath|nau)\b", text)
        if m_pair:
            w1, w2 = m_pair.group(1), m_pair.group(2)
            d1 = HINDI_BASE_NUMS.get(w1)
            d2 = HINDI_BASE_NUMS.get(w2)
            if d1 is not None and d2 is not None and d1 <= 5:
                return float(f"{d1}.{d2}")

        # Kannada spoken numbers: 'ondhu vare' -> 1.5, 'eradu vare' -> 2.5, 'mooru vare' -> 3.5
        m_kn_vare = re.search(r"\b([a-z]+)\s+vare\b", text)
        if m_kn_vare:
            w = m_kn_vare.group(1)
            b = KANNADA_BASE_NUMS.get(w)
            if b is not None:
                return float(b) + 0.5

        # Kannada point: 'eradu point entu' -> 2.8
        m_kn_point = re.search(r"\b([a-z]+)\s+point\s+([a-z]+)\b", text)
        if m_kn_point:
            w1, w2 = m_kn_point.group(1), m_kn_point.group(2)
            d1 = KANNADA_BASE_NUMS.get(w1)
            d2 = KANNADA_BASE_NUMS.get(w2)
            if d1 is not None and d2 is not None:
                return float(f"{d1}.{d2}")

        # English spoken: 'two point eight' -> 2.8, 'three point five' -> 3.5
        m_en_point = re.search(r"\b([a-z]+)\s+point\s+([a-z0-9]+)\b", text)
        if m_en_point:
            w1, w2 = m_en_point.group(1), m_en_point.group(2)
            d1 = ENGLISH_BASE_NUMS.get(w1)
            d2 = ENGLISH_BASE_NUMS.get(w2)
            if d2 is None and w2.isdigit():
                d2 = int(w2)
            if d1 is not None and d2 is not None:
                return float(f"{d1}.{d2}")

        # Single spoken base number word in text (e.g. 'saath', 'saat', 'tees', 'paanch', 'three')
        words = re.findall(r"\b[a-z]+\b", text)
        for w in words:
            if w in HINDI_BASE_NUMS:
                return float(HINDI_BASE_NUMS[w])
            if w in KANNADA_BASE_NUMS:
                return float(KANNADA_BASE_NUMS[w])
            if w in ENGLISH_BASE_NUMS:
                return float(ENGLISH_BASE_NUMS[w])

        return None

    def _parse_standard_digits(self, text: str) -> Optional[float]:
        """
        Parses numeric digits:
        - '2.8'
        - '2 kilo 800 gram' -> 2.8
        - '2 kg 500 gm' -> 2.5
        - '3 kilo' -> 3.0
        """
        # Compound kilo + gram: '2 kilo 800 gram' or '2kg 800g'
        m_comp = re.search(r"(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilogram)s?\s*(?:and\s*)?(\d+)\s*(?:gram|gm|g)s?", text)
        if m_comp:
            kg = float(m_comp.group(1))
            gm = float(m_comp.group(2))
            return kg + (gm / 1000.0)

        # Standard decimal digits: '2.8' or '2.80' or '52.5'
        m_dec = re.search(r"\b(\d+\.\d+)\b", text)
        if m_dec:
            return float(m_dec.group(1))

        # Plain integer followed by kilo: '3 kilo', '45 kg'
        m_kilo = re.search(r"\b(\d+)\s*(?:kg|kilo|kilogram|kilos)\b", text)
        if m_kilo:
            return float(m_kilo.group(1))

        # Just plain number if isolated
        m_num = re.search(r"\b(\d+)\b", text)
        if m_num:
            return float(m_num.group(1))

        return None

    def _check_confusables(self, text: str, lang: str) -> Tuple[bool, Optional[str]]:
        """
        Detects confusable number words (e.g. saat/saath, chaar/chaalis, pandrah/pachaas).
        Compounds with 'saade', 'sawa', 'paune' are unambiguous fractions, so exclude them.
        """
        norm_lang = lang.lower().split("-")[0] if lang else "hi"
        pairs = CONFUSABLE_MAP.get(norm_lang, CONFUSABLE_MAP.get("hi", []))

        # If it's a fractional compound like "saade teen", it is unambiguously 3.5, not 30
        if re.search(r"\b(saade|sade|sawa|paune)\b", text):
            # Still check for direct high-risk sound-alikes if present
            if re.search(r"\b(saath|chaalis|tees|navve|pachaas|assi|bees)\b", text):
                return True, "क्या आपने साठ (60) या सात (7) कहा?"
            return False, None

        for item in pairs:
            for w in item["words"]:
                # Check for exact word presence
                if re.search(rf"\b{re.escape(w)}\b", text):
                    return True, item["prompt"]

        return False, None
