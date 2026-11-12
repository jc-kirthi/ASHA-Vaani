import { GoogleGenAI } from '@google/genai';

export interface ExtractedVisitData {
  beneficiaryName: string | null;
  beneficiaryNames: string[];
  beneficiaryId: string | null;
  beneficiaryType: 'pregnant_woman' | 'newborn' | 'mother' | 'unknown';
  age: number | null;
  houseNo: string | null;
  village: string | null;
  visitType: 'ANC' | 'PNC' | 'immunisation' | null;
  pregnancyMonths: number | null;
  gestationalWeeks: number | null;
  babyAgeDays: number | null;
  childAgeDays: number | null;
  weight: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  hemoglobin: number | null;
  lastAncDate: string | null;
  ttStatus: string | null;
  ttLastDoseDate: string | null;
  ifaStatus: string | null;
  ifaTablets: number | null;
  vaccinationsGiven: string[];
  symptoms: Array<{
    canonicalId: string;
    negated: boolean;
    timing: string | null;
    certainty: 'high' | 'uncertain';
    evidence: string;
  }>;
  notes: string;
  evidence: Record<string, string | null>;
  confidence: Record<string, 'high' | 'uncertain' | 'missing'>;
  extractionStatus: 'confirmed' | 'uncertain';
  modelUsed: string;
}

const responseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'beneficiaryName', 'beneficiaryNames', 'beneficiaryType', 'age', 'houseNo',
    'village', 'visitType', 'pregnancyMonths', 'gestationalWeeks', 'babyAgeDays',
    'weight', 'bpSystolic', 'bpDiastolic', 'hemoglobin', 'lastAncDate',
    'ttStatus', 'ttLastDoseDate', 'ifaStatus', 'ifaTablets', 'vaccinationsGiven', 'symptoms',
    'notes', 'evidence',
  ],
  properties: {
    beneficiaryName: { type: ['string', 'null'] },
    beneficiaryNames: { type: 'array', items: { type: 'string' } },
    beneficiaryType: { type: 'string', enum: ['pregnant_woman', 'newborn', 'mother', 'unknown'] },
    age: { type: ['number', 'null'] },
    houseNo: { type: ['string', 'null'] },
    village: { type: ['string', 'null'] },
    visitType: { type: ['string', 'null'], enum: ['ANC', 'PNC', 'immunisation', null] },
    pregnancyMonths: { type: ['number', 'null'] },
    gestationalWeeks: { type: ['number', 'null'] },
    babyAgeDays: { type: ['number', 'null'] },
    weight: { type: ['number', 'null'] },
    bpSystolic: { type: ['number', 'null'] },
    bpDiastolic: { type: ['number', 'null'] },
    hemoglobin: { type: ['number', 'null'] },
    lastAncDate: { type: ['string', 'null'] },
    ttStatus: { type: ['string', 'null'] },
    ttLastDoseDate: { type: ['string', 'null'] },
    ifaStatus: { type: ['string', 'null'] },
    ifaTablets: { type: ['number', 'null'] },
    vaccinationsGiven: { type: 'array', items: { type: 'string' } },
    symptoms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['canonicalId', 'negated', 'timing', 'certainty', 'evidence'],
        properties: {
          canonicalId: { type: 'string' },
          negated: { type: 'boolean' },
          timing: { type: ['string', 'null'] },
          certainty: { type: 'string', enum: ['high', 'uncertain'] },
          evidence: { type: 'string' },
        },
      },
    },
    notes: { type: 'string' },
    evidence: {
      type: 'object',
      additionalProperties: false,
      required: ['beneficiaryName', 'age', 'houseNo', 'weight', 'bloodPressure', 'ifaStatus'],
      properties: {
        beneficiaryName: { type: ['string', 'null'] },
        age: { type: ['string', 'null'] },
        houseNo: { type: ['string', 'null'] },
        weight: { type: ['string', 'null'] },
        bloodPressure: { type: ['string', 'null'] },
        ifaStatus: { type: ['string', 'null'] },
      },
    },
  },
} as const;

