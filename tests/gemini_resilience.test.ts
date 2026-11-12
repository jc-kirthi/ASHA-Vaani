import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_PROVIDER = 'mock';
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.ASHA_BENEFICIARIES_FILE = path.join(os.tmpdir(), `gemini-retry-${process.pid}.json`);

const {
  GeminiUnavailableError,
  runGeminiWithResilience,
} = await import('../server/extractor.ts');
const { processTurn, resetTurnSessions } = await import('../server/turn.ts');

async function main() {
  const retryWaits: number[] = [];
  const retryCalls: string[] = [];
  const recovered = await runGeminiWithResilience({
    primaryModel: 'primary-flash',
    backupModel: 'backup-flash-lite',
    invoke: async (model) => {
      retryCalls.push(model);
      if (retryCalls.length === 1) throw { status: 503 };
      return 'extracted';
    },
    delay: async (ms) => { retryWaits.push(ms); },
    logFailure: () => {},
  });
  assert.equal(recovered.value, 'extracted');
  assert.equal(recovered.model, 'primary-flash');
  assert.equal(recovered.backupUsed, false);
  assert.deepEqual(retryCalls, ['primary-flash', 'primary-flash']);
  assert.deepEqual(retryWaits, [500]);
  console.log('PASS mocked 503 then success retries primary once with backoff');

  let timeoutCalls = 0;
  const timeoutSignals: AbortSignal[] = [];
  const timeoutRecovery = await runGeminiWithResilience({
    primaryModel: 'primary-flash',
    backupModel: 'backup-flash-lite',
    invoke: async (_model, _timeoutMs, signal) => {
      timeoutCalls += 1;
      if (timeoutCalls === 1) {
        timeoutSignals.push(signal);
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
      return 'recovered after timeout';
    },
    delay: async () => {},
    logFailure: () => {},
  });
  assert.equal(timeoutRecovery.value, 'recovered after timeout');
  assert.equal(timeoutSignals[0].aborted, true);
  console.log('PASS timed-out request is aborted and retried');

  const failedCalls: string[] = [];
  const failedWaits: number[] = [];
  await assert.rejects(
    runGeminiWithResilience({
      primaryModel: 'primary-flash',
      backupModel: 'backup-flash-lite',
      invoke: async (model) => {
        failedCalls.push(model);
        throw { status: 503 };
      },
      delay: async (ms) => { failedWaits.push(ms); },
      logFailure: () => {},
    }),
    (error: unknown) => {
      assert.ok(error instanceof GeminiUnavailableError);
      assert.equal(error.status, '503');
      assert.equal(error.retries, 4);
      assert.equal(error.backupTried, true);
      return true;
    }
  );
  assert.deepEqual(failedCalls, [
    'primary-flash',
    'primary-flash',
    'primary-flash',
    'backup-flash-lite',
  ]);
  assert.deepEqual(failedWaits, [500, 1_000]);
  console.log('PASS all primary and backup attempts failing returns bounded unavailable result');

  resetTurnSessions();
  const spoken = 'Kumari is 24, seven months pregnant, house 15, weight 58 kilo';
  const response = await processTurn(
    { session_id: 'gemini-failure-session', transcript: spoken, language: 'en-IN' },
    async () => {
      throw new GeminiUnavailableError('503', 'backup-flash-lite', 4, true);
    }
  );
  assert.equal(response.transcript, spoken);
  assert.equal(response.llm_status, 'busy');
  assert.equal(response.answer_text, 'Sorry, I did not catch that. Please say it once more.');
  assert.equal(response.fields.name.value, null);
  assert.equal(response.fields.weight.value, null);
  console.log('PASS exhausted Gemini turn preserves transcript and asks again without extracted guesses');

  const kannadaResponse = await processTurn(
    { session_id: 'gemini-failure-kannada', transcript: spoken, language: 'kn-IN' },
    async () => {
      throw new GeminiUnavailableError('503', 'backup-flash-lite', 4, true);
    }
  );
  assert.equal(kannadaResponse.answer_text, 'ಕ್ಷಮಿಸಿ, ನನಗೆ ಅರ್ಥವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ.');
  console.log('PASS exhausted Gemini retry prompt uses the selected language');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
