const baseUrl = process.env.ASHA_HEALTH_URL || 'http://localhost:3000';

async function main() {
  let health: Record<string, unknown>;
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    if (!response.ok) throw new Error(`health endpoint returned HTTP ${response.status}`);
    health = await response.json() as Record<string, unknown>;
  } catch (error) {
    console.error(`FAIL backend: ${error instanceof Error ? error.message : 'unreachable'}`);
    process.exitCode = 1;
    return;
  }

  const checks: Array<[string, boolean]> = [
    ['backend port', Number.isInteger(health.port) && Number(health.port) > 0],
    ['GNANI_API_KEY', health.gnani_key === true],
    ['LLM_API_KEY', health.llm_key === true],
    ['ENCRYPTION_KEY', health.encryption_key === true],
    ['Gnani Prisma STT', health.stt_ok === true],
    ['Gnani Timbre TTS', health.tts_ok === true],
  ];
  for (const [label, passed] of checks) {
    console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  }
  if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
}

void main();