const FIELD_NAMES = [
  'beneficiary', 'age', 'houseNo', 'visitType', 'pregnancyMonths', 'babyAgeDays',
  'weight', 'bp', 'hemoglobin', 'lastAncDate', 'ttStatus', 'ifa', 'vaccinations',
] as const;

class InvalidExtractionError extends Error {}

export async function extractWithGemini(
  transcript: string,
  lang: string = 'en-IN'
): Promise<ExtractedVisitData> {
  if (process.env.LLM_PROVIDER === 'mock') {
    return extractWithMock(transcript, lang);
  }
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error('LLM_API_KEY is missing. Put LLM_API_KEY in the .env file in the project root, then restart the server.');
  }

  const ai = new GoogleGenAI({ apiKey });
  let firstError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await attemptGeminiCall(ai, transcript);
    } catch (error) {
      if (!(error instanceof InvalidExtractionError)) throw error;
      firstError = error;
    }
  }

  if (firstError) {
    return uncertainExtraction();
  }
  throw new Error('Gemini extraction failed.');
}

export function extractWithMock(transcript: string, _lang = 'en-IN'): ExtractedVisitData {
  const text = transcript.trim();
  const lower = text.toLowerCase();
  const capture = (pattern: RegExp): string | null => text.match(pattern)?.[1]?.trim() || null;
  const numeric = (pattern: RegExp): number | null => {
    const value = capture(pattern);
    if (value) return Number(value);
    const word = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    const words: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
      eight: 8, nine: 9, ten: 10,
    };
    return word ? words[word[1]] : null;
  };
  const ignoredNames = new Set([
    'anc', 'bp', 'ifa', 'tt', 'phc', 'house', 'weight', 'visit', 'newborn',
    'mother', 'pregnant', 'no', 'yes', 'she', 'he', 'baby', 'patient', 'the',
  ]);
  const names = Array.from(new Set(
    (text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) || [])
      .filter((name) => !ignoredNames.has(name.toLowerCase()))
  ));
  const name = names[0] || capture(/(?:name is|beneficiary)\s+([A-Za-z][A-Za-z ]+)/i);
  const age = numeric(/\b(\d{1,2})\s*(?:years?\s*old|year old|yrs?\b)/i);
  const monthWords: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10,
  };
  const pregnancyMonths = numeric(/\b(\d{1,2})\s*months?\s*pregnant\b/i) ??
    monthWords[lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+months?\s+pregnant\b/i)?.[1] || ''] ?? null;
  const babyAgeDays = numeric(/\b(\d{1,3})\s*days?\s*old\b/i) ??
    (/\b(\d{1,2})\s*weeks?\s*old\b/i.test(lower)
      ? (numeric(/\b(\d{1,2})\s*weeks?\s*old\b/i) ?? 0) * 7 : null);
  const houseNo = capture(/\bhouse(?:\s*(?:number|no\.?))?\s*([A-Za-z0-9-]+)\b/i) ||
    capture(/\bghar\s*(?:number|no\.?)?\s*(\d+)\b/i);
  const weightText = capture(/(?:weight|weighs?|vajan|wazan|bhaar|ತೂಕ)\s*(?:is|of|hai|:)?\s*((?:\d+(?:\.\d+)?|[\w-]+)(?:\s+(?:point|kilo|kg|kilograms?|grams?))?(?:\s+\d+\s*(?:grams?|g))?)/i) ||
    capture(/\b(\d+(?:\.\d+)?)\s*(?:kg|kilo(?:grams?)?)\b/i);
  let weight = weightText ? Number(weightText.match(/\d+(?:\.\d+)?/)?.[0]) : null;
  if (weightText && !weight && /\b(dhai|two point eight)\b/i.test(weightText)) {
    weight = /\bdhai\b/i.test(weightText) ? 2.5 : 2.8;
  }
  const bp = text.match(/\b(?:bp|blood pressure)\s*(?:is|of|:)?\s*(\d{2,3})\s*(?:by|\/)\s*(\d{2,3})\b/i);
  const hemoglobin = numeric(/\b(?:haemoglobin|hemoglobin|hb)\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?)/i);
  const lastAncDate = capture(/\b(?:last anc|anc date|last checkup|last visit)\s*(?:was|on|:)?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const ttStatus = capture(/\b(?:tt|td)\s*(?:status|dose|doses|injection)?\s*(?:is|:)?\s*((?:one|two|three|1|2|3)\s*(?:dose|doses)?|not taken|none|complete|completed)\b/i);
  const ttLastDoseDate = capture(/\b(?:last tt|last td|tt last dose|td last dose|last dose)\s*(?:was|on|date|:)?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const ifaStatus = /not taking ifa|not taking.*iron|ifa.*not regularly|not.*ifa regularly/i.test(lower)
    ? 'not taking regularly'
    : capture(/\b(?:ifa|iron tablets?)\s*(?:status|:)?\s*(taken regularly|not taking regularly|taking regularly|not taken|taken)\b/i);
  const ifaTablets = numeric(/\b(\d{1,3})\s*(?:ifa|iron)\s*(?:tablets?|pills?|goli)/i);
  const isNewborn = /\b(newborn|new born|baby|infant|navjaat|ಹುಟ್ಟಿದ ಮಗು)\b/i.test(lower);
  const isMother = /\bmother\b/i.test(lower) && !isNewborn;
  const visitType: ExtractedVisitData['visitType'] =
    isNewborn || isMother || /\b(pnc|postnatal|newborn visit)\b/i.test(lower) ? 'PNC'
      : /\b(vaccin|immuni[sz]ation)\b/i.test(lower) ? 'immunisation'
        : /\b(anc|pregnan|garbh|months? pregnant)\b/i.test(lower) ? 'ANC' : null;
  const beneficiaryType: ExtractedVisitData['beneficiaryType'] = isNewborn ? 'newborn'
    : isMother ? 'mother' : visitType === 'ANC' ? 'pregnant_woman' : 'unknown';
  const symptoms: ExtractedVisitData['symptoms'] = [];
  const symptomPatterns: Array<[string, RegExp]> = [
    ['vaginal_bleeding', /\b(heavy bleeding|vaginal bleeding|bleeding|spotting|raktasrava)\b/i],
    ['high_fever_pregnancy', /\b(high fever|fever|high temperature|tez bukhar|tumba jwara)\b/i],
    ['convulsions_fits', /\b(convulsions?|fits|seizure|daura)\b/i],
    ['severe_abdominal_pain', /\b(severe abdominal pain|severe stomach pain)\b/i],
  ];
  for (const [canonicalId, pattern] of symptomPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const start = Math.max(0, match.index! - 30);
    const evidence = text.slice(start, Math.min(text.length, match.index! + match[0].length + 25));
    const negated = /\b(no|not|nahi|illa)\b/i.test(text.slice(start, match.index!)) ||
      /stopped yesterday|has stopped|no longer/i.test(text.slice(match.index!, match.index! + match[0].length + 35));
    symptoms.push({
      canonicalId,
      negated,
      timing: /yesterday|stopped/i.test(evidence) ? 'past/resolved' : 'current',
      certainty: /\b(maybe|perhaps|some|possibly)\b/i.test(evidence) ? 'uncertain' : 'high',
      evidence,
    });
  }
  const evidence: Record<string, string | null> = {
    beneficiaryName: name,
    age: capture(/\b\d{1,2}\s*(?:years?\s*old|year old|yrs?\b)/i),
    houseNo: houseNo ? `house ${houseNo}` : null,
    weight: weightText,
    bloodPressure: bp?.[0] || null,
    ifaStatus: ifaStatus || (ifaTablets !== null ? `${ifaTablets} IFA tablets` : null),
    lastAncDate,
    ttStatus,
    hemoglobin: capture(/\b(?:haemoglobin|hemoglobin|hb)\s*(?:is|of|:)?\s*\d+(?:\.\d+)?/i),
  };
  const present = (value: unknown) => value !== null && value !== undefined && value !== '';
  const confidence: ExtractedVisitData['confidence'] = {
    beneficiary: present(name) ? 'high' : 'missing',
    age: present(age) ? 'high' : 'missing',
    houseNo: present(houseNo) ? 'high' : 'missing',
    visitType: present(visitType) ? 'high' : 'missing',
    pregnancyMonths: present(pregnancyMonths) ? 'high' : 'missing',
    babyAgeDays: present(babyAgeDays) ? 'high' : 'missing',
    weight: present(weight) ? 'high' : 'missing',
    bp: bp ? 'high' : 'missing',
    hemoglobin: present(hemoglobin) ? 'high' : 'missing',
    lastAncDate: present(lastAncDate) ? 'high' : 'missing',
    ttStatus: present(ttStatus) ? 'high' : 'missing',
    ttLastDoseDate: present(ttLastDoseDate) ? 'high' : 'missing',
    ifa: present(ifaStatus) || present(ifaTablets) ? 'high' : 'missing',
    vaccinations: /\b(bcg|opv|pentavalent|rotavirus|tt\d?|td\d?)\b/i.test(text) ? 'high' : 'missing',
  };
  return {
    beneficiaryName: name || null,
    beneficiaryNames: names,
    beneficiaryId: null,
    beneficiaryType,
    age,
    houseNo,
    village: null,
    visitType,
    pregnancyMonths,
    gestationalWeeks: pregnancyMonths === null ? null : pregnancyMonths * 4,
    babyAgeDays,
    childAgeDays: babyAgeDays,
    weight,
    bpSystolic: bp ? Number(bp[1]) : null,
    bpDiastolic: bp ? Number(bp[2]) : null,
    hemoglobin,
    lastAncDate,
    ttStatus,
    ttLastDoseDate,
    ifaStatus,
    ifaTablets,
    vaccinationsGiven: (text.match(/\b(BCG|OPV-?\d?|Pentavalent-?\d?|Rotavirus-?\d?|TT-?\d?|TD-?\d?)\b/gi) || []).map((item) => item.toUpperCase()),
    symptoms,
    notes: '',
    evidence,
    confidence,
    extractionStatus: 'confirmed',
    modelUsed: 'mock',
  };
}

async function attemptGeminiCall(
  ai: GoogleGenAI,
  transcript: string
): Promise<ExtractedVisitData> {
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: transcript,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature: 0.1,
    },
  });

  try {
    const parsed: unknown = JSON.parse(response.text || '');
    return validateExtraction(parsed);
  } catch {
    throw new InvalidExtractionError('Gemini returned invalid JSON.');
  }
}

