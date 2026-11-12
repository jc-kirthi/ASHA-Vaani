import { DangerSignAlert, DangerEngineResult } from '../types/index.ts';
export type { DangerEngineResult };

export const DANGER_SIGNS_LIST = [
  {
    id: 'vaginal_bleeding',
    name: 'Vaginal Bleeding',
    appliesTo: 'pregnancy',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW ASHA Training Module 6 - Maternal Health]',
      version: '[TODO: NHM Guidelines 2020 Revision]',
      section_or_page: '[TODO: Section 3.2, Page 28]',
    },
    synonyms: ['bleeding', 'rakt', 'khoon', 'spotting', 'rokto', 'lohi', 'rathapokku', 'rakthasrava'],
  },
  {
    id: 'convulsions_fits',
    name: 'Convulsions / Fits (Eclampsia)',
    appliesTo: 'pregnancy',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW ASHA Training Module 6 - High Risk Pregnancy]',
      version: '[TODO: NHM 2020 Revision]',
      section_or_page: '[TODO: Section 4.1, Page 34]',
    },
    synonyms: ['daura', 'fits', 'seizure', 'jhatka', 'mirgi', 'moorche', 'aanchki'],
  },
  {
    id: 'severe_headache_blurred_vision',
    name: 'Severe Headache with Blurred Vision',
    appliesTo: 'pregnancy',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW ASHA Training Module 6 - High Risk Pregnancy]',
      version: '[TODO: NHM 2020 Revision]',
      section_or_page: '[TODO: Section 4.2, Page 36]',
    },
    synonyms: ['dhundhla', 'blurred vision', 'tez sar dard', 'kannu mabbaguvudu', 'mabbaguvudu'],
  },
  {
    id: 'high_fever_pregnancy',
    name: 'High Fever / Sepsis',
    appliesTo: 'pregnancy',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW Guidelines on Obstetric Emergencies]',
      version: '[TODO: MoHFW 2019]',
      section_or_page: '[TODO: Chapter 5, Page 52]',
    },
    synonyms: ['tez bukhar', 'high fever', 'tumba jwara', 'taap', 'taav', 'jor', 'paniyum', 'bukhar', 'fever', 'jwara'],
  },
  {
    id: 'severe_abdominal_pain',
    name: 'Severe Abdominal Pain',
    appliesTo: 'pregnancy',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW ASHA Training Module 6 - Complications]',
      version: '[TODO: NHM 2020]',
      section_or_page: '[TODO: Section 3.5, Page 31]',
    },
    synonyms: ['pet mein tez dard', 'severe abdominal pain', 'hotte tumba novu', 'pet dard', 'hottenovu'],
  },
  {
    id: 'reduced_fetal_movement',
    name: 'Reduced Fetal Movement',
    appliesTo: 'pregnancy',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW MCP Card Antenatal Danger Signs]',
      version: '[TODO: MCP Card 2021]',
      section_or_page: '[TODO: Page 8, Fetal Monitoring]',
    },
    synonyms: ['bachha hil nahi raha', 'movement kam', 'reduced fetal movement', 'chalane illa', 'bachha hil', 'fetal movement'],
  },
  {
    id: 'newborn_fever',
    name: 'Newborn High Fever',
    appliesTo: 'newborn',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW HBNC Operational Guidelines]',
      version: '[TODO: HBNC Revised 2021]',
      section_or_page: '[TODO: Card 3, Danger Signs, Page 19]',
    },
    synonyms: ['bachhe ko bukhar', 'newborn fever', 'maguvige jwara'],
  },
  {
    id: 'newborn_hypothermia',
    name: 'Very Cold Body (Hypothermia)',
    appliesTo: 'newborn',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW HBNC Training Guidelines]',
      version: '[TODO: HBNC 2021]',
      section_or_page: '[TODO: Chapter 4, Cold Injury, Page 22]',
    },
    synonyms: ['thanda pad gaya', 'sharir thanda', 'cold body', 'hypothermia', 'cold like ice'],
  },
  {
    id: 'newborn_not_feeding',
    name: 'Unable to Feed / Refusing Milk',
    appliesTo: 'newborn',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW HBNC Protocol - Sepsis and Feeding]',
      version: '[TODO: HBNC 2021]',
      section_or_page: '[TODO: Page 25, Table 2]',
    },
    synonyms: ['doodh nahi', 'haalu kudiyuttilla', 'not feeding', 'refusing milk', 'palu tagatledu', 'paal kudikkavillai'],
  },
  {
    id: 'fast_breathing_chest_indrawing',
    name: 'Fast Breathing / Chest Indrawing',
    appliesTo: 'newborn',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW HBNC Protocol - Respiratory Count]',
      version: '[TODO: HBNC 2021]',
      section_or_page: '[TODO: Page 27, Respiratory Count > 60/min]',
    },
    synonyms: ['pasli chal', 'saans tez', 'chhati dhas', 'fast breathing', 'saah tez', 'tez saans'],
  },
  {
    id: 'yellow_palms_soles',
    name: 'Yellow Palms and Soles (Severe Jaundice)',
    appliesTo: 'newborn',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW HBNC Protocol - Neonatal Jaundice]',
      version: '[TODO: HBNC 2021]',
      section_or_page: '[TODO: Page 31, Zone 5 Jaundice]',
    },
    synonyms: ['peele pad gaye', 'yellow palms', 'yellow soles', 'peeliya', 'haladi'],
  },
  {
    id: 'unresponsive_lethargic',
    name: 'Lethargic or Unresponsive',
    appliesTo: 'newborn',
    severity: 'emergency',
    source: {
      document_title: '[TODO: Verify MoHFW HBNC Protocol - Sepsis and Encephalopathy]',
      version: '[TODO: HBNC 2021]',
      section_or_page: '[TODO: Page 33, Activity Check]',
    },
    synonyms: ['sust pad gaya', 'harkat nahi kar raha', 'unresponsive', 'lethargic', 'sust'],
  },
];

