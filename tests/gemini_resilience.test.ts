import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_PROVIDER = '';
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.ASHA_BENEFICIARIES_FILE = path.join(os.tmpdir(), `llm-fallback-${process.pid}.json`);
await fs.rm(process.env.ASHA_BENEFICIARIES_FILE, { force: true });

const {
  extractWithMock,
  extractWithFallback,
  resetExtractionProviderState,
  validateExtraction,
} = await import('../server/extractor.ts');
const { LlmProviderError, extractWithGroq, resetGroqModelCatalog } = await import('../server/groq.ts');
const { createHealthResponse } = await import('../server/health.ts');
const { processTurn, resetTurnSessions } = await import('../server/turn.ts');

const transcript = 'Kumari, 24 years old, seven months pregnant for ANC, house 15, weight 58 kilo, BP 110 by 70, no bleeding';
const validJson = {
  beneficiaryName: 'Kumari',
  beneficiaryNames: ['Kumari'],
  beneficiaryType: 'pregnant_woman',
  age: 24,
  houseNo: '15',
  village: null,
  visitType: 'ANC',
  pregnancyMonths: 7,
  gestationalWeeks: null,
  babyAgeDays: null,
  weight: 58,
  bpSystolic: 110,
  bpDiastolic: 70,
  hemoglobin: null,
  lastAncDate: null,
  ttStatus: null,
  ttLastDoseDate: null,
  ifaStatus: null,
  ifaTablets: null,
  vaccinationsGiven: [],
  symptoms: [{ canonicalId: 'vaginal_bleeding', negated: true, timing: 'current', certainty: 'high', evidence: 'no bleeding' }],
  notes: '',
  evidence: {
    beneficiaryName: 'Kumari',
    age: '24 years old',
    houseNo: 'house 15',
    village: null,
    visitType: 'ANC',
    pregnancyMonths: 'seven months pregnant',
    gestationalWeeks: null,
    babyAgeDays: null,
    weight: 'weight 58 kilo',
    bloodPressure: 'BP 110 by 70',
    hemoglobin: null,
    lastAncDate: null,
    ttStatus: null,
    ttLastDoseDate: null,
    ifaStatus: null,
    ifaTablets: null,
    vaccinations: null,
    symptoms: 'no bleeding',
    notes: null,
  },
};

function extraction(model = 'mock') {
  return validateExtraction(validJson, model);
}

assert.throws(
  () => validateExtraction({ ...validJson, weight: 301 }, 'invalid-range-test'),
  /unsupported weight value/
);
assert.throws(
  () => validateExtraction({
    ...validJson,
    evidence: { ...validJson.evidence, weight: null },
  }, 'missing-evidence-test'),
  /missing evidence/
);
console.log('PASS Extraction validation rejects unsupported values and unsupported field claims');

const spokenVisit = extractWithMock(
  'Visited Lakshmi today. She is 25 years old, seven months pregnant, lives in house number 24 in Rampur. Her weight is 55 kilograms, blood pressure is 120 by 80, haemoglobin is 10.5, she is taking IFA tablets, she has received two TT doses, and her last ANC visit was on October 20.'
);
assert.equal(spokenVisit.beneficiaryName, 'Lakshmi');
assert.equal(spokenVisit.beneficiaryNames.length, 1);
assert.equal(spokenVisit.houseNo, '24');
assert.equal(spokenVisit.village, 'Rampur');
assert.equal(spokenVisit.age, 25);
assert.equal(spokenVisit.pregnancyMonths, 7);
assert.equal(spokenVisit.weight, 55);
assert.equal(spokenVisit.bpSystolic, 120);
assert.equal(spokenVisit.bpDiastolic, 80);
assert.equal(spokenVisit.hemoglobin, 10.5);
assert.equal(spokenVisit.ifaStatus, 'taking');
assert.equal(spokenVisit.ttStatus, 'two TT doses');
console.log('PASS Deterministic fallback extracts supported fields from natural visit narration');

function providers(
  gemini: (transcript: string, language: string, signal: AbortSignal) => Promise<ReturnType<typeof extraction>>,
  groq: (transcript: string, language: string, signal: AbortSignal) => Promise<ReturnType<typeof extraction>>,
  now?: () => number,
  logFailure?: (provider: 'Gemini' | 'Groq', status: string, message: string) => void
) {
  return { gemini, groq, now, logFailure };
}