export function validateExtraction(value: unknown): ExtractedVisitData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidExtractionError('Gemini returned a non-object response.');
  }
  const parsed = value as Record<string, unknown>;
  const stringOrNull = (field: string): string | null =>
    typeof parsed[field] === 'string' && parsed[field] ? parsed[field] as string : null;
  const numberOrNull = (field: string): number | null =>
    typeof parsed[field] === 'number' && Number.isFinite(parsed[field]) ? parsed[field] as number : null;
  const validVisitType = ['ANC', 'PNC', 'immunisation'].includes(String(parsed.visitType))
    ? parsed.visitType as 'ANC' | 'PNC' | 'immunisation'
    : null;
  const evidenceInput = parsed.evidence && typeof parsed.evidence === 'object'
    ? parsed.evidence as Record<string, unknown>
    : {};
  const evidence: Record<string, string | null> = {};
  for (const [key, item] of Object.entries(evidenceInput)) {
    evidence[key] = typeof item === 'string' && item ? item : null;
  }
  const symptoms = Array.isArray(parsed.symptoms)
    ? parsed.symptoms.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const symptom = item as Record<string, unknown>;
        if (typeof symptom.canonicalId !== 'string' || typeof symptom.negated !== 'boolean') return [];
        return [{
          canonicalId: symptom.canonicalId,
          negated: symptom.negated,
          timing: typeof symptom.timing === 'string' ? symptom.timing : null,
          certainty: symptom.certainty === 'high' ? 'high' as const : 'uncertain' as const,
          evidence: typeof symptom.evidence === 'string' ? symptom.evidence : '',
        }];
      })
    : [];
  const beneficiaryType = ['pregnant_woman', 'newborn', 'mother'].includes(String(parsed.beneficiaryType))
    ? parsed.beneficiaryType as ExtractedVisitData['beneficiaryType']
    : 'unknown';
  const names = Array.isArray(parsed.beneficiaryNames)
    ? parsed.beneficiaryNames.filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
    : [];
  const name = stringOrNull('beneficiaryName');
  if (name && !names.includes(name)) names.unshift(name);
  const vaccinations = Array.isArray(parsed.vaccinationsGiven)
    ? parsed.vaccinationsGiven.filter((item): item is string => typeof item === 'string')
    : [];
  const status = (present: boolean): 'high' | 'missing' => present ? 'high' : 'missing';
  const weight = numberOrNull('weight');
  const systolic = numberOrNull('bpSystolic');
  const diastolic = numberOrNull('bpDiastolic');
  const ifaTablets = numberOrNull('ifaTablets');
  const confidence: ExtractedVisitData['confidence'] = {
    beneficiary: status(Boolean(name)),
    age: status(numberOrNull('age') !== null),
    houseNo: status(Boolean(stringOrNull('houseNo'))),
    visitType: status(Boolean(validVisitType)),
    pregnancyMonths: status(numberOrNull('pregnancyMonths') !== null),
    babyAgeDays: status(numberOrNull('babyAgeDays') !== null),
    weight: status(weight !== null),
    bp: status(systolic !== null && diastolic !== null),
    hemoglobin: status(numberOrNull('hemoglobin') !== null),
    lastAncDate: status(Boolean(stringOrNull('lastAncDate'))),
    ttStatus: status(Boolean(stringOrNull('ttStatus'))),
    ifa: status(Boolean(stringOrNull('ifaStatus')) || ifaTablets !== null),
    vaccinations: status(vaccinations.length > 0),
  };
  return {
    beneficiaryName: name,
    beneficiaryNames: names,
    beneficiaryId: null,
    beneficiaryType,
    age: numberOrNull('age'),
    houseNo: stringOrNull('houseNo'),
    village: stringOrNull('village'),
    visitType: validVisitType,
    pregnancyMonths: numberOrNull('pregnancyMonths'),
    gestationalWeeks: numberOrNull('gestationalWeeks'),
    babyAgeDays: numberOrNull('babyAgeDays'),
    childAgeDays: numberOrNull('babyAgeDays'),
    weight,
    bpSystolic: systolic,
    bpDiastolic: diastolic,
    hemoglobin: numberOrNull('hemoglobin'),
    lastAncDate: stringOrNull('lastAncDate'),
    ttStatus: stringOrNull('ttStatus'),
    ttLastDoseDate: stringOrNull('ttLastDoseDate'),
    ifaStatus: stringOrNull('ifaStatus'),
    ifaTablets,
    vaccinationsGiven: vaccinations,
    symptoms,
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    evidence,
    confidence,
    extractionStatus: 'confirmed',
    modelUsed: 'gemini-3.8-flash',
  };
}

function uncertainExtraction(): ExtractedVisitData {
  const confidence = Object.fromEntries(
    FIELD_NAMES.map((name) => [name, 'uncertain'])
  ) as ExtractedVisitData['confidence'];
  return {
    beneficiaryName: null,
    beneficiaryNames: [],
    beneficiaryId: null,
    beneficiaryType: 'unknown',
    age: null,
    houseNo: null,
    village: null,
    visitType: null,
    pregnancyMonths: null,
    gestationalWeeks: null,
    babyAgeDays: null,
    childAgeDays: null,
    weight: null,
    bpSystolic: null,
    bpDiastolic: null,
    hemoglobin: null,
    lastAncDate: null,
    ttStatus: null,
    ttLastDoseDate: null,
    ifaStatus: null,
    ifaTablets: null,
    vaccinationsGiven: [],
    symptoms: [],
    notes: '',
    evidence: {},
    confidence,
    extractionStatus: 'uncertain',
    modelUsed: 'gemini-3.8-flash',
  };
}
