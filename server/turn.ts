import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDangerSigns, DANGER_SIGNS_LIST } from '../src/engine/dangerEngine.ts';
import { generateFollowups } from '../src/engine/followupEngine.ts';
import { parseWeight } from '../src/engine/numberEngine.ts';
import type { BeneficiaryRecord, DangerEngineResult, FollowupItem } from '../src/types/index.ts';
import { decryptPayload } from './crypto.ts';
import { saveVisitRecord } from './records.ts';
import {
  extractWithFallback,
  hasExtractedData,
  type ExtractionDiagnostics,
  type ExtractedVisitData,
} from './extractor.ts';

type FieldValue = unknown;
export interface TurnField {
  value: FieldValue;
  state: 'confirmed' | 'uncertain' | 'missing';
  evidence: string;
  detector?: 'LLM' | 'rule_engine' | 'manual_edit';
  previousValues?: Array<{ value: FieldValue; timestamp: string; evidence: string }>;
}
type TurnFields = Record<string, TurnField>;
interface TurnSession {
  id: string;
  language: string;
  transcript: string;
  fields: TurnFields;
  pendingQuestion: string | null;
  pendingField: string | null;
  duplicateCandidates: BeneficiaryRecord[];
  pendingDangerSignId: string | null;
  dangerClarifications: Record<string, 'present' | 'absent'>;
  pendingSave: boolean;
  savedRecord: Record<string, unknown> | null;
}
export interface TurnResponse {
  session_id: string;
  transcript: string;
  extracted: ExtractedVisitData;
  fields: TurnFields;
  questions: string[];
  answer_text: string | null;
  danger: DangerEngineResult;
  read_back_text: string | null;
  saved: boolean;
  encrypted_record: string | null;
  followups: FollowupItem[];
  referral_slip: string | null;
  saved_record: Record<string, unknown> | null;
  test_mode: boolean;
  roster_label: string | null;
  duplicate_candidates: BeneficiaryRecord[];
  rule: string;
  llm_status: 'ready' | 'retried' | 'busy';
  extraction_status: ExtractionDiagnostics | null;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BENEFICIARIES_FILE = process.env.ASHA_BENEFICIARIES_FILE || path.join(ROOT, 'data', 'beneficiaries.json');
const sessions = new Map<string, TurnSession>();
const recentTurns = new Map<string, { startedAt: number; result: Promise<TurnResponse> }>();
const EMPTY_FIELDS: TurnFields = Object.fromEntries([
  'name', 'beneficiaryId', 'age', 'beneficiaryType', 'pregnancyMonths', 'gestationalWeeks',
  'babyAgeDays', 'houseNo', 'village', 'visitType', 'visitDate', 'weight', 'bpSystolic',
  'bpDiastolic', 'hemoglobin', 'lastAncDate', 'ttStatus', 'ttLastDoseDate', 'ifaStatus',
  'ifaTablets', 'vaccinationsGiven', 'vaccinationsDue', 'symptoms', 'notes',
].map((key) => [key, { value: null, state: 'missing', evidence: '' }]));

const QUESTIONS: Record<string, Record<string, string>> = {
  'en-IN': {
    name: 'What is the beneficiary’s name?',
    visitType: 'Is this an ANC, postnatal, or immunisation visit?',
    weight: 'What is the weight?',
    pregnancyMonths: 'How many months pregnant?',
    babyAgeDays: 'How old is the baby in days or weeks?',
    bpSystolic: 'What is the blood pressure?',
    ifaStatus: 'Is she taking IFA tablets regularly?',
    lastAncDate: 'When was the last ANC visit?',
    ttStatus: 'How many TT or Td doses has she received, and when was the last dose?',
    houseNo: 'Which house number?',
    save: 'Everything else okay, save?',
    chooseHouse: 'There are people with this name. Which house is this visit for?',
    choosePerson: 'Which person is this visit for?',
  },
  'hi-IN': {
    name: 'लाभार्थी का नाम क्या है?',
    visitType: 'यह ANC, प्रसव के बाद की, या टीकाकरण की भेंट है?',
    weight: 'वजन कितना है?',
    pregnancyMonths: 'गर्भावस्था कितने महीने की है?',
    babyAgeDays: 'बच्चे की उम्र कितने दिन या सप्ताह है?',
    bpSystolic: 'रक्तचाप कितना है?',
    ifaStatus: 'क्या वे IFA की गोलियाँ नियमित ले रही हैं?',
    lastAncDate: 'पिछली ANC जांच कब हुई थी?',
    ttStatus: 'TT या Td की कितनी खुराक लगी हैं, और आखिरी खुराक कब लगी?',
    houseNo: 'मकान नंबर क्या है?',
    save: 'बाकी सब ठीक है, सेव करूँ?',
    chooseHouse: 'इस नाम के कई लोग हैं। यह किस मकान का दौरा है?',
    choosePerson: 'यह दौरा किस व्यक्ति के लिए है?',
  },
  'kn-IN': {
    name: 'ಫಲಾನುಭವಿಯ ಹೆಸರು ಏನು?',
    visitType: 'ಇದು ANC, ಪ್ರಸವಾನಂತರದ, ಅಥವಾ ಲಸಿಕೆ ಭೇಟಿ ಆಗಿದೆಯೇ?',
    weight: 'ತೂಕ ಎಷ್ಟು?',
    pregnancyMonths: 'ಗರ್ಭಾವಸ್ಥೆ ಎಷ್ಟು ತಿಂಗಳು?',
    babyAgeDays: 'ಮಗುವಿನ ವಯಸ್ಸು ಎಷ್ಟು ದಿನ ಅಥವಾ ವಾರ?',
    bpSystolic: 'ರಕ್ತದೊತ್ತಡ ಎಷ್ಟು?',
    ifaStatus: 'ಅವರು IFA ಮಾತ್ರೆಗಳನ್ನು ನಿಯಮಿತವಾಗಿ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದ್ದಾರೆಯೇ?',
    lastAncDate: 'ಕೊನೆಯ ANC ತಪಾಸಣೆ ಯಾವಾಗ ಆಯಿತು?',
    ttStatus: 'ಎಷ್ಟು TT ಅಥವಾ Td ಡೋಸ್ ಆಗಿದೆ, ಕೊನೆಯ ಡೋಸ್ ಯಾವಾಗ?',
    houseNo: 'ಮನೆಯ ಸಂಖ್ಯೆ ಏನು?',
    save: 'ಉಳಿದದ್ದೆಲ್ಲಾ ಸರಿಯೇ, ಉಳಿಸಬೇಕೇ?',
    chooseHouse: 'ಈ ಹೆಸರಿನ ಹಲವು ಜನರಿದ್ದಾರೆ. ಯಾವ ಮನೆಯ ಭೇಟಿ ಇದು?',
    choosePerson: 'ಈ ಭೇಟಿ ಯಾರಿಗಾಗಿ?',
  },
};

function question(language: string, field: string): string {
  const lang = QUESTIONS[language] || QUESTIONS['en-IN'];
  return lang[field] || QUESTIONS['en-IN'][field] || 'Please clarify this detail.';
}

function setField(
  fields: TurnFields,
  key: string,
  value: FieldValue,
  evidence = '',
  uncertain = false,
  detector: TurnField['detector'] = 'rule_engine'
) {
  if (value === null || value === undefined || value === '') return;
  const previous = fields[key];
  const previousValues = previous?.value !== null && previous?.value !== undefined &&
      JSON.stringify(previous.value) !== JSON.stringify(value)
    ? [
        ...(previous.previousValues || []),
        { value: previous.value, timestamp: new Date().toISOString(), evidence: previous.evidence },
      ]
    : previous?.previousValues;
  fields[key] = {
    value,
    state: uncertain ? 'uncertain' : 'confirmed',
    evidence,
    detector,
    ...(previousValues ? { previousValues } : {}),
  };
}

function mergeExtraction(fields: TurnFields, extracted: ExtractedVisitData, source: string) {
  const add = (key: string, value: FieldValue, evidenceKey: string, confidenceKey = evidenceKey) => {
    if (value === null || value === undefined || value === '') return;
    const evidence = extracted.evidence[evidenceKey] || source;
    const detector = extracted.extractionDiagnostics?.provider === 'Gemini' ||
      extracted.extractionDiagnostics?.provider === 'Groq'
      ? 'LLM'
      : 'rule_engine';
    setField(fields, key, value, evidence, extracted.confidence[confidenceKey] === 'uncertain', detector);
  };
  add('name', extracted.beneficiaryName, 'beneficiaryName', 'beneficiary');
  add('age', extracted.age, 'age');
  add('beneficiaryId', extracted.beneficiaryId, 'beneficiaryName');
  add('beneficiaryType', extracted.beneficiaryType === 'unknown' ? null : extracted.beneficiaryType, 'beneficiaryName');
  add('pregnancyMonths', extracted.pregnancyMonths, 'pregnancyMonths');
  add('gestationalWeeks', extracted.gestationalWeeks, 'pregnancyMonths');
  add('babyAgeDays', extracted.babyAgeDays, 'babyAgeDays');
  add('houseNo', extracted.houseNo, 'houseNo');
  add('village', extracted.village, 'village');
  add('visitType', extracted.visitType, 'visitType');
  add('weight', extracted.weight, 'weight');
  add('bpSystolic', extracted.bpSystolic, 'bloodPressure', 'bp');
  add('bpDiastolic', extracted.bpDiastolic, 'bloodPressure', 'bp');
  add('hemoglobin', extracted.hemoglobin, 'hemoglobin');
  add('lastAncDate', extracted.lastAncDate, 'lastAncDate');
  add('ttStatus', extracted.ttStatus, 'ttStatus');
  add('ttLastDoseDate', extracted.ttLastDoseDate, 'ttLastDoseDate');
  add('ifaStatus', extracted.ifaStatus || (extracted.ifaTablets !== null ? `${extracted.ifaTablets} tablets` : null), 'ifaStatus', 'ifa');
  add('ifaTablets', extracted.ifaTablets, 'ifaStatus', 'ifa');
  add('vaccinationsGiven', extracted.vaccinationsGiven.length ? extracted.vaccinationsGiven : null, 'vaccinations');
  add('vaccinationsDue', null, 'vaccinations');
  add('symptoms', extracted.symptoms.length ? extracted.symptoms.map((s) => ({
    canonicalId: s.canonicalId, negated: s.negated, timing: s.timing, certainty: s.certainty, evidence: s.evidence,
  })) : null, 'symptoms');
  add('notes', extracted.notes || null, 'notes');
}

function spokenResponse(session: TurnSession, extracted: ExtractedVisitData, danger: DangerEngineResult) {
  if (danger.decision === 'FLAG') return 'Danger sign recorded. Confirm the visit record; the urgent referral alert remains visible.';
  if (danger.decision === 'ASK' && danger.clarificationQuestions.length) return danger.clarificationQuestions[0];
  if (session.pendingQuestion) return session.pendingQuestion;
  return null;
}

async function loadRoster(): Promise<BeneficiaryRecord[]> {
  try {
    const content = await fs.readFile(BENEFICIARIES_FILE, 'utf8');
    const values: unknown = JSON.parse(content);
    return Array.isArray(values) ? values as BeneficiaryRecord[] : [];
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function findMissingField(session: TurnSession): string | null {
  const incomplete = (key: string) =>
    !session.fields[key] || session.fields[key].value === null || session.fields[key].state !== 'confirmed';
  const value = (key: string) => session.fields[key]?.value;
  if (incomplete('name')) return 'name';
  if (incomplete('houseNo')) return 'houseNo';
  if (incomplete('houseNo')) return 'houseNo';
  if (incomplete('visitType')) return 'visitType';
  if (incomplete('weight')) return 'weight';
  if (value('visitType') === 'ANC') {
    if (incomplete('pregnancyMonths')) return 'pregnancyMonths';
    if (incomplete('bpSystolic') || incomplete('bpDiastolic')) return 'bpSystolic';
    if (incomplete('ifaStatus')) return 'ifaStatus';
    if (incomplete('lastAncDate')) return 'lastAncDate';
    if (incomplete('ttStatus')) return 'ttStatus';
    if (incomplete('ttLastDoseDate')) return 'ttStatus';
  }
  if (value('visitType') === 'PNC' && incomplete('babyAgeDays')) {
    return 'babyAgeDays';
  }
  return null;
}

function validateCorrection(key: string, value: unknown): unknown {
  const numericRanges: Record<string, [number, number]> = {
    age: [1, 120],
    pregnancyMonths: [1, 10],
    gestationalWeeks: [1, 42],
    babyAgeDays: [0, 3650],
    weight: [0.8, 250],
    bpSystolic: [40, 300],
    bpDiastolic: [20, 200],
    hemoglobin: [2, 25],
    ifaTablets: [0, 1000],
  };
  if (key in numericRanges) {
    const number = typeof value === 'number' ? value : Number(value);
    const [min, max] = numericRanges[key];
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new Error(`The correction for ${key} is outside the accepted range.`);
    }
    return number;
  }
  if (key === 'visitType') {
    if (!['ANC', 'PNC', 'immunisation'].includes(String(value))) {
      throw new Error('Visit type must be ANC, PNC, or immunisation.');
    }
    return value;
  }
  if (key === 'beneficiaryType') {
    if (!['pregnant_woman', 'newborn', 'mother', 'unknown'].includes(String(value))) {
      throw new Error('Beneficiary type is invalid.');
    }
    return value;
  }
  if (key === 'vaccinationsGiven' || key === 'vaccinationsDue') {
    const items = Array.isArray(value) ? value : String(value).split(',');
    if (items.some((item) => typeof item !== 'string' || item.trim().length > 80)) {
      throw new Error('Vaccination names must be text.');
    }
    return items.map((item) => item.trim()).filter(Boolean);
  }
  if (key === 'symptoms') {
    if (typeof value !== 'string' && !Array.isArray(value)) {
      throw new Error('Symptoms must be entered as text or a list.');
    }
    return value;
  }
  if (key === 'lastAncDate' || key === 'ttLastDoseDate' || key === 'visitDate') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(`${value}T00:00:00`))) {
      throw new Error(`The correction for ${key} must be a date in YYYY-MM-DD format.`);
    }
    return value;
  }
  if (typeof value !== 'string' || value.trim().length > 500) {
    throw new Error(`The correction for ${key} must be text of 500 characters or fewer.`);
  }
  return value.trim();
}