async function main() {
  resetTurnSessions();
  resetExtractionProviderState();
  const gemini429ThenGroq = await extractWithFallback(transcript, 'en-IN', providers(
    async () => { throw new LlmProviderError('429', 'rate limited'); },
    async () => extraction('groq-test-model')
  ));
  const groqTurn = await processTurn(
    { session_id: 'fallback-429', transcript, language: 'en-IN' },
    async (text, language = 'en-IN') =>
      text === transcript
        ? gemini429ThenGroq
        : extractWithFallback(text, language, providers(
            async () => { throw new LlmProviderError('429', 'rate limited'); },
            async () => extraction('groq-test-model')
          ))
  );
  assert.equal(groqTurn.fields.name.value, 'Kumari');
  assert.equal(groqTurn.fields.weight.value, 58);
  assert.equal(groqTurn.extraction_status?.provider, 'Groq');
  assert.equal(groqTurn.extraction_status?.model, 'groq-test-model');
  console.log('PASS Test 1 Gemini 429 falls back to Groq and returns filled fields/status');

  resetExtractionProviderState();
  const serviceUnavailable = await extractWithFallback(transcript, 'en-IN', providers(
    async () => { throw new LlmProviderError('503', 'temporarily unavailable'); },
    async () => extraction('groq-test-model')
  ));
  assert.equal(serviceUnavailable.extractionDiagnostics?.provider, 'Groq');
  console.log('PASS Test 2 Gemini 503 falls back to Groq');

  resetTurnSessions();
  resetExtractionProviderState();
  const rulesTurn = await processTurn(
    { session_id: 'fallback-rules-429', transcript, language: 'en-IN' },
    async (text, language = 'en-IN') => extractWithFallback(text, language, providers(
      async () => { throw new LlmProviderError('429', 'rate limited'); },
      async () => { throw new LlmProviderError('429', 'rate limited'); }
    ))
  );
  assert.equal(rulesTurn.extraction_status?.provider, 'Rules');
  assert.equal(rulesTurn.llm_status, 'retried');
  assert.equal(rulesTurn.extraction_status?.llmCalls, 2);
  assert.equal(rulesTurn.fields.name.value, 'Kumari');
  assert.equal(rulesTurn.fields.age.value, 24);
  assert.equal(rulesTurn.fields.pregnancyMonths.value, 7);
  assert.equal(rulesTurn.fields.houseNo.value, '15');
  assert.equal(rulesTurn.fields.weight.value, 58);
  assert.equal(rulesTurn.fields.bpSystolic.value, 110);
  assert.equal(rulesTurn.fields.bpDiastolic.value, 70);
  assert.equal(rulesTurn.danger.decision, 'CLEAR');
  assert.equal((rulesTurn.fields.symptoms.value as Array<{ negated: boolean }>)[0]?.negated, true);
  console.log('PASS Test 3 both providers 429; rules fill Kumari details and no-bleeding stays CLEAR');

  resetTurnSessions();
  resetExtractionProviderState();
  const unrecognized = await processTurn(
    { session_id: 'fallback-empty', transcript: 'I have a note to share', language: 'en-IN' },
    async (text, language = 'en-IN') => extractWithFallback(text, language, providers(
      async () => { throw new LlmProviderError('503', 'temporarily unavailable'); },
      async () => { throw new LlmProviderError('503', 'temporarily unavailable'); }
    ))
  );
  assert.equal(unrecognized.transcript, 'I have a note to share');
  assert.equal(unrecognized.answer_text, 'Sorry, I did not catch that. Please say it once more.');
  assert.equal(unrecognized.extraction_status?.provider, 'Rules');
  assert.equal(unrecognized.llm_status, 'busy');
  console.log('PASS unrecognized utterance remains in session and asks for a repeat');

  resetTurnSessions();
  resetExtractionProviderState();
  const dangerTranscript = 'Sunita Sharma has heavy bleeding';
  const dangerTurn = await processTurn(
    { session_id: 'fallback-danger', transcript: dangerTranscript, language: 'en-IN' },
    async (text, language = 'en-IN') => extractWithFallback(text, language, providers(
      async () => { throw new LlmProviderError('503', 'temporarily unavailable'); },
      async () => { throw new LlmProviderError('503', 'temporarily unavailable'); }
    ))
  );
  assert.equal(dangerTurn.danger.decision, 'FLAG');
  assert.ok(dangerTurn.referral_slip);
  console.log('PASS Test 4 deterministic danger engine FLAGS heavy bleeding when both LLMs fail');

  resetExtractionProviderState();
  let fakeTime = 100_000;
  let geminiCalls = 0;
  let groqCalls = 0;
  const circuitAdapters = providers(
    async () => { geminiCalls += 1; throw new LlmProviderError('429', 'quota'); },
    async () => { groqCalls += 1; return extraction('groq-test-model'); },
    () => fakeTime
  );
  await extractWithFallback('first circuit note', 'en-IN', circuitAdapters);
  await extractWithFallback('second circuit note', 'en-IN', circuitAdapters);
  assert.equal(geminiCalls, 1);
  assert.equal(groqCalls, 2);
  fakeTime += 60_001;
  await extractWithFallback('third circuit note', 'en-IN', circuitAdapters);
  assert.equal(geminiCalls, 2);
  console.log('PASS Test 5 Gemini 429 circuit skips provider for 60 seconds and reopens afterward');

  resetTurnSessions();
  let extractionCalls = 0;
  const countExtractor = async () => {
    extractionCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return extraction();
  };
  const duplicateInput = { session_id: 'duplicate-final', transcript: transcript, language: 'en-IN' };
  await Promise.all([processTurn(duplicateInput, countExtractor), processTurn(duplicateInput, countExtractor)]);
  assert.equal(extractionCalls, 1);
  console.log('PASS Test 6 duplicate final transcript in one session runs extraction once');

  resetExtractionProviderState();
  let invalidGeminiCalls = 0;
  let recoveredGroqCalls = 0;
  const invalidJson = await extractWithFallback(transcript, 'en-IN', providers(
    async () => {
      invalidGeminiCalls += 1;
      throw new LlmProviderError('INVALID_JSON', 'invalid provider output', 0, true);
    },
    async () => {
      recoveredGroqCalls += 1;
      return extraction('groq-test-model');
    }
  ));
  assert.equal(invalidGeminiCalls, 2);
  assert.equal(recoveredGroqCalls, 1);
  assert.equal(invalidJson.extractionDiagnostics?.provider, 'Groq');
  console.log('PASS Test 7 invalid JSON is retried once before switching providers');

  resetGroqModelCatalog();
  const dummyCredential = 'test-secret-never-print';
  const capturedRequest: { current: Record<string, unknown> | null } = { current: null };
  const fakeFetch: typeof fetch = async (input, init) => {
    if (String(input).endsWith('/models')) {
      return new Response(JSON.stringify({
        data: [{ id: 'test-instant-model', active: true, supported_parameters: ['response_format'] }],
      }), { status: 200 });
    }
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${dummyCredential}`);
    capturedRequest.current = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(validJson) } }],
    }), { status: 200 });
  };
  const groqResult = await extractWithGroq({
    transcript: 'synthetic transcript',
    language: 'en-IN',
    schema: (await import('../server/extractor.ts')).responseJsonSchema,
    validate: validateExtraction,
    env: { FALLBACK_API_KEY: dummyCredential, FALLBACK_BASE_URL: 'https://test.invalid/openai/v1' },
    fetchImpl: fakeFetch,
  });
  assert.equal(groqResult.model, 'test-instant-model');
  assert.equal(capturedRequest.current?.temperature, 0);
  assert.equal((capturedRequest.current?.response_format as { type: string }).type, 'json_schema');
  console.log('PASS Groq adapter discovers model and sends validated JSON-schema chat request');

  const geminiSecret = 'test-gemini-secret';
  const groqSecret = 'test-groq-secret';
  process.env.LLM_API_KEY = geminiSecret;
  process.env.FALLBACK_API_KEY = groqSecret;
  const logs: string[] = [];
  resetExtractionProviderState();
  const safeResult = await extractWithFallback('private synthetic transcript', 'en-IN', providers(
    async () => { throw new Error(`400 request rejected for ${geminiSecret}: private synthetic transcript`); },
    async () => { throw new Error(`503 request rejected for ${groqSecret}: private synthetic transcript`); },
    undefined,
    (provider, status, message) => logs.push(`${provider} ${status} ${message}`)
  ));
  const serializedResponse = JSON.stringify(safeResult);
  assert.ok(logs.every((line) => !line.includes(geminiSecret) && !line.includes(groqSecret) && !line.includes('private synthetic transcript')));
  assert.ok(!serializedResponse.includes(geminiSecret) && !serializedResponse.includes(groqSecret));
  const health = createHealthResponse({
    port: 3000,
    gnaniKey: true,
    llmKey: Boolean(process.env.LLM_API_KEY),
    fallbackKey: Boolean(process.env.FALLBACK_API_KEY),
    encryptionKey: true,
    sttOk: true,
    ttsOk: true,
  });
  assert.deepEqual(Object.keys(health), [
    'gnani_key', 'llm_key', 'fallback_key', 'encryption_key', 'stt_ok', 'tts_ok', 'port',
  ]);
  assert.ok(Object.values(health).every((item) => typeof item === 'boolean' || typeof item === 'number'));
  assert.ok(!JSON.stringify(health).includes(geminiSecret) && !JSON.stringify(health).includes(groqSecret));
  console.log('PASS Test 8 logs, turn responses, and health payload expose no credentials');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
