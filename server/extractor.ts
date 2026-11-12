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
    'ttStatus', 'ifaStatus', 'ifaTablets', 'vaccinationsGiven', 'symptoms',
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
  _lang: string = 'en-IN'
): Promise<ExtractedVisitData> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error('LLM_API_KEY is missing. Set LLM_API_KEY in the .env file in the project root, then restart the backend.');
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

async function attemptGeminiCall(
  ai: GoogleGenAI,
  transcript: string
): Promise<ExtractedVisitData> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
    ifaStatus: stringOrNull('ifaStatus'),
    ifaTablets,
    vaccinationsGiven: vaccinations,
    symptoms,
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    evidence,
    confidence,
    extractionStatus: 'confirmed',
    modelUsed: 'gemini-2.5-flash',
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
    ifaStatus: null,
    ifaTablets: null,
    vaccinationsGiven: [],
    symptoms: [],
    notes: '',
    evidence: {},
    confidence,
    extractionStatus: 'uncertain',
    modelUsed: 'gemini-2.5-flash',
  };
}
