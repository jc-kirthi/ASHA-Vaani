import { GoogleGenAI } from '@google/genai';
import { extractWithGroq, LlmProviderError } from './groq.ts';

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
  llmStatus?: 'ready' | 'retried' | 'busy';
  llmRetries?: number;
  llmBackupUsed?: boolean;
  extractionDiagnostics?: ExtractionDiagnostics;
}

export interface ExtractionDiagnostics {
  provider: 'Gemini' | 'Groq' | 'Rules';
  model: string | null;
  failedProviders: Array<{ provider: 'Gemini' | 'Groq'; status: string }>;
  providerLatencyMs: { Gemini: number; Groq: number };
  totalLatencyMs: number;
  llmCalls: number;
}

export interface ExtractionProviderAdapters {
  gemini: (transcript: string, language: string, signal: AbortSignal) => Promise<ExtractedVisitData>;
  groq: (transcript: string, language: string, signal: AbortSignal) => Promise<ExtractedVisitData>;
  isConfigured?: (provider: 'Gemini' | 'Groq') => boolean;
  now?: () => number;
  logFailure?: (provider: 'Gemini' | 'Groq', status: string, message: string) => void;
}

export const responseJsonSchema = {
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

const PROVIDER_COOLDOWN_MS = 60_000;
const EXTRACTION_DEADLINE_MS = 5_000;
const PROVIDER_ATTEMPT_TIMEOUT_MS = 1_500;
const providerCircuitUntil = new Map<'Gemini' | 'Groq', number>();

class InvalidExtractionError extends Error {}

const REQUIRED_EXTRACTION_FIELDS = [
  'beneficiaryName', 'beneficiaryNames', 'beneficiaryType', 'age', 'houseNo',
  'village', 'visitType', 'pregnancyMonths', 'gestationalWeeks', 'babyAgeDays',
  'weight', 'bpSystolic', 'bpDiastolic', 'hemoglobin', 'lastAncDate',
  'ttStatus', 'ttLastDoseDate', 'ifaStatus', 'ifaTablets', 'vaccinationsGiven',
  'symptoms', 'notes', 'evidence',
];
const REQUIRED_EVIDENCE_FIELDS = [
  'beneficiaryName', 'age', 'houseNo', 'weight', 'bloodPressure', 'ifaStatus',
];
const NULLABLE_STRING_FIELDS = [
  'beneficiaryName', 'houseNo', 'village', 'lastAncDate', 'ttStatus',
  'ttLastDoseDate', 'ifaStatus',
];
const NULLABLE_NUMBER_FIELDS = [
  'age', 'pregnancyMonths', 'gestationalWeeks', 'babyAgeDays', 'weight',
  'bpSystolic', 'bpDiastolic', 'hemoglobin', 'ifaTablets',
];

function assertExtractionSchema(value: Record<string, unknown>): void {
  if (REQUIRED_EXTRACTION_FIELDS.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new InvalidExtractionError('Extraction is missing required schema fields.');
  }
  if (Object.keys(value).some((key) => !REQUIRED_EXTRACTION_FIELDS.includes(key))) {
    throw new InvalidExtractionError('Extraction contains unsupported schema fields.');
  }
  for (const key of NULLABLE_STRING_FIELDS) {
    if (value[key] !== null && typeof value[key] !== 'string') {
      throw new InvalidExtractionError('Extraction contains an invalid string field.');
    }
  }
  for (const key of NULLABLE_NUMBER_FIELDS) {
    if (value[key] !== null && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) {
      throw new InvalidExtractionError('Extraction contains an invalid numeric field.');
    }
  }
  if (
    !Array.isArray(value.beneficiaryNames) ||
    value.beneficiaryNames.some((name) => typeof name !== 'string') ||
    !['pregnant_woman', 'newborn', 'mother', 'unknown'].includes(String(value.beneficiaryType)) ||
    (value.visitType !== null && !['ANC', 'PNC', 'immunisation'].includes(String(value.visitType))) ||
    !Array.isArray(value.vaccinationsGiven) ||
    value.vaccinationsGiven.some((item) => typeof item !== 'string') ||
    typeof value.notes !== 'string'
  ) {
    throw new InvalidExtractionError('Extraction does not match the required schema.');
  }
  if (!Array.isArray(value.symptoms) || value.symptoms.some((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
    const symptom = item as Record<string, unknown>;
    return Object.keys(symptom).some((key) =>
      !['canonicalId', 'negated', 'timing', 'certainty', 'evidence'].includes(key)
    ) ||
      typeof symptom.canonicalId !== 'string' ||
      typeof symptom.negated !== 'boolean' ||
      (symptom.timing !== null && typeof symptom.timing !== 'string') ||
      !['high', 'uncertain'].includes(String(symptom.certainty)) ||
      typeof symptom.evidence !== 'string';
  })) {
    throw new InvalidExtractionError('Extraction contains an invalid symptom.');
  }
  if (!value.evidence || typeof value.evidence !== 'object' || Array.isArray(value.evidence)) {
    throw new InvalidExtractionError('Extraction evidence is invalid.');
  }
  const evidence = value.evidence as Record<string, unknown>;
  if (
    REQUIRED_EVIDENCE_FIELDS.some((key) => !Object.prototype.hasOwnProperty.call(evidence, key)) ||
    Object.keys(evidence).some((key) => !REQUIRED_EVIDENCE_FIELDS.includes(key)) ||
    Object.values(evidence).some((item) => item !== null && typeof item !== 'string')
  ) {
    throw new InvalidExtractionError('Extraction evidence does not match the required schema.');
  }
}

function providerStatus(error: unknown): string {
  if (error instanceof LlmProviderError) return error.status;
  if (!error || typeof error !== 'object') return 'NETWORK';
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown; cause?: unknown };
  const status = Number(candidate.status ?? candidate.code);
  if (status > 0) return String(status);
  const text = String(candidate.message || '').toLowerCase();
  if (/timed?\s*out|timeout|aborted/.test(text)) return 'TIMEOUT';
  if (candidate.cause) return providerStatus(candidate.cause);
  return 'ERROR';
}

