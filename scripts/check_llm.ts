import '../server/env.ts';

import { GoogleGenAI } from '@google/genai';
import { extractWithGroq, LlmProviderError, selectedGroqModel } from '../server/groq.ts';
import { responseJsonSchema, validateExtraction } from '../server/extractor.ts';
import { buildExtractionPrompt } from '../server/extractionPrompt.ts';

const probeTranscript = 'Synthetic test visit: Kumari, age 24, seven months pregnant, house 15, weight 58 kg, BP 110 by 70, no bleeding.';

function safeStatus(error: unknown): string {
  if (error instanceof LlmProviderError) return error.status;
  if (!error || typeof error !== 'object') return 'ERROR';
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = Number(candidate.status);
  if (Number.isInteger(status) && status >= 100 && status <= 599) return String(status);
  if (/timed?\s*out|timeout|aborted/i.test(`${String(candidate.code || '')} ${String(candidate.message || '')}`)) {
    return 'TIMEOUT';
  }
  return 'ERROR';
}

function probeResult(
  name: string,
  passed: boolean,
  status: string,
  model: string,
  latency: number
) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name} status=${status} model=${model} latency_ms=${latency}`);
}

async function checkGemini() {
  const model = process.env.LLM_MODEL?.trim();
  const apiKey = process.env.LLM_API_KEY?.trim();
  const started = Date.now();
  if (!apiKey || !model) {
    probeResult('Gemini', false, 'NOT_CONFIGURED', model || 'unconfigured', 0);
    return false;
  }
  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { retryOptions: { attempts: 1 } },
    });
    const result = await ai.models.generateContent({
      model,
      contents: buildExtractionPrompt(probeTranscript, 'en-IN'),
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema,
        temperature: 0,
        ...(model.startsWith('gemini-2.5-') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        abortSignal: AbortSignal.timeout(3_500),
      },
    });
    validateExtraction(JSON.parse(result.text || ''), model);
    probeResult('Gemini', true, '200', model, Date.now() - started);
    return true;
  } catch (error) {
    probeResult('Gemini', false, safeStatus(error), model, Date.now() - started);
    return false;
  }
}

async function checkGroq() {
  const started = Date.now();
  if (!process.env.FALLBACK_API_KEY?.trim()) {
    probeResult('Groq', false, 'NOT_CONFIGURED', 'unconfigured', 0);
    return false;
  }
  let model = process.env.FALLBACK_MODEL?.trim() || 'discovering';
  try {
    model = (await selectedGroqModel()).id;
    await extractWithGroq({
      transcript: probeTranscript,
      language: 'en-IN',
      schema: responseJsonSchema,
      validate: validateExtraction,
    });
    probeResult('Groq', true, '200', model, Date.now() - started);
    console.log(`Selected FALLBACK_MODEL=${model}`);
    return true;
  } catch (error) {
    probeResult('Groq', false, safeStatus(error), model, Date.now() - started);
    if (model !== 'discovering' && model !== 'unconfigured') {
      console.log(`Discovered FALLBACK_MODEL=${model}`);
    }
    return false;
  }
}

const geminiOk = await checkGemini();
const groqOk = await checkGroq();
if (!geminiOk || !groqOk) process.exitCode = 1;
