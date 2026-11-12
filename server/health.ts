export interface ServiceHealthInputs {
  port: number;
  gnaniKey: boolean;
  llmKey: boolean;
  fallbackKey: boolean;
  encryptionKey: boolean;
  sttOk: boolean;
  ttsOk: boolean;
}

export function createHealthResponse(input: ServiceHealthInputs) {
  return {
    gnani_key: input.gnaniKey,
    llm_key: input.llmKey,
    fallback_key: input.fallbackKey,
    encryption_key: input.encryptionKey,
    stt_ok: input.sttOk,
    tts_ok: input.ttsOk,
    port: input.port,
  };
}