function retryAfterMs(error: unknown): number {
  if (error instanceof LlmProviderError) return error.retryAfterMs;
  if (!error || typeof error !== 'object') return 0;
  const candidate = error as { message?: unknown; headers?: Headers; response?: { headers?: Headers } };
  const header = candidate.response?.headers?.get('retry-after') || candidate.headers?.get('retry-after');
  if (header && Number.isFinite(Number(header))) return Number(header) * 1000;
  const message = String(candidate.message || '');
  const match = message.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
  return match ? Number(match[1]) * 1000 : 0;
}

function sanitizedProviderMessage(error: unknown, transcript: string): string {
  let message = error instanceof Error ? error.message : 'Provider request failed.';
  for (const secret of [process.env.LLM_API_KEY, process.env.FALLBACK_API_KEY, transcript]) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:gsk_|AIza)[A-Za-z0-9_-]{12,}\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function makeDefaultAdapters(): ExtractionProviderAdapters {
  return {
    isConfigured: (provider) => provider === 'Gemini'
      ? Boolean(process.env.LLM_API_KEY?.trim() && process.env.LLM_MODEL?.trim())
      : Boolean(process.env.FALLBACK_API_KEY?.trim() && process.env.FALLBACK_BASE_URL?.trim()),
    gemini: async (transcript, language, signal) => {
      const apiKey = process.env.LLM_API_KEY?.trim();
      const model = process.env.LLM_MODEL?.trim();
      if (!apiKey || !model) {
        throw new LlmProviderError('NOT_CONFIGURED', 'Gemini credentials or model are not configured.');
      }
      const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
      return attemptGeminiCall(ai, transcript, language, model, signal);
    },
    groq: async (transcript, language, signal) => {
      const result = await extractWithGroq({
        transcript,
        language,
        schema: responseJsonSchema,
        validate: validateExtraction,
        signal,
      });
      return result.extraction;
    },
  };
}

