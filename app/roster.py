"""
Synthetic Beneficiary Roster and Disambiguation Engine for ASHA Vaani.
Includes 30 synthetic records, handling intentional duplicate names and house number disambiguation.
"""

import json
import os
from typing import List, Dict, Any, Optional, Tuple

ROSTER_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "roster.json")

class BeneficiaryRoster:
    def __init__(self, data_path: Optional[str] = None):
        path = data_path or ROSTER_PATH
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                self.records = json.load(f)
        else:
            self.records = []

    def find_beneficiaries(self, query: str) -> List[Dict[str, Any]]:
        """
        Search by name (case-insensitive substring) or exact ID.
        """
        if not query:
            return []
        q = query.strip().lower()

        # Check exact ID first
        for rec in self.records:
            if rec.get("id", "").lower() == q:
                return [rec]

        matches = []
        for rec in self.records:
            name = rec.get("name", "").lower()
            if q in name or name in q:
                matches.append(rec)
        return matches

    def check_roster(self, spoken_name_or_id: str, lang: str = "hi") -> Tuple[str, Optional[Dict[str, Any]], List[Dict[str, Any]], Optional[str]]:
        """
        Returns (status, matched_record, candidate_list, question_prompt)
        status:
          - 'MATCHED': exactly one beneficiary found
          - 'DISAMBIGUATE': multiple matches with same name, needs house number
          - 'NOT_FOUND': no beneficiary found, asks for ID
        """
        matches = self.find_beneficiaries(spoken_name_or_id)

        if len(matches) == 1:
            return "MATCHED", matches[0], matches, None

        if len(matches) > 1:
            # Duplicate names found!
            h_nos = [m.get("house_no", "?") for m in matches]
            name = matches[0].get("name")
            if lang == "hi":
                prompt = f"{name} नाम की दो लाभार्थी हैं - मकान नंबर {h_nos[0]} या मकान नंबर {h_nos[1]}?"
            elif lang == "kn":
                prompt = f"{name} ಹೆಸರಿನ ಇಬ್ಬರು ಫಲಾನುಭವಿಗಳಿದ್ದಾರೆ - ಮನೆ ಸಂಖ್ಯೆ {h_nos[0]} ಅಥವಾ {h_nos[1]}?"
            else:
                prompt = f"Found multiple beneficiaries named {name}. House {h_nos[0]} or House {h_nos[1]}?"
            return "DISAMBIGUATE", None, matches, prompt

        # Not found
        if lang == "hi":
            prompt = "लाभार्थी रजिस्टर में नहीं मिले। कृपया लाभार्थी आईडी बताएं।"
        elif lang == "kn":
            prompt = "ಫಲಾನುಭವಿ ಸಿಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಫಲಾನುಭವಿಯ ಐಡಿ ತಿಳಿಸಿ."
        else:
            prompt = "Beneficiary not found in roster. Please provide beneficiary ID."
        return "NOT_FOUND", None, [], prompt

    def resolve_disambiguation(self, candidate_list: List[Dict[str, Any]], answer_text: str) -> Optional[Dict[str, Any]]:
        """
        Resolves disambiguation from spoken house number or village.
        """
        ans = answer_text.lower()
        for cand in candidate_list:
            h = str(cand.get("house_no", "")).lower()
            if h and (f"house {h}" in ans or f"makan {h}" in ans or f"makan number {h}" in ans or h in ans):
                return cand
        return None
