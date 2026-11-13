export interface SpeechEndpointingOptions {
  silenceDurationMs?: number;
  minimumSpeechMs?: number;
  minimumTurnMs?: number;
  minimumRms?: number;
  noiseMultiplier?: number;
}

export function createSpeechEndpointDetector(options: SpeechEndpointingOptions = {}) {
  const silenceDurationMs = options.silenceDurationMs ?? 1500;
  const minimumSpeechMs = options.minimumSpeechMs ?? 350;
  const minimumTurnMs = options.minimumTurnMs ?? 700;
  const minimumRms = options.minimumRms ?? 0.012;
  const noiseMultiplier = options.noiseMultiplier ?? 1.8;
  let noiseFloor = 0.004;
  let speechStartedAt: number | null = null;
  let lastVoicedAt: number | null = null;
  let lastFrameAt: number | null = null;
  let voicedDurationMs = 0;
  let previousFrameWasVoiced = false;
  let finalized = false;

  return {
    observe(rms: number, timestamp: number): boolean {
      if (finalized || !Number.isFinite(rms) || !Number.isFinite(timestamp)) return false;
      const elapsed = lastFrameAt === null
        ? 0
        : Math.max(0, Math.min(250, timestamp - lastFrameAt));
      lastFrameAt = timestamp;

      const threshold = Math.max(minimumRms, noiseFloor * noiseMultiplier);
      const isVoiced = rms >= (speechStartedAt === null ? threshold : threshold * 0.65);
      if (isVoiced) {
        if (speechStartedAt === null) speechStartedAt = timestamp;
        if (previousFrameWasVoiced) voicedDurationMs += elapsed;
        lastVoicedAt = timestamp;
        previousFrameWasVoiced = true;
        return false;
      }

      previousFrameWasVoiced = false;
      if (speechStartedAt === null) {
        noiseFloor = Math.min(0.02, noiseFloor * 0.95 + Math.max(0, rms) * 0.05);
        return false;
      }

      if (
        lastVoicedAt !== null &&
        voicedDurationMs >= minimumSpeechMs &&
        timestamp - speechStartedAt >= minimumTurnMs &&
        timestamp - lastVoicedAt >= silenceDurationMs
      ) {
        finalized = true;
        return true;
      }
      return false;
    },
    reset() {
      noiseFloor = 0.004;
      speechStartedAt = null;
      lastVoicedAt = null;
      lastFrameAt = null;
      voicedDurationMs = 0;
      previousFrameWasVoiced = false;
      finalized = false;
    },
  };
}
