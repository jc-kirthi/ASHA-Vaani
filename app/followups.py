"""
Deterministic Follow-up Generator for ASHA Vaani.
All dates and scheduled health interventions are calculated strictly via MoHFW protocol
and deterministic date arithmetic. Never LLM-hallucinated dates.
"""

from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

class FollowupGenerator:
    def __init__(self):
        pass

    def generate(
        self,
        visit_type: str,
        visit_date_str: Optional[str] = None,
        gestational_weeks: Optional[int] = None,
        child_age_days: Optional[int] = None,
        vaccinations_given: Optional[List[str]] = None,
        ifa_tablets_given: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate strict protocol-driven follow-ups.
        """
        base_date = datetime.strptime(visit_date_str, "%Y-%m-%d") if visit_date_str else datetime.now()
        followups = []

        vtype = (visit_type or "ANC").upper()

        if "ANC" in vtype:
            # ANC Follow-ups
            if gestational_weeks is not None:
                if gestational_weeks < 14:
                    due_date = base_date + timedelta(days=28)
                    followups.append({
                        "item": "2nd ANC Checkup (Second Trimester)",
                        "due_date": due_date.strftime("%Y-%m-%d"),
                        "focus": "Abdominal exam, BP check, TT2 / Td2 injection, USG scan",
                        "source": "MoHFW ANC Guideline (14-26 weeks)"
                    })
                elif gestational_weeks < 28:
                    due_date = base_date + timedelta(days=28)
                    followups.append({
                        "item": "3rd ANC Checkup (Third Trimester)",
                        "due_date": due_date.strftime("%Y-%m-%d"),
                        "focus": "Fetal heart sound, anemia screening, BP, weight monitoring",
                        "source": "MoHFW ANC Guideline (28-34 weeks)"
                    })
                else:
                    due_date = base_date + timedelta(days=14)
                    followups.append({
                        "item": "4th ANC Checkup (Near Term)",
                        "due_date": due_date.strftime("%Y-%m-%d"),
                        "focus": "Institutional delivery planning, 108 ambulance contact, danger signs review",
                        "source": "MoHFW ANC Guideline (36 weeks to term)"
                    })
            else:
                followups.append({
                    "item": "Next ANC Visit",
                    "due_date": "Date pending (LMP / gestational age missing in history)",
                    "focus": "Determine gestational age and schedule next ANC checkup",
                    "source": "MoHFW ANC Protocol"
                })

            # IFA check
            if ifa_tablets_given is not None and ifa_tablets_given < 180:
                rem = 180 - ifa_tablets_given
                followups.append({
                    "item": f"IFA Tablet Supply ({rem} remaining)",
                    "due_date": (base_date + timedelta(days=30)).strftime("%Y-%m-%d"),
                    "focus": f"Replenish 30 IFA tablets. Verify daily consumption after meals.",
                    "source": "Anemia Mukt Bharat Protocol"
                })

        elif "PNC" in vtype or "NEWBORN" in vtype or "HBNC" in vtype:
            # HBNC Schedule
            if child_age_days is not None:
                hbnc_milestone_days = [3, 7, 14, 21, 28, 42]
                next_day = None
                for d in hbnc_milestone_days:
                    if d > child_age_days:
                        next_day = d
                        break

                if next_day:
                    days_until = next_day - child_age_days
                    due_date = base_date + timedelta(days=days_until)
                    followups.append({
                        "item": f"HBNC Home Visit Day {next_day}",
                        "due_date": due_date.strftime("%Y-%m-%d"),
                        "focus": "Cord check, temperature, feeding assessment, weight gain, danger signs",
                        "source": "MoHFW HBNC Operational Guidelines"
                    })

                # Immunization follow-ups
                vg = set([v.lower() for v in (vaccinations_given or [])])
                if child_age_days < 42:
                    due_date = base_date + timedelta(days=max(1, 42 - child_age_days))
                    followups.append({
                        "item": "6-Week Immunization (UIP)",
                        "due_date": due_date.strftime("%Y-%m-%d"),
                        "focus": "OPV-1, Pentavalent-1, Rotavirus-1, fIPV-1, PCV-1",
                        "source": "National Immunization Schedule (UIP India)"
                    })
                elif child_age_days < 70:
                    due_date = base_date + timedelta(days=max(1, 70 - child_age_days))
                    followups.append({
                        "item": "10-Week Immunization (UIP)",
                        "due_date": due_date.strftime("%Y-%m-%d"),
                        "focus": "OPV-2, Pentavalent-2, Rotavirus-2",
                        "source": "National Immunization Schedule (UIP India)"
                    })
                elif child_age_days < 98:
                    due_date = base_date + timedelta(days=max(1, 98 - child_age_days))
                    followups.append({
                        "item": "14-Week Immunization (UIP)",
                        "due_date": due_date.strftime("%Y-%m-%d"),
                        "focus": "OPV-3, Pentavalent-3, Rotavirus-3, fIPV-2, PCV-2",
                        "source": "National Immunization Schedule (UIP India)"
                    })
            else:
                followups.append({
                    "item": "Next HBNC Newborn Visit",
                    "due_date": "Pending date (Child birth date not recorded)",
                    "focus": "Verify birth date to compute HBNC and immunization milestones",
                    "source": "MoHFW HBNC Schedule"
                })

        return followups
