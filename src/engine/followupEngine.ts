import { FollowupItem } from '../types';

export function generateFollowups(
  visitType: string = 'ANC',
  gestationalWeeks?: number | null,
  childAgeDays?: number | null,
  ifaTablets?: number | null
): FollowupItem[] {
  const followups: FollowupItem[] = [];
  const now = new Date();

  const addDays = (d: Date, days: number): string => {
    const res = new Date(d);
    res.setDate(res.getDate() + days);
    return res.toISOString().split('T')[0];
  };

  const vtype = (visitType || 'ANC').toUpperCase();

  if (vtype.includes('ANC')) {
    if (gestationalWeeks !== null && gestationalWeeks !== undefined) {
      if (gestationalWeeks < 14) {
        followups.push({
          item: '2nd ANC Checkup (Second Trimester)',
          dueDate: addDays(now, 28),
          focus: 'Abdominal exam, BP check, TT2 / Td2 dose, USG anomaly scan',
          source: 'MoHFW ANC Guidelines (14-26 weeks)',
          completed: false,
        });
      } else if (gestationalWeeks < 28) {
        followups.push({
          item: '3rd ANC Checkup (Third Trimester)',
          dueDate: addDays(now, 28),
          focus: 'Growth monitoring, anemia check, fetal movement tracking, BP',
          source: 'MoHFW ANC Guidelines (28-34 weeks)',
          completed: false,
        });
      } else {
        followups.push({
          item: '4th ANC Checkup (Near Term)',
          dueDate: addDays(now, 14),
          focus: 'Birth preparedness, institutional delivery plan, 108 ambulance review',
          source: 'MoHFW ANC Guidelines (36 weeks to term)',
          completed: false,
        });
      }
    } else {
      followups.push({
        item: 'Next ANC Visit',
        dueDate: 'Date pending LMP history',
        focus: 'Determine gestational age and schedule next ANC checkup',
        source: 'MoHFW ANC Protocol',
        completed: false,
      });
    }

    if (ifaTablets !== null && ifaTablets !== undefined && ifaTablets < 180) {
      const remaining = 180 - ifaTablets;
      followups.push({
        item: `IFA Tablet Supply (${remaining} remaining)`,
        dueDate: addDays(now, 30),
        focus: 'Replenish 30 IFA tablets. Verify daily consumption after meals.',
        source: 'Anemia Mukt Bharat Protocol',
        completed: false,
      });
    }
  } else {
    // PNC / Newborn
    if (childAgeDays !== null && childAgeDays !== undefined) {
      const milestoneDays = [3, 7, 14, 21, 28, 42];
      const nextMilestone = milestoneDays.find((d) => d > childAgeDays);

      if (nextMilestone) {
        const daysDiff = nextMilestone - childAgeDays;
        followups.push({
          item: `HBNC Home Visit Day ${nextMilestone}`,
          dueDate: addDays(now, daysDiff),
          focus: 'Cord care, warmth/temp check, feeding assessment, weight gain, danger signs',
          source: 'MoHFW HBNC Operational Guidelines',
          completed: false,
        });
      }

      // Universal Immunization UIP schedule
      if (childAgeDays < 42) {
        followups.push({
          item: '6-Week Immunization (UIP)',
          dueDate: addDays(now, Math.max(1, 42 - childAgeDays)),
          focus: 'OPV-1, Pentavalent-1, Rotavirus-1, fIPV-1, PCV-1',
          source: 'National Immunization Schedule (UIP India)',
          completed: false,
        });
      } else if (childAgeDays < 70) {
        followups.push({
          item: '10-Week Immunization (UIP)',
          dueDate: addDays(now, Math.max(1, 70 - childAgeDays)),
          focus: 'OPV-2, Pentavalent-2, Rotavirus-2',
          source: 'National Immunization Schedule (UIP India)',
          completed: false,
        });
      } else if (childAgeDays < 98) {
        followups.push({
          item: '14-Week Immunization (UIP)',
          dueDate: addDays(now, Math.max(1, 98 - childAgeDays)),
          focus: 'OPV-3, Pentavalent-3, Rotavirus-3, fIPV-2, PCV-2',
          source: 'National Immunization Schedule (UIP India)',
          completed: false,
        });
      }
    } else {
      followups.push({
        item: 'Next HBNC Newborn Visit',
        dueDate: 'Date pending birth verification',
        focus: 'Record birth date to schedule HBNC home visits and immunization',
        source: 'MoHFW HBNC Schedule',
        completed: false,
      });
    }
  }

  return followups;
}