export async function extractWithFallback(
  transcript: string,
  language = 'en-IN',
  adapters: ExtractionProviderAdapters = makeDefaultAdapters()
): Promise<ExtractedVisitData> {
  if (process.env.LLM_PROVIDER === 'mock') {
    const extraction = extractWithMock(transcript, language);
    extraction.extractionDiagnostics = {
      provider: 'Rules',
      model: 'mock',
      failedProviders: [],
      providerLatencyMs: { Gemini: 0, Groq: 0 },
      totalLatencyMs: 0,
      llmCalls: 0,
    };
    return extraction;
  }

  const now = adapters.now || Date.now;
  const startedAt = now();
  const deadline = startedAt + EXTRACTION_DEADLINE_MS;
  const failures: ExtractionDiagnostics['failedProviders'] = [];
  const providerLatencyMs: ExtractionDiagnostics['providerLatencyMs'] = { Gemini: 0, Groq: 0 };
  let llmCalls = 0;

  for (const provider of ['Gemini', 'Groq'] as const) {
    if (adapters.isConfigured && !adapters.isConfigured(provider)) {
      failures.push({ provider, status: 'NOT_CONFIGURED' });
      continue;
    }
    const openUntil = providerCircuitUntil.get(provider) || 0;
    if (openUntil > now()) {
      failures.push({ provider, status: 'CIRCUIT_OPEN' });
      continue;
    }

    const adapter = provider === 'Gemini' ? adapters.gemini : adapters.groq;
    for (let invalidJsonAttempt = 0; invalidJsonAttempt < 2; invalidJsonAttempt += 1) {
      const remaining = deadline - now();
      if (remaining <= 0) break;
      const attemptStarted = now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(PROVIDER_ATTEMPT_TIMEOUT_MS, remaining));
      llmCalls += 1;
      try {
        const extraction = await Promise.race([
          adapter(transcript, language, controller.signal),
          new Promise<never>((_resolve, reject) => {
            controller.signal.addEventListener('abort', () => reject(new LlmProviderError('TIMEOUT', 'Provider request timed out.')), { once: true });
          }),
        ]);
        providerLatencyMs[provider] += now() - attemptStarted;
        const diagnostics: ExtractionDiagnostics = {
          provider,
          model: extraction.modelUsed,
          failedProviders: failures,
          providerLatencyMs,
          totalLatencyMs: now() - startedAt,
          llmCalls,
        };
        extraction.extractionDiagnostics = diagnostics;
        extraction.llmStatus = provider === 'Gemini' && llmCalls === 1 ? 'ready' : 'retried';
        extraction.llmRetries = llmCalls - 1;
        extraction.llmBackupUsed = provider === 'Groq';
        console.info(
          `[LLM] provider=${provider} model=${diagnostics.model || 'unknown'} llm_calls=${llmCalls} total_ms=${diagnostics.totalLatencyMs}`
        );
        return extraction;
      } catch (error) {
        providerLatencyMs[provider] += now() - attemptStarted;
        const status = providerStatus(error);
        const message = sanitizedProviderMessage(error, transcript);
        (adapters.logFailure || ((name, code, detail) =>
          console.warn(`[LLM] provider=${name} status=${code} error=${detail}`)))(provider, status, message);
        if (status === '429' || status === '503') {
          providerCircuitUntil.set(provider, now() + Math.max(PROVIDER_COOLDOWN_MS, retryAfterMs(error)));
          failures.push({ provider, status });
          break;
        }
        if (status === 'INVALID_JSON' && invalidJsonAttempt === 0) continue;
        failures.push({ provider, status });
        break;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  const rules = extractWithMock(transcript, language);
  const hasRuleData = hasExtractedData(rules);
  const diagnostics: ExtractionDiagnostics = {
    provider: 'Rules',
    model: null,
    failedProviders: failures,
    providerLatencyMs,
    totalLatencyMs: now() - startedAt,
    llmCalls,
  };
  console.info(`[LLM] provider=Rules llm_calls=${llmCalls} total_ms=${diagnostics.totalLatencyMs}`);
  rules.modelUsed = 'rules';
  rules.extractionDiagnostics = diagnostics;
  rules.llmStatus = hasRuleData ? 'retried' : 'busy';
  if (!hasRuleData) rules.extractionStatus = 'uncertain';
  return rules;
}

export function hasExtractedData(extraction: ExtractedVisitData): boolean {
  return Boolean(
    extraction.beneficiaryName ||
    extraction.age !== null ||
    extraction.houseNo ||
    extraction.visitType ||
    extraction.pregnancyMonths !== null ||
    extraction.babyAgeDays !== null ||
    extraction.weight !== null ||
    extraction.bpSystolic !== null ||
    extraction.bpDiastolic !== null ||
    extraction.hemoglobin !== null ||
    extraction.lastAncDate ||
    extraction.ttStatus ||
    extraction.ifaStatus ||
    extraction.ifaTablets !== null ||
    extraction.vaccinationsGiven.length ||
    extraction.symptoms.length ||
    extraction.notes
  );
}

export function resetExtractionProviderState(): void {
  providerCircuitUntil.clear();
}

export function getExtractionCircuitState(): Record<'Gemini' | 'Groq', number> {
  return {
    Gemini: providerCircuitUntil.get('Gemini') || 0,
    Groq: providerCircuitUntil.get('Groq') || 0,
  };
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
  transcript: string,
  language: string,
  model: string,
  abortSignal: AbortSignal
): Promise<ExtractedVisitData> {
  const response = await ai.models.generateContent({
    model,
    contents: `Language code: ${language}\nTranscript: ${transcript}`,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature: 0,
      ...(model.startsWith('gemini-2.5-') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      abortSignal,
    },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text || '');
  } catch {
    throw new LlmProviderError('INVALID_JSON', 'Gemini returned invalid JSON.', 0, true);
  }
  try {
    return { ...validateExtraction(parsed, model), modelUsed: model };
  } catch {
    throw new LlmProviderError('INVALID_JSON', 'Gemini returned schema-invalid JSON.', 0, true);
  }
}

export function validateExtraction(value: unknown, modelUsed = process.env.LLM_MODEL?.trim() || 'unconfigured'): ExtractedVisitData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidExtractionError('Gemini returned a non-object response.');
  }
  const parsed = value as Record<string, unknown>;
  assertExtractionSchema(parsed);
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
    modelUsed,
  };
}

function uncertainExtraction(modelUsed = process.env.LLM_MODEL?.trim() || 'unconfigured'): ExtractedVisitData {
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
    modelUsed,
  };
}