function makeSavedRecord(session: TurnSession, danger: DangerEngineResult): Record<string, unknown> {
  const fields = session.fields;
  const visitDate = String(fields.visitDate.value || new Date().toISOString().slice(0, 10));
  const followups = generateFollowups(
    String(fields.visitType.value || 'ANC'),
    fields.gestationalWeeks.value === null ? null : Number(fields.gestationalWeeks.value),
    fields.babyAgeDays.value === null ? null : Number(fields.babyAgeDays.value),
    fields.ifaTablets.value === null ? null : Number(fields.ifaTablets.value),
    visitDate
  );
  return {
    id: `REC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    beneficiaryName: fields.name.value,
    beneficiaryId: fields.beneficiaryId.value || fields.name.value,
    village: fields.village.value,
    houseNo: fields.houseNo.value,
    visitType: fields.visitType.value,
    isFlagged: danger.decision === 'FLAG',
    dangerDecision: danger.decision,
    flaggedSigns: danger.flaggedSigns,
    referralSlip: danger.referralSlip,
    ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])),
    bp: fields.bpSystolic.value !== null && fields.bpDiastolic.value !== null
      ? `${fields.bpSystolic.value}/${fields.bpDiastolic.value}` : null,
    transcript: session.transcript,
    followups,
  };
}

function buildReadBack(fields: TurnFields, language: string): string {
  const parts: string[] = [];
  const name = fields.name?.value;
  const visitType = fields.visitType?.value;
  if (name) parts.push(String(name));
  if (visitType) parts.push(`${String(visitType)} visit`);
  const labels = language === 'kn-IN'
    ? ['ವಯಸ್ಸು', 'ಗರ್ಭಾವಸ್ಥೆ', 'ಮಗುವಿನ ವಯಸ್ಸು', 'ತೂಕ', 'ಸಿಸ್ಟೊಲಿಕ್ BP', 'ಡಯಾಸ್ಟೊಲಿಕ್ BP', 'ಹಿಮೋಗ್ಲೋಬಿನ್', 'ಕೊನೆಯ ANC', 'TT ಸ್ಥಿತಿ', 'ಕೊನೆಯ TT ಡೋಸ್']
    : language === 'hi-IN'
      ? ['उम्र', 'गर्भावस्था', 'बच्चे की उम्र', 'वजन', 'ऊपरी BP', 'निचला BP', 'हीमोग्लोबिन', 'पिछली ANC', 'TT स्थिति', 'आखिरी TT खुराक']
      : ['Age', 'Pregnancy', 'Baby age', 'Weight', 'systolic BP', 'diastolic BP', 'haemoglobin', 'Last ANC', 'TT status', 'Last TT dose'];
  const saveText = QUESTIONS[language]?.save || QUESTIONS['en-IN'].save;
  if (fields.houseNo?.value) parts.push(`House ${fields.houseNo.value}`);
  for (const [[key], label] of [
    [['age'], labels[0]], [['pregnancyMonths'], labels[1]], [['babyAgeDays'], labels[2]],
    [['weight'], labels[3]], [['bpSystolic'], labels[4]], [['bpDiastolic'], labels[5]],
    [['hemoglobin'], labels[6]], [['lastAncDate'], labels[7]], [['ttStatus'], labels[8]],
    [['ttLastDoseDate'], labels[9]],
  ]) {
    const field = fields[key];
    if (field && field.value !== null) {
      const value = field.state === 'uncertain'
        ? String(field.value).split('').map((digit) =>
            digit === '.' ? (language === 'hi-IN' ? 'दशमलव' : language === 'kn-IN' ? 'ದಶಮಾಂಶ' : 'point')
              : digit === '-' ? (language === 'hi-IN' ? 'डैश' : language === 'kn-IN' ? 'ಡ್ಯಾಶ್' : 'dash')
                : digit
          ).join(' ')
        : String(field.value);
      parts.push(`${label} ${value}`);
    }
  }
  const optionalMissing = [
    ['hemoglobin', 'haemoglobin'],
    ['ifaTablets', 'IFA tablet quantity'],
    ['vaccinationsGiven', 'vaccinations'],
    ['vaccinationsDue', 'vaccinations due'],
    ['symptoms', 'symptoms'],
  ].filter(([key]) => fields[key]?.value === null).map(([, label]) => label);
  if (optionalMissing.length) parts.push(`Not recorded: ${optionalMissing.join(', ')}`);
  return `${parts.join('. ')}. ${saveText}`.trim();
}

export function processTurn(
  input: {
    session_id: string;
    transcript: string;
    language: string;
    corrections?: Record<string, unknown>;
  },
  extract = extractWithFallback
): Promise<TurnResponse> {
  const transcript = input.transcript.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  if (!transcript) return processTurnOnce(input, extract);
  const key = `${input.session_id}\u0000${transcript}`;
  const now = Date.now();
  for (const [oldKey, value] of recentTurns) {
    if (now - value.startedAt > 3_000) recentTurns.delete(oldKey);
  }
  const duplicate = recentTurns.get(key);
  if (duplicate && now - duplicate.startedAt <= 3_000) return duplicate.result;
  const entry: { startedAt: number; result: Promise<TurnResponse> } = {
    startedAt: now,
    result: processTurnOnce(input, extract),
  };
  recentTurns.set(key, entry);
  void entry.result.catch(() => {
    if (recentTurns.get(key) === entry) recentTurns.delete(key);
  });
  return entry.result;
}

async function processTurnOnce(
  input: {
    session_id: string;
    transcript: string;
    language: string;
    corrections?: Record<string, unknown>;
  },
  extract: (transcript: string, language?: string) => Promise<ExtractedVisitData>
): Promise<TurnResponse> {
  const text = input.transcript.trim();
  if (!input.session_id || (!text && !input.corrections)) {
    throw new Error('session_id and transcript or field corrections are required.');
  }
  const language = ['en-IN', 'hi-IN', 'kn-IN'].includes(input.language) ? input.language : 'en-IN';
  const session: TurnSession = sessions.get(input.session_id) || {
    id: input.session_id,
    language,
    transcript: '',
    fields: {
      ...structuredClone(EMPTY_FIELDS),
      visitDate: {
        value: new Date().toISOString().slice(0, 10),
        state: 'confirmed',
        evidence: 'System visit date',
      },
    },
    pendingQuestion: null,
    pendingField: null,
    duplicateCandidates: [],
    pendingDangerSignId: null,
    dangerClarifications: {},
    pendingSave: false,
    savedRecord: null,
  };
  session.language = language;
  const previousQuestion = session.pendingQuestion;
  const pendingField = session.pendingField;
  session.transcript = [session.transcript, text].filter(Boolean).join('. ');
  const currentLower = text.toLowerCase();
  if (session.savedRecord) {
    sessions.set(session.id, session);
    const storedDanger = evaluateDangerSigns(
      session.transcript,
      language,
      String(session.fields.name.value || 'Beneficiary'),
      String(session.fields.beneficiaryId.value || 'ID-Pending'),
      'ASHA-001',
      session.dangerClarifications
    );
    if (session.savedRecord.isFlagged === true) {
      storedDanger.decision = 'FLAG';
      storedDanger.flaggedSigns = Array.isArray(session.savedRecord.flaggedSigns)
        ? session.savedRecord.flaggedSigns as DangerEngineResult['flaggedSigns']
        : storedDanger.flaggedSigns;
      storedDanger.referralSlip = typeof session.savedRecord.referralSlip === 'string'
        ? session.savedRecord.referralSlip
        : storedDanger.referralSlip;
    }
    return response(session, emptyExtraction(), storedDanger, [], null, [], session.savedRecord);
  }

  const allowedCorrections = new Set(Object.keys(EMPTY_FIELDS));
  for (const [key, value] of Object.entries(input.corrections || {})) {
    if (!allowedCorrections.has(key)) throw new Error(`Unsupported correction field: ${key}`);
    if (value === null || value === undefined || value === '') continue;
    setField(session.fields, key, validateCorrection(key, value), 'Manual keypad correction', false, 'manual_edit');
  }
  if (
    session.duplicateCandidates.length &&
    session.duplicateCandidates.some((candidate) => candidate.id === session.fields.beneficiaryId.value)
  ) {
    session.duplicateCandidates = [];
    session.pendingQuestion = null;
    session.pendingField = null;
  }

  if (session.pendingSave && /^(yes|yeah|yep|correct|okay|ok|save|haan|हां|हाँ|ಹೌದು)\b/i.test(currentLower)) {
    const danger = evaluateDangerSigns(
      session.transcript,
      language,
      String(session.fields.name.value || 'Beneficiary'),
      String(session.fields.beneficiaryId.value || 'ID-Pending'),
      'ASHA-001',
      session.dangerClarifications
    );
    const record = makeSavedRecord(session, danger);
    const encryptedRecord = await saveVisitRecord(record as Parameters<typeof saveVisitRecord>[0]);
    session.savedRecord = record;
    session.pendingSave = false;
    session.pendingQuestion = null;
    sessions.set(session.id, session);
    const savedLine = language === 'kn-IN'
      ? 'ಭೇಟಿಯನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಉಳಿಸಲಾಗಿದೆ. ಮುಂದಿನ ಅನುಸರಣೆ ಪಟ್ಟಿ ಇಲ್ಲಿದೆ.'
      : language === 'hi-IN'
        ? 'भेंट सुरक्षित रूप से सेव हुई। आगे की जांच सूची यह रही।'
        : 'Visit saved securely. Here is the follow-up list.';
    return response(session, emptyExtraction(), danger, [], savedLine, record.followups as FollowupItem[], record, encryptedRecord);
  }

  const extractionLabels: Record<string, string> = {
    name: 'beneficiary name',
    houseNo: 'house number',
    visitType: 'visit type',
    pregnancyMonths: 'pregnancy duration in months',
    weight: 'weight',
    bpSystolic: 'blood pressure',
    lastAncDate: 'last ANC date',
    ttStatus: 'TT status and last TT dose date',
    ifaStatus: 'IFA status',
    babyAgeDays: 'baby age in days',
  };
  const pendingFieldPattern: Record<string, RegExp> = {
    name: /\b(name|beneficiary)\b/i,
    houseNo: /\b(house|ghar)\b/i,
    visitType: /\b(anc|pnc|postnatal|immunisation|immunization)\b/i,
    pregnancyMonths: /\b(months?|weeks?)\b/i,
    weight: /\b(weight|kilo|kg|vajan|wazan)\b/i,
    bpSystolic: /\b(bp|blood pressure)\b/i,
    lastAncDate: /\b(last anc|anc date|last checkup|last visit)\b/i,
    ttStatus: /\b(tt|td|dose|doses)\b/i,
    ifaStatus: /\b(ifa|iron)\b/i,
    babyAgeDays: /\b(baby|days?|weeks?)\b/i,
  };
  const extractionText = pendingField && extractionLabels[pendingField] &&
    !pendingFieldPattern[pendingField]?.test(text)
    ? `${extractionLabels[pendingField]} ${text}`
    : text;
  const extracted = text ? await extract(extractionText, language) : emptyExtraction();
  mergeExtraction(session.fields, extracted, text);

  if (pendingField === 'houseNo' && session.duplicateCandidates.length) {
    const digits = text.match(/\b[A-Za-z0-9-]+\b/)?.[0];
    if (digits) {
      const selected = session.duplicateCandidates.find((item) => item.house_no === digits);
      if (selected) {
        setField(session.fields, 'name', selected.name, text);
        setField(session.fields, 'beneficiaryId', selected.id, text);
        setField(session.fields, 'houseNo', selected.house_no, text);
        setField(session.fields, 'village', selected.village, text);
        setField(session.fields, 'age', selected.age, text);
        session.duplicateCandidates = [];
      }
    }
  }
  if (pendingField === 'ttStatus') {
    const answerDate = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)?.[1];
    if (answerDate) setField(session.fields, 'ttLastDoseDate', answerDate, text);
    if (!session.fields.ttStatus.value && /\b(one|two|three|1|2|3)\b/i.test(text)) {
      const doses = text.match(/\b(one|two|three|1|2|3)\b/i)?.[1];
      setField(session.fields, 'ttStatus', `${doses} doses`, text);
    }
  }
  const isWeightCorrection = /^(?:no[, ]*)?(?:weight\s*(?:is|:)?\s*)?\d+(?:\.\d+)?\s*(?:kg|kilo)?$/i.test(text);
  if ((pendingField === 'weight' && isWeightCorrection) ||
      /^(?:no[, ]*)?weight\s*(?:is|:)?\s*\d+(?:\.\d+)?\s*(?:kg|kilo)?$/i.test(text)) {
    const correction = Number(text.match(/\d+(?:\.\d+)?/)?.[0]);
    setField(session.fields, 'weight', correction, text);
  }
  if (pendingField === 'bpSystolic') {
    const bpMatch = text.match(/(\d{2,3})\s*(?:by|\/)\s*(\d{2,3})/i);
    if (bpMatch) {
      setField(session.fields, 'bpSystolic', Number(bpMatch[1]), text);
      setField(session.fields, 'bpDiastolic', Number(bpMatch[2]), text);
    }
  }
  session.pendingQuestion = null;
  session.pendingField = null;

  const roster = await loadRoster();
  const mentionedNames = extracted.beneficiaryNames;
  if (mentionedNames.length > 1 && !previousQuestion?.includes('person')) {
    session.pendingQuestion = question(language, 'choosePerson');
    session.pendingField = 'name';
  } else if (previousQuestion === question(language, 'choosePerson')) {
    const selected = mentionedNames.find((candidate) => text.toLowerCase().includes(candidate.toLowerCase()));
    if (selected) setField(session.fields, 'name', selected, text);
  }

  let rosterLabel: string | null = null;
  const currentName = String(session.fields.name.value || '');
  if (currentName && !session.pendingQuestion) {
    const matches = roster.filter((item) => item.name.toLowerCase() === currentName.toLowerCase());
    const house = String(session.fields.houseNo.value || '');
    const village = String(session.fields.village.value || '');
    const sameNameRepeated = (text.toLowerCase().split(currentName.toLowerCase()).length - 1) > 1;
    if (matches.length > 1 && (!house || sameNameRepeated)) {
      session.duplicateCandidates = matches;
      session.pendingQuestion = question(language, 'chooseHouse');
      session.pendingField = 'houseNo';
    } else if (matches.length > 1 && house && !matches.some((item) =>
      item.house_no === house && (!village || item.village.toLowerCase() === village.toLowerCase())
    )) {
      session.duplicateCandidates = matches;
      session.pendingQuestion = question(language, 'chooseHouse');
      session.pendingField = 'houseNo';
    } else if (matches.length > 1 && house) {
      const selected = matches.find((item) =>
        item.house_no === house && (!village || item.village.toLowerCase() === village.toLowerCase())
      );
      if (selected) {
        setField(session.fields, 'beneficiaryId', selected.id, currentName);
        setField(session.fields, 'village', selected.village, currentName);
        if (session.fields.age.value === null && selected.age !== null) {
          setField(session.fields, 'age', selected.age, currentName);
        }
      }
    } else if (matches.length === 1 && (!house || matches[0].house_no === house)) {
      setField(session.fields, 'beneficiaryId', matches[0].id, currentName);
      if (!house) setField(session.fields, 'houseNo', matches[0].house_no, currentName);
      if (!village) setField(session.fields, 'village', matches[0].village, currentName);
      if (session.fields.age.value === null && matches[0].age !== null) {
        setField(session.fields, 'age', matches[0].age, currentName);
      }
    } else {
      const houseNo = String(session.fields.houseNo.value || '');
      if (!houseNo) {
        // Do not create a beneficiary record until identifying details are available.
      } else {
      const created: BeneficiaryRecord = {
        id: `NEW-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: currentName,
        house_no: houseNo,
        village: String(session.fields.village.value || ''),
        category: session.fields.visitType.value === 'PNC' ? 'PNC' : 'ANC',
        age: typeof session.fields.age.value === 'number' ? session.fields.age.value : null,
        isNew: true,
      };
      await fs.mkdir(path.dirname(BENEFICIARIES_FILE), { recursive: true });
      await fs.writeFile(BENEFICIARIES_FILE, JSON.stringify([...await loadRoster(), created], null, 2), 'utf8');
      setField(session.fields, 'beneficiaryId', created.id, currentName);
      rosterLabel = 'created';
      }
    }
  }

  const weightText = String(session.fields.weight.evidence || '');
  const parsedWeight = parseWeight(
    weightText || extracted.evidence.weight || '',
    session.fields.beneficiaryType.value === 'newborn' ? 'newborn' : 'adult',
    language
  );
  if (session.fields.weight.value === null && parsedWeight.value !== null) {
    setField(session.fields, 'weight', parsedWeight.value, parsedWeight.rawText, parsedWeight.state === 'uncertain');
  } else if (session.fields.weight.value !== null && parsedWeight.state === 'uncertain') {
    session.fields.weight.state = 'uncertain';
  }
  const systolic = Number(session.fields.bpSystolic.value);
  const diastolic = Number(session.fields.bpDiastolic.value);
  if (session.fields.bpSystolic.value !== null &&
      (systolic < 70 || systolic > 250 || diastolic < 40 || diastolic > 150)) {
    session.fields.bpSystolic.state = 'uncertain';
    session.fields.bpDiastolic.state = 'uncertain';
  }
  const affirmativeSymptomAnswer = /^(yes|yeah|yep|haan|हां|हाँ|ಹೌದು)\b/i.test(currentLower);
  const negativeSymptomAnswer = /^(no|nope|nahi|नहीं|ಇಲ್ಲ)\b/i.test(currentLower);
  const symptomSignId = pendingField === 'symptoms' ? session.pendingDangerSignId : null;
  if (symptomSignId && (affirmativeSymptomAnswer || negativeSymptomAnswer)) {
    session.dangerClarifications[symptomSignId] = affirmativeSymptomAnswer ? 'present' : 'absent';
    const existing = Array.isArray(session.fields.symptoms.value)
      ? session.fields.symptoms.value as Array<Record<string, unknown>>
      : [];
    setField(session.fields, 'symptoms', [
      ...existing.filter((item) => item.canonicalId !== symptomSignId),
      {
        canonicalId: symptomSignId,
        negated: negativeSymptomAnswer,
        timing: 'current',
        certainty: 'high',
        evidence: text,
      },
    ], text, false, 'manual_edit');
    session.pendingDangerSignId = null;
  } else if (text) {
    for (const sign of DANGER_SIGNS_LIST) {
      if (sign.synonyms.some((synonym) => currentLower.includes(synonym.toLowerCase()))) {
        delete session.dangerClarifications[sign.id];
      }
    }
  }
  const danger = evaluateDangerSigns(
    session.transcript,
    language,
    currentName || 'Beneficiary',
    String(session.fields.beneficiaryId.value || 'ID-Pending'),
    'ASHA-001',
    session.dangerClarifications
  );
  if (danger.decision === 'FLAG') {
    session.pendingSave = true;
    session.pendingQuestion = question(language, 'save');
    sessions.set(session.id, session);
    const announcement = rosterLabel ? `New beneficiary ${currentName} added. ` : '';
    const readBack = `Urgent referral alert. ${buildReadBack(session.fields, language)}`;
    return response(session, extracted, danger, [session.pendingQuestion], `${announcement}${spokenResponse(session, extracted, danger)}`,
      [], null, null, readBack, rosterLabel);
  }
  const isDangerClarification = Boolean(
    symptomSignId && (affirmativeSymptomAnswer || negativeSymptomAnswer)
  );
  if (
    extracted.extractionDiagnostics?.provider === 'Rules' &&
    !hasExtractedData(extracted) &&
    !isDangerClarification
  ) {
    const retryMessage = language === 'hi-IN'
      ? 'माफ़ कीजिए, मैं समझ नहीं पाया। कृपया एक बार फिर कहें।'
      : language === 'kn-IN'
        ? 'ಕ್ಷಮಿಸಿ, ನನಗೆ ಅರ್ಥವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ.'
        : 'Sorry, I did not catch that. Please say it once more.';
    session.pendingQuestion = retryMessage;
    session.pendingField = null;
    sessions.set(session.id, session);
    return response(
      session, extracted, danger, [retryMessage], retryMessage, [],
      null, null, null, null, danger.ruleFired, 'busy'
    );
  }
  if (session.pendingQuestion) {
    // Keep disambiguation questions ahead of normal required-field questions.
  } else if (danger.decision === 'ASK' && danger.clarificationQuestions.length) {
    const symptomLabels = language === 'kn-IN'
      ? { vaginal_bleeding: 'ರಕ್ತಸ್ರಾವ', high_fever_pregnancy: 'ಹೆಚ್ಚಿನ ಜ್ವರ' }
      : language === 'hi-IN'
        ? { vaginal_bleeding: 'रक्तस्राव', high_fever_pregnancy: 'तेज़ बुखार' }
        : { vaginal_bleeding: 'bleeding', high_fever_pregnancy: 'high fever' };
    const uncertainSign = danger.evidence.find((item) => item.state === 'ASK')?.signId || 'vaginal_bleeding';
    const label = symptomLabels[uncertainSign as keyof typeof symptomLabels] || uncertainSign.replace(/_/g, ' ');
    session.pendingQuestion = language === 'kn-IN'
      ? `ಈಗ ${label} ಇದೆಯೇ? ಹೌದು ಅಥವಾ ಇಲ್ಲ ಎಂದು ಹೇಳಿ.`
      : language === 'hi-IN'
        ? `क्या अभी ${label} है? कृपया हाँ या नहीं कहें।`
        : `Is there ${label} now? Please answer yes or no.`;
    session.pendingField = 'symptoms';
    session.pendingDangerSignId = danger.evidence.find((item) => item.state === 'ASK')?.signId || null;
  } else {
    if (parsedWeight.isConfusable) {
      session.pendingField = 'weight';
      session.pendingQuestion = language === 'en-IN'
        ? 'Did you say seven (7) or sixty (60)? Please confirm.'
        : language === 'kn-IN'
          ? 'ನೀವು ಏಳು (7) ಎಂದಿರಾ ಅಥವಾ ಅರವತ್ತು (60) ಎಂದಿರಾ? ದಯವಿಟ್ಟು ಖಚಿತಪಡಿಸಿ.'
          : parsedWeight.confusablePrompt || question(language, 'weight');
    } else if (findMissingField(session)) {
      const missing = findMissingField(session)!;
      session.pendingField = missing;
      session.pendingQuestion = question(language, missing);
    } else {
      session.pendingSave = true;
      session.pendingQuestion = question(language, 'save');
    }
  }
  const questions = session.pendingQuestion ? [session.pendingQuestion] : [];
  const readBack = session.pendingSave ? buildReadBack(session.fields, language) : null;
  sessions.set(session.id, session);
  const answerText = spokenResponse(session, extracted, danger);
  const announcedAnswer = rosterLabel
    ? `New beneficiary ${currentName} added. ${answerText || ''}`.trim()
    : answerText;
  return response(session, extracted, danger, questions, announcedAnswer, [], null, null, readBack, rosterLabel, parsedWeight.explanation);
}

