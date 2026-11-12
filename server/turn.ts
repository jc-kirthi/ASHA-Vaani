import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDangerSigns, DANGER_SIGNS_LIST } from '../src/engine/dangerEngine.ts';
import { generateFollowups } from '../src/engine/followupEngine.ts';
import { parseWeight } from '../src/engine/numberEngine.ts';
import { SYNTHETIC_ROSTER } from '../src/data/rosterData.ts';
import type { BeneficiaryRecord, DangerEngineResult, FollowupItem } from '../src/types/index.ts';
import { decryptPayload, encryptPayload } from './crypto.ts';
import {
  extractWithGemini,
  GeminiUnavailableError,
  type ExtractedVisitData,
} from './extractor.ts';

type FieldValue = unknown;
export interface TurnField {
  value: FieldValue;
  state: 'confirmed' | 'uncertain' | 'missing';
  evidence: string;
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
  rule: string;
  llm_status: 'ready' | 'retried' | 'busy';
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BENEFICIARIES_FILE = process.env.ASHA_BENEFICIARIES_FILE || path.join(ROOT, 'data', 'beneficiaries.json');
const sessions = new Map<string, TurnSession>();
const EMPTY_FIELDS: TurnFields = Object.fromEntries([
  'name', 'age', 'beneficiaryType', 'pregnancyMonths', 'babyAgeDays', 'houseNo',
  'visitType', 'weight', 'bpSystolic', 'bpDiastolic', 'hemoglobin', 'lastAncDate',
  'ttStatus', 'ttLastDoseDate', 'ifaStatus', 'vaccinationsGiven', 'symptoms', 'notes',
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

function setField(fields: TurnFields, key: string, value: FieldValue, evidence = '', uncertain = false) {
  if (value === null || value === undefined || value === '') return;
  fields[key] = { value, state: uncertain ? 'uncertain' : 'confirmed', evidence };
}

function mergeExtraction(fields: TurnFields, extracted: ExtractedVisitData, source: string) {
  const add = (key: string, value: FieldValue, evidenceKey: string, confidenceKey = evidenceKey) => {
    if (value === null || value === undefined || value === '') return;
    const evidence = extracted.evidence[evidenceKey] || source;
    setField(fields, key, value, evidence, extracted.confidence[confidenceKey] === 'uncertain');
  };
  add('name', extracted.beneficiaryName, 'beneficiaryName', 'beneficiary');
  add('age', extracted.age, 'age');
  add('beneficiaryType', extracted.beneficiaryType === 'unknown' ? null : extracted.beneficiaryType, 'beneficiaryName');
  add('pregnancyMonths', extracted.pregnancyMonths, 'pregnancyMonths');
  add('babyAgeDays', extracted.babyAgeDays, 'babyAgeDays');
  add('houseNo', extracted.houseNo, 'houseNo');
  add('visitType', extracted.visitType, 'visitType');
  add('weight', extracted.weight, 'weight');
  add('bpSystolic', extracted.bpSystolic, 'bloodPressure', 'bp');
  add('bpDiastolic', extracted.bpDiastolic, 'bloodPressure', 'bp');
  add('hemoglobin', extracted.hemoglobin, 'hemoglobin');
  add('lastAncDate', extracted.lastAncDate, 'lastAncDate');
  add('ttStatus', extracted.ttStatus, 'ttStatus');
  add('ttLastDoseDate', extracted.ttLastDoseDate, 'ttLastDoseDate');
  add('ifaStatus', extracted.ifaStatus || (extracted.ifaTablets !== null ? `${extracted.ifaTablets} tablets` : null), 'ifaStatus', 'ifa');
  add('vaccinationsGiven', extracted.vaccinationsGiven.length ? extracted.vaccinationsGiven : null, 'vaccinations');
  add('symptoms', extracted.symptoms.length ? extracted.symptoms.map((s) => ({
    canonicalId: s.canonicalId, negated: s.negated, timing: s.timing, certainty: s.certainty, evidence: s.evidence,
  })) : null, 'symptoms');
  add('notes', extracted.notes || null, 'notes');
}

function spokenResponse(session: TurnSession, extracted: ExtractedVisitData, danger: DangerEngineResult) {
  if (danger.decision === 'FLAG') return 'Please refer to the PHC now.';
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
  const value = (key: string) => session.fields[key]?.value;
  if (!value('name')) return 'name';
  if (!value('visitType')) return 'visitType';
  if (value('weight') === null) return 'weight';
  if (value('visitType') === 'ANC') {
    if (!value('pregnancyMonths')) return 'pregnancyMonths';
    if (!value('bpSystolic') || !value('bpDiastolic')) return 'bpSystolic';
    if (!value('ifaStatus')) return 'ifaStatus';
    if (!value('lastAncDate')) return 'lastAncDate';
    if (!value('ttStatus')) return 'ttStatus';
    if (!value('ttLastDoseDate')) return 'ttStatus';
  }
  if (value('visitType') === 'PNC') {
    if (!value('babyAgeDays')) return 'babyAgeDays';
  }
  return null;
}

function buildReadBack(fields: TurnFields, language: string): string {
  const parts: string[] = [];
  const labels = language === 'kn-IN'
    ? ['ವಯಸ್ಸು', 'ಗರ್ಭಾವಸ್ಥೆ', 'ಮಗುವಿನ ವಯಸ್ಸು', 'ತೂಕ', 'ಸಿಸ್ಟೊಲಿಕ್ BP', 'ಡಯಾಸ್ಟೊಲಿಕ್ BP', 'ಹಿಮೋಗ್ಲೋಬಿನ್', 'ಕೊನೆಯ ANC', 'TT ಸ್ಥಿತಿ', 'ಕೊನೆಯ TT ಡೋಸ್']
    : language === 'hi-IN'
      ? ['उम्र', 'गर्भावस्था', 'बच्चे की उम्र', 'वजन', 'ऊपरी BP', 'निचला BP', 'हीमोग्लोबिन', 'पिछली ANC', 'TT स्थिति', 'आखिरी TT खुराक']
      : ['Age', 'Pregnancy', 'Baby age', 'Weight', 'systolic BP', 'diastolic BP', 'haemoglobin', 'Last ANC', 'TT status', 'Last TT dose'];
  const saveText = QUESTIONS[language]?.save || QUESTIONS['en-IN'].save;
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
  return `${parts.join('. ')}. ${saveText}`.trim();
}

export async function processTurn(
  input: {
    session_id: string;
    transcript: string;
    language: string;
    corrections?: Record<string, unknown>;
  },
  extract = extractWithGemini
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
    fields: structuredClone(EMPTY_FIELDS),
    pendingQuestion: null,
    pendingField: null,
    duplicateCandidates: [],
    pendingSave: false,
    savedRecord: null,
  };
  session.language = language;
  const previousQuestion = session.pendingQuestion;
  const pendingField = session.pendingField;
  session.transcript = [session.transcript, text].filter(Boolean).join(' ');
  const currentLower = text.toLowerCase();
  if (session.savedRecord) {
    sessions.set(session.id, session);
    return response(session, emptyExtraction(), evaluateDangerSigns(session.transcript, language), [], null, [], session.savedRecord);
  }

  const allowedCorrections = new Set(Object.keys(EMPTY_FIELDS));
  for (const [key, value] of Object.entries(input.corrections || {})) {
    if (!allowedCorrections.has(key) || value === null || value === undefined || value === '') continue;
    setField(session.fields, key, value, 'Manual keypad correction');
  }

  if (session.pendingSave && /^(yes|yeah|yep|correct|okay|ok|save|haan|हां|हाँ|ಹೌದು)\b/i.test(currentLower)) {
    const record: Record<string, unknown> = {
      id: `REC-${Date.now()}`,
      timestamp: new Date().toISOString(),
      beneficiaryName: session.fields.name.value,
      beneficiaryId: session.fields.name.value,
      houseNo: session.fields.houseNo.value,
      visitType: session.fields.visitType.value,
      weight: session.fields.weight.value,
      bp: session.fields.bpSystolic.value && session.fields.bpDiastolic.value
        ? `${session.fields.bpSystolic.value}/${session.fields.bpDiastolic.value}` : null,
      isFlagged: false,
      flaggedSigns: [],
      ...Object.fromEntries(Object.entries(session.fields).map(([key, field]) => [key, field.value])),
      transcript: session.transcript,
    };
    const followups = generateFollowups(
      String(session.fields.visitType.value || 'ANC'),
      session.fields.pregnancyMonths.value ? Number(session.fields.pregnancyMonths.value) * 4 : null,
      session.fields.babyAgeDays.value ? Number(session.fields.babyAgeDays.value) : null,
      null
    );
    record.followups = followups;
    const encryptedRecord = encryptPayload(record);
    session.savedRecord = record;
    session.pendingSave = false;
    session.pendingQuestion = null;
    sessions.set(session.id, session);
    const savedLine = language === 'kn-IN'
      ? 'ಭೇಟಿಯನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಉಳಿಸಲಾಗಿದೆ. ಮುಂದಿನ ಅನುಸರಣೆ ಪಟ್ಟಿ ಇಲ್ಲಿದೆ.'
      : language === 'hi-IN'
        ? 'भेंट सुरक्षित रूप से सेव हुई। आगे की जांच सूची यह रही।'
        : 'Visit saved securely. Here is the follow-up list.';
    return response(session, emptyExtraction(), evaluateDangerSigns(session.transcript, language), [], savedLine, followups, record, encryptedRecord);
  }

  let extractionText = session.transcript;
  if (pendingField && pendingField !== 'name' && pendingField !== 'visitType' && pendingField !== 'weight') {
    extractionText += ` ${pendingField === 'lastAncDate' ? 'last ANC date' : pendingField === 'ttStatus' ? 'TT status' : pendingField} ${text}`;
  } else if (pendingField === 'weight') {
    extractionText += ` weight ${text}`;
  }
  let extracted: ExtractedVisitData;
  try {
    extracted = text ? await extract(extractionText, language) : emptyExtraction();
  } catch (error) {
    if (!(error instanceof GeminiUnavailableError)) throw error;
    sessions.set(session.id, session);
    const failedExtraction = {
      ...emptyExtraction(),
      extractionStatus: 'uncertain' as const,
      modelUsed: error.model,
    };
    const retryMessage = language === 'hi-IN'
      ? 'माफ़ कीजिए, मैं समझ नहीं पाया। कृपया एक बार फिर कहें।'
      : language === 'kn-IN'
        ? 'ಕ್ಷಮಿಸಿ, ನನಗೆ ಅರ್ಥವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ.'
        : 'Sorry, I did not catch that. Please say it once more.';
    const danger = evaluateDangerSigns(session.transcript, language);
    return response(
      session,
      failedExtraction,
      danger,
      [retryMessage],
      retryMessage,
      [],
      null,
      null,
      null,
      null,
      danger.ruleFired,
      'busy'
    );
  }
  mergeExtraction(session.fields, extracted, text);

  if (pendingField === 'houseNo' && session.duplicateCandidates.length) {
    const digits = text.match(/\b[A-Za-z0-9-]+\b/)?.[0];
    if (digits) {
      const selected = session.duplicateCandidates.find((item) => item.house_no === digits);
      if (selected) {
        setField(session.fields, 'name', selected.name, text);
        setField(session.fields, 'houseNo', selected.house_no, text);
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

  const roster = [...SYNTHETIC_ROSTER, ...await loadRoster()];
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
    const sameNameRepeated = (text.toLowerCase().split(currentName.toLowerCase()).length - 1) > 1;
    if (matches.length > 1 && (!house || sameNameRepeated)) {
      session.duplicateCandidates = matches;
      session.pendingQuestion = question(language, 'chooseHouse');
      session.pendingField = 'houseNo';
    } else if (matches.length > 1 && house && !matches.some((item) => item.house_no === house)) {
      session.pendingQuestion = question(language, 'chooseHouse');
      session.pendingField = 'houseNo';
    } else if (!matches.length) {
      const created: BeneficiaryRecord = {
        id: `NEW-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: currentName,
        house_no: String(session.fields.houseNo.value || 'Unknown'),
        village: 'Rampur',
        category: session.fields.visitType.value === 'PNC' ? 'PNC' : 'ANC',
        age: Number(session.fields.age.value) || 0,
        isNew: true,
      };
      await fs.mkdir(path.dirname(BENEFICIARIES_FILE), { recursive: true });
      await fs.writeFile(BENEFICIARIES_FILE, JSON.stringify([...await loadRoster(), created], null, 2), 'utf8');
      rosterLabel = 'synthetic/demo';
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
  const dangerText = pendingField === 'symptoms'
    ? (/^(yes|yeah|haan|हां|हाँ|ಹೌದು)\b/i.test(currentLower)
      ? 'active bleeding'
      : /^(no|nope|nahi|नहीं|ಇಲ್ಲ)\b/i.test(currentLower)
        ? 'no bleeding'
        : session.transcript)
    : session.transcript;
  const danger = evaluateDangerSigns(dangerText, language, currentName || 'Beneficiary', 'ID-Pending');
  if (danger.decision === 'FLAG') {
    const record: Record<string, unknown> = {
      id: `REC-${Date.now()}`,
      timestamp: new Date().toISOString(),
      beneficiaryName: session.fields.name.value,
      beneficiaryId: session.fields.name.value,
      houseNo: session.fields.houseNo.value,
      visitType: session.fields.visitType.value,
      weight: session.fields.weight.value,
      bp: session.fields.bpSystolic.value && session.fields.bpDiastolic.value
        ? `${session.fields.bpSystolic.value}/${session.fields.bpDiastolic.value}` : null,
      ...Object.fromEntries(Object.entries(session.fields).map(([key, field]) => [key, field.value])),
      transcript: session.transcript,
      isFlagged: true,
      flaggedSigns: danger.flaggedSigns,
      referralSlip: danger.referralSlip,
      followups: [],
    };
    const encryptedRecord = encryptPayload(record);
    session.savedRecord = record;
    session.pendingSave = false;
    session.pendingQuestion = null;
    sessions.set(session.id, session);
    const referralLine = 'Please refer to the PHC now.';
    const announcement = rosterLabel ? `New beneficiary ${currentName} added. ` : '';
    return response(session, extracted, danger, [], `${announcement}${referralLine}`, [], record, encryptedRecord, null, rosterLabel);
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
    notes: '', evidence: {}, confidence: {}, extractionStatus: 'confirmed', modelUsed: process.env.LLM_PROVIDER === 'mock' ? 'mock' : 'gemini-3.8-flash',
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
    fields: session.fields,
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
    rule,
    llm_status: llmStatus,
  };
}

export function resetTurnSessions(): void {
  sessions.clear();
}

export function decryptSavedTurn(token: string): Record<string, unknown> {
  return JSON.parse(decryptPayload(token)) as Record<string, unknown>;
}
