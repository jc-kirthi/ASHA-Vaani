import { FollowupItem } from '../types/index.ts';

export function generateFollowups(
  visitType: string = 'ANC',
  gestationalWeeks?: number | null,
  childAgeDays?: number | null,
  ifaTablets?: number | null,
  visitDate: string = new Date().toISOString().slice(0, 10)
): FollowupItem[] {
  const followups: FollowupItem[] = [];
  const anchor = new Date(`${visitDate}T00:00:00.000Z`);
  const dueDateFrom = Number.isNaN(anchor.getTime()) ? new Date() : anchor;

  const addDays = (d: Date, days: number): string => {
    const res = new Date(d);
    res.setUTCDate(res.getUTCDate() + days);
    return res.toISOString().split('T')[0];
  };
  const add = (item: Omit<FollowupItem, 'id' | 'status'>) => {
    followups.push({
      ...item,
      id: `followup-${followups.length + 1}`,
      status: item.dueDate.startsWith('Date pending')
        ? 'pending_verification'
        : 'upcoming',
    });
  };

  const vtype = (visitType || 'ANC').toUpperCase();

  if (vtype.includes('ANC')) {
    if (gestationalWeeks !== null && gestationalWeeks !== undefined) {
      if (gestationalWeeks < 14) {
        add({
          item: '2nd ANC Checkup (Second Trimester)',
          dueDate: addDays(dueDateFrom, 28),
          focus: 'Abdominal exam, BP check, TT2 / Td2 dose, USG anomaly scan',
          source: 'Unverified draft schedule rule',
          completed: false,
        });
      } else if (gestationalWeeks < 28) {
        add({
          item: '3rd ANC Checkup (Third Trimester)',
          dueDate: addDays(dueDateFrom, 28),
          focus: 'Growth monitoring, anemia check, fetal movement tracking, BP',
          source: 'Unverified draft schedule rule',
          completed: false,
        });
      } else {
        add({
          item: '4th ANC Checkup (Near Term)',
          dueDate: addDays(dueDateFrom, 14),
          focus: 'Birth preparedness, institutional delivery plan, 108 ambulance review',
          source: 'Unverified draft schedule rule',
          completed: false,
        });
      }
    } else {
      add({
        item: 'Next ANC Visit',
        dueDate: 'Date pending LMP history',
        focus: 'Determine gestational age and schedule next ANC checkup',
        source: 'Unverified draft schedule rule',
        completed: false,
      });
    }

    if (ifaTablets !== null && ifaTablets !== undefined && ifaTablets < 180) {
      const remaining = 180 - ifaTablets;
      add({
        item: `IFA Tablet Supply (${remaining} remaining)`,
        dueDate: addDays(dueDateFrom, 30),
        focus: 'Replenish 30 IFA tablets. Verify daily consumption after meals.',
        source: 'Unverified draft schedule rule',
        completed: false,
      });
    } else if (ifaTablets === null || ifaTablets === undefined) {
      add({
        item: 'IFA supply follow-up',
        dueDate: 'Date pending IFA supply verification',
        focus: 'Verify current IFA tablet stock before scheduling a refill.',
        source: 'Unverified local follow-up rule',
        completed: false,
      });
    }
  } else if (vtype.includes('PNC')) {
    // PNC / Newborn
    if (childAgeDays !== null && childAgeDays !== undefined) {
      const milestoneDays = [3, 7, 14, 21, 28, 42];
      const nextMilestone = milestoneDays.find((d) => d > childAgeDays);

      if (nextMilestone) {
        const daysDiff = nextMilestone - childAgeDays;
        add({
          item: `HBNC Home Visit Day ${nextMilestone}`,
          dueDate: addDays(dueDateFrom, daysDiff),
          focus: 'Cord care, warmth/temp check, feeding assessment, weight gain, danger signs',
          source: 'Unverified draft schedule rule',
          completed: false,
        });
      }

      // Universal Immunization UIP schedule
      if (childAgeDays < 42) {
        add({
          item: '6-Week Immunization (UIP)',
          dueDate: addDays(dueDateFrom, Math.max(1, 42 - childAgeDays)),
          focus: 'OPV-1, Pentavalent-1, Rotavirus-1, fIPV-1, PCV-1',
          source: 'Unverified draft schedule rule',
          completed: false,
        });
      } else if (childAgeDays < 70) {
        add({
          item: '10-Week Immunization (UIP)',
          dueDate: addDays(dueDateFrom, Math.max(1, 70 - childAgeDays)),
          focus: 'OPV-2, Pentavalent-2, Rotavirus-2',
          source: 'Unverified draft schedule rule',
          completed: false,
        });
      } else if (childAgeDays < 98) {
        add({
          item: '14-Week Immunization (UIP)',
          dueDate: addDays(dueDateFrom, Math.max(1, 98 - childAgeDays)),
          focus: 'OPV-3, Pentavalent-3, Rotavirus-3, fIPV-2, PCV-2',
          source: 'Unverified draft schedule rule',
          completed: false,
        });
      }
    } else {
      add({
        item: 'Next HBNC Newborn Visit',
        dueDate: 'Date pending birth verification',
        focus: 'Record birth date to schedule HBNC home visits and immunization',
        source: 'Unverified draft schedule rule',
        completed: false,
      });
    }
  } else {
    add({
      item: 'Immunisation follow-up',
      dueDate: 'Date pending child age verification',
      focus: 'Verify the child’s date of birth and immunisation history before scheduling.',
      source: 'Unverified draft schedule rule',
      completed: false,
    });
  }

  return followups;
}