function emptyExtraction(): ExtractedVisitData {
  return {
    beneficiaryName: null, beneficiaryNames: [], beneficiaryId: null, beneficiaryType: 'unknown',
    age: null, houseNo: null, village: null, visitType: null, pregnancyMonths: null,
    gestationalWeeks: null, babyAgeDays: null, childAgeDays: null, weight: null,
    bpSystolic: null, bpDiastolic: null, hemoglobin: null, lastAncDate: null,
    ttStatus: null, ttLastDoseDate: null, ifaStatus: null, ifaTablets: null, vaccinationsGiven: [], symptoms: [],
    notes: '', evidence: {}, confidence: {}, extractionStatus: 'confirmed', modelUsed: process.env.LLM_PROVIDER === 'mock' ? 'mock' : process.env.LLM_MODEL?.trim() || 'unconfigured',
  };
}

function response(
  session: TurnSession,
  extracted: ExtractedVisitData,
  danger: DangerEngineResult,
  questions: string[],
  answerText: string | null,
  followups: FollowupItem[],
  record: Record<string, unknown> | null,
  encryptedRecord: string | null = null,
  readBackText: string | null = null,
  rosterLabel: string | null = null,
  rule = danger.ruleFired,
  llmStatus: TurnResponse['llm_status'] = extracted.llmStatus || 'ready',
): TurnResponse {
  return {
    session_id: session.id,
    transcript: session.transcript,
    extracted,
    fields: structuredClone(session.fields),
    questions,
    answer_text: answerText,
    danger,
    read_back_text: readBackText,
    saved: Boolean(record),
    encrypted_record: encryptedRecord,
    followups,
    referral_slip: danger.referralSlip,
    saved_record: record,
    test_mode: process.env.LLM_PROVIDER === 'mock',
    roster_label: rosterLabel,
    duplicate_candidates: [...session.duplicateCandidates],
    rule,
    llm_status: llmStatus,
    extraction_status: extracted.extractionDiagnostics || null,
  };
}

export function resetTurnSessions(): void {
  sessions.clear();
  recentTurns.clear();
}

export function discardTurnSession(sessionId: string): void {
  sessions.delete(sessionId);
  for (const key of recentTurns.keys()) {
    if (key.startsWith(`${sessionId}\u0000`)) recentTurns.delete(key);
  }
}

export function decryptSavedTurn(token: string): Record<string, unknown> {
  return JSON.parse(decryptPayload(token)) as Record<string, unknown>;
}