export function evaluateDangerSigns(
  text: string,
  lang: string = 'hi-IN',
  beneficiaryName: string = 'Beneficiary',
  beneficiaryId: string = 'ID-Pending',
  workerId: string = 'ASHA-001',
  currentClarifications: Record<string, 'present' | 'absent'> = {}
): DangerEngineResult {
  const normLang = lang.split('-')[0].toLowerCase();
  const isFullyTested = ['hi', 'kn', 'en'].includes(normLang);
  const lexiconMode = isFullyTested ? 'lexicon: active' : 'lexicon: none, strict mode';

  const t = text.toLowerCase();
  const flaggedSigns: DangerSignAlert[] = [];
  const clarificationQuestions: string[] = [];
  const evidence: Array<{ signId: string; name: string; state: string; reason: string }> = [];

  // Temporal transitional positive: was absent before, active NOW -> FLAG
  const transPosRegex = /(pehle.*nahi.*ab|kal.*nahi.*aaj|nahi.*shuru|nahi (thi|tha|rahi|ittu).*ab|didn't have.*(now|started)|did not have.*(now|started)|no.*earlier.*now.*(started|active|bleeding)|irallilla.*ivaga (ide|aaguttide)|munche.*irallilla.*ivaga)/i;
  const transNegRegex = /(pehle.*(thi|tha|hua tha).*ab (nahi|band|theek)|(had|was).*earlier.*now.*(no|none|not|stopped|cured)|earlier.*now.*stopped|(ittu|itthu).*ivaga (illa|nillide)|modalu.*ivaga illa|\b(bleeding|spotting|fever) stopped (yesterday|today|now)\b|\b(stopped|ended) yesterday\b|\b(stopped|resolved|ended|cured)\b)/i;
  const unknownRegex = /(bataya nahi|pata nahi|did not mention|not reported|unknown whether|unclear whether)/i;
  const hedgeRegex = /(thoda.*jaisa|jaisa laga|doubtful|shakk hai|maybe|possibly|perhaps|anusthide)/i;
  const negRegex = /\b(nahi|bilkul nahi|no|not|none|illa|aguttilla|ledu|illai|nei|nathi|denies|absent)\b/i;
  const pastRegex = /\b(yesterday|last night|last week|earlier|previously|before|was|had)\b|kal|pehle|munche/i;

  for (const sign of DANGER_SIGNS_LIST) {
    const clarification = currentClarifications[sign.id];
    if (clarification) {
      if (clarification === 'present') {
        flaggedSigns.push({
          id: sign.id,
          name: sign.name,
          severity: sign.severity,
          source: sign.source,
          reason: 'worker_confirmed_current_symptom',
        });
        evidence.push({ signId: sign.id, name: sign.name, state: 'FLAG', reason: 'Worker explicitly confirmed this symptom is present now' });
      } else {
        evidence.push({ signId: sign.id, name: sign.name, state: 'CLEAR', reason: 'Worker explicitly confirmed this symptom is absent now' });
      }
      continue;
    }

    const matches: Array<{ synonym: string; start: number }> = [];
    for (const syn of sign.synonyms) {
      const lowerSynonym = syn.toLowerCase();
      let start = t.indexOf(lowerSynonym);
      while (start >= 0) {
        matches.push({ synonym: lowerSynonym, start });
        start = t.indexOf(lowerSynonym, start + lowerSynonym.length);
      }
    }
    if (!matches.length) continue;
    matches.sort((a, b) => a.start - b.start);
    const states = matches.map(({ synonym, start }) => {
      const end = start + synonym.length;
      const delimiters = [',', ';', '.', '?', '!', ' and ', ' but ', ' however '];
      let clauseStart = 0;
      let clauseEnd = t.length;
      for (const delimiter of delimiters) {
        const before = t.lastIndexOf(delimiter, start);
        if (before >= 0) clauseStart = Math.max(clauseStart, before + delimiter.length);
        const afterDelimiter = t.indexOf(delimiter, end);
        if (afterDelimiter >= 0) clauseEnd = Math.min(clauseEnd, afterDelimiter);
      }
      const context = t.slice(clauseStart, clauseEnd);
      const after = t.slice(end, clauseEnd);
      const isBuiltInNegativeSymptom = sign.id === 'newborn_not_feeding' || sign.id === 'reduced_fetal_movement';
      if (transPosRegex.test(context)) return { state: 'FLAG', context };
      if (unknownRegex.test(context)) return { state: 'ASK', context };
      if (hedgeRegex.test(context)) return { state: 'ASK', context };
      if (transNegRegex.test(context)) return { state: 'CLEAR', context };
      if (pastRegex.test(context)) return { state: 'ASK', context };
      if (!isBuiltInNegativeSymptom && negRegex.test(context)) return { state: 'CLEAR', context };
      if (isBuiltInNegativeSymptom && /(?:no longer|not anymore|no more|stopped|resolved)/i.test(after)) {
        return { state: 'CLEAR', context };
      }
      return { state: 'FLAG', context };
    });
    const positive = states.find((state) => state.state === 'FLAG');
    const uncertain = states.find((state) => state.state === 'ASK');
    const resolved = states.find((state) => state.state === 'CLEAR');

    if (positive) {
      flaggedSigns.push({
        id: sign.id,
        name: sign.name,
        severity: sign.severity,
        source: sign.source,
        reason: 'transition_to_active_present',
      });
      evidence.push({ signId: sign.id, name: sign.name, state: 'FLAG', reason: 'Current unnegated danger sign in symptom context' });
    } else if (uncertain) {
      clarificationQuestions.push(`क्या लाभार्थी को ${sign.name} (खतरे का लक्षण) है? कृपया हाँ या ना बताएं।`);
      evidence.push({ signId: sign.id, name: sign.name, state: 'ASK', reason: 'Symptom status is uncertain, unreported, or only described in the past' });
    } else if (resolved) {
      evidence.push({ signId: sign.id, name: sign.name, state: 'CLEAR', reason: 'Symptom is negated or described as resolved in context' });
    }
  }

  if (flaggedSigns.length > 0) {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const signsSummary = flaggedSigns.map((s) => s.name).join(', ');
    const referralSlip = `[URGENT PHC REFERRAL SLIP] Date/Time: ${now} | Worker ID: ${workerId} | Beneficiary: ${beneficiaryName} (ID: ${beneficiaryId}) | Danger Sign(s): ${signsSummary} | Immediate Action: Transfer to Primary Health Centre (PHC) for emergency clinical evaluation.`;

    return {
      decision: 'FLAG',
      flaggedSigns,
      clarificationQuestions,
      referralSlip,
      ruleFired: `FLAGGED_${flaggedSigns[0].id}`,
      lexiconMode,
      evidence,
    };
  }

  if (clarificationQuestions.length > 0) {
    return {
      decision: 'ASK',
      flaggedSigns: [],
      clarificationQuestions,
      referralSlip: null,
      ruleFired: 'ASK_AMBIGUOUS_DANGER_SIGN',
      lexiconMode,
      evidence,
    };
  }

  return {
    decision: 'CLEAR',
    flaggedSigns: [],
    clarificationQuestions: [],
    referralSlip: null,
    ruleFired: evidence.length > 0 ? 'SYMPTOMS_NEGATED_OR_RESOLVED' : 'NO_DANGER_SIGNS_DETECTED',
    lexiconMode,
    evidence,
  };
}
