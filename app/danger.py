"""
Deterministic Danger Sign Rule Engine for ASHA Vaani.
All danger-sign decisions are strictly deterministic rules - never LLM hallucinations.
Decision output: FLAG, CLEAR, ASK.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any
import re
import os

@dataclass
class DangerSignSource:
    document_title: str
    version: str
    section_or_page: str

@dataclass
class DangerSignDefinition:
    id: str
    name: str
    applies_to: str
    severity: str
    source: DangerSignSource
    synonyms: Dict[str, List[str]] = field(default_factory=dict)

# 10+ Standard Danger Signs from MoHFW / NHM / HBNC Guidelines
DANGER_SIGNS_DB: Dict[str, DangerSignDefinition] = {
    "vaginal_bleeding": DangerSignDefinition(
        id="vaginal_bleeding",
        name="Vaginal Bleeding",
        applies_to="pregnancy",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW ASHA Training Module 6 - Maternal Health]",
            version="[TODO: NHM Guidelines 2020 Revision]",
            section_or_page="[TODO: Section 3.2, Page 28]"
        ),
        synonyms={
            "en": ["vaginal bleeding", "bleeding", "spotting", "blood discharge", "hemorrhage"],
            "hi": ["bleeding", "rakt sraav", "khoon aana", "khoon ja raha", "khoon beh raha", "spotting", "khoon"],
            "kn": ["rakthasrava", "nettharu", "bleeding", "raktha hoguttide", "raktha srava"]
        }
    ),
    "convulsions_fits": DangerSignDefinition(
        id="convulsions_fits",
        name="Convulsions / Fits (Eclampsia)",
        applies_to="pregnancy",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW ASHA Training Module 6 - High Risk Pregnancy]",
            version="[TODO: NHM 2020 Revision]",
            section_or_page="[TODO: Section 4.1, Page 34]"
        ),
        synonyms={
            "en": ["convulsions", "fits", "seizures", "shivering fits", "eclampsia"],
            "hi": ["daura", "jhatka", "fits", "mirgi jaisa", "aenthan", "chakkar kha kar girna"],
            "kn": ["fits", "moorche", "seizure", "jathaka"]
        }
    ),
    "severe_headache_blurred_vision": DangerSignDefinition(
        id="severe_headache_blurred_vision",
        name="Severe Headache with Blurred Vision",
        applies_to="pregnancy",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW ASHA Training Module 6 - High Risk Pregnancy]",
            version="[TODO: NHM 2020 Revision]",
            section_or_page="[TODO: Section 4.2, Page 36]"
        ),
        synonyms={
            "en": ["severe headache", "blurred vision", "headache and vision blur", "blurring of vision"],
            "hi": ["tez sar dard", "sar mein bhari dard", "dhundhla dikhna", "aankhon ke aage andhera"],
            "kn": ["tumba thale novu", "kannu mabbaguvudu", "drishti thondare"]
        }
    ),
    "high_fever_pregnancy": DangerSignDefinition(
        id="high_fever_pregnancy",
        name="High Fever during Pregnancy / Sepsis",
        applies_to="pregnancy",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW Guidelines on Obstetric Emergencies]",
            version="[TODO: MoHFW 2019]",
            section_or_page="[TODO: Chapter 5, Page 52]"
        ),
        synonyms={
            "en": ["high fever", "chills and fever", "very hot body", "severe fever"],
            "hi": ["tez bukhar", "bahut tej bukhar", "thandi lag kar bukhar", "badan tap raha hai"],
            "kn": ["tumba jwara", "bhari jwara", "mai tumba bisi"]
        }
    ),
    "severe_abdominal_pain": DangerSignDefinition(
        id="severe_abdominal_pain",
        name="Severe Abdominal Pain",
        applies_to="pregnancy",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW ASHA Training Module 6 - Complications]",
            version="[TODO: NHM 2020]",
            section_or_page="[TODO: Section 3.5, Page 31]"
        ),
        synonyms={
            "en": ["severe abdominal pain", "severe stomach ache", "acute belly pain", "severe pain in abdomen"],
            "hi": ["pet mein tez dard", "pet ka asahaniya dard", "kokh mein dard", "pet dard bahut jyada"],
            "kn": ["hotte tumba novu", "hotte uri novu", "katina hotte novu"]
        }
    ),
    "reduced_fetal_movement": DangerSignDefinition(
        id="reduced_fetal_movement",
        name="Reduced or Absent Fetal Movement",
        applies_to="pregnancy",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW MCP Card Antenatal Danger Signs]",
            version="[TODO: MCP Card 2021]",
            section_or_page="[TODO: Page 8, Fetal Monitoring]"
        ),
        synonyms={
            "en": ["reduced fetal movement", "no baby movement", "baby not kicking", "decreased movement"],
            "hi": ["bachhe ki harkat kam", "bachha hil nahi raha", "movement kam hai", "harkat nahi ho rahi"],
            "kn": ["maguvina chalane kadime", "chalane illa", "magu chalane niliside"]
        }
    ),
    "newborn_fever": DangerSignDefinition(
        id="newborn_fever",
        name="Newborn High Fever",
        applies_to="newborn",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW Home Based New Born Care (HBNC) Operational Guidelines]",
            version="[TODO: HBNC Revised 2021]",
            section_or_page="[TODO: Card 3, Danger Signs, Page 19]"
        ),
        synonyms={
            "en": ["newborn fever", "baby has fever", "baby hot to touch", "infant fever"],
            "hi": ["bachhe ko bukhar", "tez bukhar newborn", "garam sharir", "bachhe ka badan tap raha"],
            "kn": ["maguvige jwara", "kayisida mai", "magu bisi ide"]
        }
    ),
    "newborn_hypothermia": DangerSignDefinition(
        id="newborn_hypothermia",
        name="Very Cold Body (Hypothermia)",
        applies_to="newborn",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW HBNC Training Guidelines]",
            version="[TODO: HBNC 2021]",
            section_or_page="[TODO: Chapter 4, Cold Injury, Page 22]"
        ),
        synonyms={
            "en": ["cold body", "hypothermia", "baby feels very cold", "cold feet and hands"],
            "hi": ["sharir thanda padna", "bachha bilkul thanda", "thanda sharir", "bachha thanda pad gaya"],
            "kn": ["mai thampaaguvudu", "magu sheetha", "mai thandi ide"]
        }
    ),
    "newborn_not_feeding": DangerSignDefinition(
        id="newborn_not_feeding",
        name="Unable to Feed or Suckle",
        applies_to="newborn",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW HBNC Protocol - Sepsis and Feeding Assessment]",
            version="[TODO: HBNC 2021]",
            section_or_page="[TODO: Page 25, Table 2]"
        ),
        synonyms={
            "en": ["not feeding", "unable to suckle", "baby refusing milk", "stopped suckling"],
            "hi": ["doodh nahi pee raha", "doodh peena band", "feed nahi kar raha", "chhati nahi pakad raha"],
            "kn": ["haalu kudiyuttilla", "feeding madtilla", "haalu bekaagilla"]
        }
    ),
    "fast_breathing_chest_indrawing": DangerSignDefinition(
        id="fast_breathing_chest_indrawing",
        name="Fast Breathing or Chest Indrawing",
        applies_to="newborn",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW HBNC Protocol - Acute Respiratory Infection]",
            version="[TODO: HBNC 2021]",
            section_or_page="[TODO: Page 27, Respiratory Count > 60/min]"
        ),
        synonyms={
            "en": ["fast breathing", "chest indrawing", "rapid breathing", "stridor"],
            "hi": ["saans tez chalna", "chhati dhasna", "pasli chalna", "saans phoolna", "tez saans"],
            "kn": ["vegavada usirata", "edeyalli ellu dhabbuvudu", "usiradata vegavagide"]
        }
    ),
    "yellow_palms_soles": DangerSignDefinition(
        id="yellow_palms_soles",
        name="Yellow Palms and Soles (Severe Jaundice)",
        applies_to="newborn",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW HBNC Protocol - Neonatal Jaundice]",
            version="[TODO: HBNC 2021]",
            section_or_page="[TODO: Page 31, Zone 5 Jaundice]"
        ),
        synonyms={
            "en": ["yellow palms", "yellow soles", "severe jaundice", "yellow skin on feet"],
            "hi": ["hath paon peele", "peela pad gaya", "hatheli peeli", "taluve peele", "peeliya"],
            "kn": ["haladi aralu", "haladi kai mathu kaalu", "kaamalegallu"]
        }
    ),
    "unresponsive_lethargic": DangerSignDefinition(
        id="unresponsive_lethargic",
        name="Lethargic or Unresponsive",
        applies_to="newborn",
        severity="emergency",
        source=DangerSignSource(
            document_title="[TODO: Verify MoHFW HBNC Protocol - Sepsis and Encephalopathy]",
            version="[TODO: HBNC 2021]",
            section_or_page="[TODO: Page 33, Activity Check]"
        ),
        synonyms={
            "en": ["lethargic", "unresponsive", "not moving", "floppy baby", "excessive sleepiness"],
            "hi": ["sust pad gaya", "koi harkat nahi", "hosh nahi hai", "bachha dhel", "behoshi"],
            "kn": ["susthagiddane", "chatanavilla", "echharavilla"]
        }
    )
}

@dataclass
class DangerSignResult:
    decision: str  # "FLAG", "CLEAR", "ASK"
    flagged_signs: List[Dict[str, Any]] = field(default_factory=list)
    clarification_questions: List[str] = field(default_factory=list)
    referral_slip: Optional[str] = None
    lexicon_mode: str = "lexicon: active"
    rule_fired: Optional[str] = None
    evidence: List[Dict[str, Any]] = field(default_factory=list)

class DangerSignEngine:
    def __init__(self, db: Optional[Dict[str, DangerSignDefinition]] = None):
        self.db = db or DANGER_SIGNS_DB
        self.fully_tested_languages = {"hi", "kn", "en"}

    def normalize_lang(self, lang: str) -> str:
        if not lang:
            return "hi"
        code = lang.lower().split("-")[0]
        return code

    def evaluate(
        self,
        text: str,
        language: str = "hi-IN",
        llm_symptoms: Optional[List[Dict[str, Any]]] = None,
        beneficiary_name: str = "Beneficiary",
        beneficiary_id: str = "ID-Pending",
        worker_id: str = "ASHA-001"
    ) -> DangerSignResult:
        """
        Evaluate danger signs with strict deterministic safety rules.
        Timing and negation order:
        - 'nahi thi, ab ho rahi hai' => FLAG
        - 'pehle thi, ab nahi' => CLEAR
        - 'thoda bleeding jaisa' => ASK
        - 'bataya nahi' => unknown, not negative
        """
        norm_lang = self.normalize_lang(language)
        is_strict = norm_lang not in self.fully_tested_languages
        lexicon_status = "lexicon: active" if not is_strict else "lexicon: none, strict mode"

        flagged = []
        questions = []
        evidence_list = []
        rule_fired = None

        text_lower = text.lower() if text else ""

        # Step 1: Lexicon matching if supported
        lexicon_matches: Dict[str, Dict[str, Any]] = {}
        if not is_strict:
            for sign_id, definition in self.db.items():
                syns = definition.synonyms.get(norm_lang, []) + definition.synonyms.get("en", [])
                for syn in syns:
                    pos = text_lower.find(syn.lower())
                    if pos != -1:
                        # Extract context window around match (approx 35 chars before and after)
                        start = max(0, pos - 40)
                        end = min(len(text_lower), pos + len(syn) + 40)
                        ctx = text_lower[start:end]
                        lexicon_matches[sign_id] = {
                            "sign_id": sign_id,
                            "match_term": syn,
                            "context": ctx,
                            "offset": [pos, pos + len(syn)]
                        }
                        break

        # Step 2: Combine LLM canonical symptom extractions
        combined_candidates = set(lexicon_matches.keys())
        if llm_symptoms:
            for item in llm_symptoms:
                sym_id = item.get("symptom")
                if sym_id in self.db:
                    combined_candidates.add(sym_id)

        # If nothing detected at all
        if not combined_candidates:
            return DangerSignResult(
                decision="CLEAR",
                lexicon_mode=lexicon_status,
                rule_fired="no_danger_signs_detected"
            )

        # Step 3: Evaluate each candidate deterministically
        for sign_id in combined_candidates:
            definition = self.db[sign_id]
            lex_info = lexicon_matches.get(sign_id)
            llm_info = None
            if llm_symptoms:
                for item in llm_symptoms:
                    if item.get("symptom") == sign_id:
                        llm_info = item
                        break

            # Analyze negation and temporal order
            temporal_analysis = self._analyze_temporal_negation(text_lower, lex_info, llm_info, norm_lang)
            state = temporal_analysis["state"]  # "FLAG", "CLEAR", "ASK"
            reason = temporal_analysis["reason"]
            evidence_item = {
                "sign_id": sign_id,
                "name": definition.name,
                "state": state,
                "reason": reason,
                "source": {
                    "document": definition.source.document_title,
                    "version": definition.source.version,
                    "section": definition.source.section_or_page
                }
            }
            evidence_list.append(evidence_item)

            if state == "FLAG":
                flagged.append({
                    "id": sign_id,
                    "name": definition.name,
                    "applies_to": definition.applies_to,
                    "severity": definition.severity,
                    "reason": reason,
                    "source": definition.source.__dict__
                })
                rule_fired = f"FLAGGED_{sign_id}_{reason}"
            elif state == "ASK":
                q_text = self._build_clarification_question(definition, norm_lang)
                if q_text not in questions:
                    questions.append(q_text)
                if not rule_fired:
                    rule_fired = f"ASK_{sign_id}_{reason}"

        # Step 4: Final decision rollup
        # Safety rule: if ANY sign flags -> FLAG immediately
        if flagged:
            referral_slip = self.generate_referral_slip(
                beneficiary_name=beneficiary_name,
                beneficiary_id=beneficiary_id,
                flagged_signs=flagged,
                worker_id=worker_id
            )
            return DangerSignResult(
                decision="FLAG",
                flagged_signs=flagged,
                clarification_questions=questions,
                referral_slip=referral_slip,
                lexicon_mode=lexicon_status,
                rule_fired=rule_fired or "FLAG_RULE_FIRED",
                evidence=evidence_list
            )

        # If any sign requires clarification -> ASK
        if questions:
            return DangerSignResult(
                decision="ASK",
                clarification_questions=questions,
                lexicon_mode=lexicon_status,
                rule_fired=rule_fired or "ASK_AMBIGUOUS_DANGER_SIGN",
                evidence=evidence_list
            )

        # Otherwise safely CLEAR
        return DangerSignResult(
            decision="CLEAR",
            lexicon_mode=lexicon_status,
            rule_fired="ALL_CANDIDATES_CONFIDENTLY_RESOLVED_OR_NEGATED",
            evidence=evidence_list
        )

    def _analyze_temporal_negation(
        self,
        full_text: str,
        lex_info: Optional[Dict[str, Any]],
        llm_info: Optional[Dict[str, Any]],
        lang: str
    ) -> Dict[str, str]:
        """
        Deterministic parsing for temporal transitions and negation.
        Crucial patterns:
        - "nahi thi, ab ho rahi hai" => FLAG
        - "pehle thi, ab nahi" => CLEAR
        - "thoda bleeding jaisa" => ASK
        - "bataya nahi" => unknown (not negative) => ASK if symptom mentioned
        """
        ctx = lex_info.get("context", full_text) if lex_info else full_text

        # 1. Check for transitional temporal positive:
        # was absent before, but is present NOW -> MUST FLAG!
        trans_pos_patterns = [
            r"nahi\s+(thi|tha|rahi)\s*,?\s*(lekin\s+)?ab\s+(ho\s+rahi|hai|shuru)",
            r"pehle\s+nahi\s+(thi|tha)\s*,?\s*(lekin\s+)?ab\s+(ho\s+rahi|hai)",
            r"didn't\s+have\s+(before|earlier)\s*,?\s*(now|but\s+now)\s+(has|having|started)",
            r"no\s+[\w\s]+\s+(earlier|before)\s*,?\s*(but\s+)?now\s+.*(started|bleeding|active|present)",
            r"not\s+earlier\s*,?\s*now\s+(present|happening)",
            r"irallilla\s*,?\s*ivaga\s*(ide|aaguttide|shuru)"
        ]
        for pat in trans_pos_patterns:
            if re.search(pat, ctx):
                return {"state": "FLAG", "reason": "transition_to_active_present"}

        # 2. Check for transitional temporal negative:
        # was present earlier, but is NOT present NOW -> CLEAR
        trans_neg_patterns = [
            r"pehle\s+(thi|tha|kabhi\s+tha)\s*,?\s*ab\s+(nahi|band|theek)",
            r"pehle\s+(hua\s+tha|hoti\s+thi)\s*,?\s*ab\s+(band|theek|nahi)",
            r"(had|was)\s+[\w\s]*(earlier|before)\s*,?\s*(but\s+)?now\s+.*(no|none|not|stopped|cured|ceased)",
            r"earlier\s*,?\s*but\s+now\s+.*stopped",
            r"(ittu|itthu)\s*,?\s*ivaga\s+(illa|nillide)"
        ]
        for pat in trans_neg_patterns:
            if re.search(pat, ctx):
                return {"state": "CLEAR", "reason": "past_resolved_currently_absent"}

        # 3. Check for hedge / uncertainty ("thoda ... jaisa", "doubtful", "maybe"):
        hedge_patterns = [
            r"thoda\s+.*jaisa",
            r"jaisa\s+laga",
            r"doubtful",
            r"shakk\s+hai",
            r"kaisa\s+lag\s+raha",
            r"maybe",
            r"suspected",
            r"swalpa\s+.*anusthide"
        ]
        for pat in hedge_patterns:
            if re.search(pat, ctx):
                return {"state": "ASK", "reason": "hedged_or_doubtful_symptom"}

        # 4. Check for explicit unstated / unknown ("bataya nahi", "did not mention"):
        unknown_patterns = [
            r"bataya\s+nahi",
            r"pata\s+nahi",
            r"did\s+not\s+(mention|say|tell)",
            r"not\s+reported",
            r"tilislilla"
        ]
        for pat in unknown_patterns:
            if re.search(pat, ctx):
                return {"state": "ASK", "reason": "status_unknown_not_negated"}

        # 5. Check for clear present negation:
        # e.g., "bleeding nahi hai", "no bleeding", "bilkul nahi", "rakthasrava illa", "ledu", "illai", "nei", "nathi"
        neg_patterns = [
            r"(nahi|koi\s+nahi)\s+(hai|tha|thi)?",
            r"bilkul\s+nahi",
            r"\b(no|not|none|never|without)\b",
            r"\b(illa|aguttilla)\b",
            r"\b(ledu|ledu\b|undadu)\b",
            r"\b(illai|illaiye)\b",
            r"\b(nei|na)\b",
            r"\b(nathi)\b"
        ]
        has_direct_negation = False
        for pat in neg_patterns:
            if re.search(pat, ctx):
                has_direct_negation = True
                break

        # If LLM extracted with high certainty that it is negated and not active
        if llm_info:
            is_negated = llm_info.get("negated", False)
            timing = llm_info.get("timing", "present")
            certainty = llm_info.get("certainty", "high")

            if certainty == "low":
                return {"state": "ASK", "reason": "llm_low_certainty"}

            if is_negated:
                return {"state": "CLEAR", "reason": "llm_confirmed_negation"}

            if timing == "past":
                return {"state": "CLEAR", "reason": "past_episode_only"}

            if not is_negated and timing in ("present", "unknown"):
                return {"state": "FLAG", "reason": "llm_active_symptom"}

        # If direct negation matched in context and no hedge was found
        if has_direct_negation:
            return {"state": "CLEAR", "reason": "lexicon_context_negation"}

        # Default fallback: if danger term appears without clear negation, safety demands FLAG
        return {"state": "FLAG", "reason": "unnegated_danger_term_detected"}

    def _build_clarification_question(self, defn: DangerSignDefinition, lang: str) -> str:
        if lang == "hi":
            return f"क्या लाभार्थी को {defn.name} (खतरे का लक्षण) की शिकायत अभी है? कृपया हाँ या ना कहें।"
        elif lang == "kn":
            return f"ಫಲಾನುಭವಿಗೆ {defn.name} ಲಕ್ಷಣ ಈಗ ಇದೆಯೇ? ದಯವಿಟ್ಟು ಹೌದು ಅಥವಾ ಇಲ್ಲ ಎಂದು ತಿಳಿಸಿ."
        else:
            return f"Does the beneficiary currently have {defn.name}? Please answer yes or no."

    def generate_referral_slip(
        self,
        beneficiary_name: str,
        beneficiary_id: str,
        flagged_signs: List[Dict[str, Any]],
        worker_id: str = "ASHA-001",
        date_str: Optional[str] = None
    ) -> str:
        """
        Generate a factual, 1-line or concise referral slip.
        Strict compliance: Facts only, no medical diagnosis or drug advice.
        """
        from datetime import datetime
        now_str = date_str or datetime.now().strftime("%Y-%m-%d %H:%M")
        signs_text = ", ".join([f"{s['name']} (Source: {s.get('source', {}).get('document_title', 'MoHFW Protocol')})" for s in flagged_signs])
        slip = f"[URGENT PHC REFERRAL SLIP] Date/Time: {now_str} | Worker ID: {worker_id} | Beneficiary: {beneficiary_name} (ID: {beneficiary_id}) | Observed Danger Sign(s): {signs_text} | Action Required: Immediate medical evaluation at Primary Health Centre."
        return slip
