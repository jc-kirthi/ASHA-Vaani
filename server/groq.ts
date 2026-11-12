import type { ExtractedVisitData } from './extractor.ts';

export interface GroqModel {
  id: string;
  active?: boolean;
  supported_parameters?: string[];
}

export interface GroqCallResult {
  extraction: ExtractedVisitData;
  model: string;
}

export class LlmProviderError extends Error {
  constructor(
    readonly status: string,
    message: string,
    readonly retryAfterMs = 0,
    readonly invalidJson = false
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

type GroqEnvironment = {
  FALLBACK_API_KEY?: string;
  FALLBACK_BASE_URL?: string;
  FALLBACK_MODEL?: string;
};

type FetchLike = typeof fetch;

let modelCatalog: GroqModel[] | null = null;
let catalogExpiresAt = 0;
let catalogRequest: Promise<GroqModel[]> | null = null;

function configuration(env: GroqEnvironment) {
  const apiKey = env.FALLBACK_API_KEY?.trim();
  const baseUrl = (env.FALLBACK_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!apiKey) throw new LlmProviderError('NOT_CONFIGURED', 'Fallback provider is not configured.');
  if (!baseUrl) throw new LlmProviderError('NOT_CONFIGURED', 'Fallback base URL is not configured.');
  return { apiKey, baseUrl };
}

function statusFromResponse(response: Response, body: string): LlmProviderError {
  let message = `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error?.message === 'string') message = parsed.error.message;
  } catch {
    // Keep the status-only diagnostic when the provider did not return JSON.
  }
  const retryHeader = response.headers.get('retry-after');
  const retrySeconds = retryHeader ? Number(retryHeader) : 0;
  return new LlmProviderError(
    String(response.status),
    message,
    Number.isFinite(retrySeconds) ? Math.max(0, retrySeconds * 1000) : 0
  );
}

export async function discoverGroqModels(
  env: GroqEnvironment = process.env,
  fetchImpl: FetchLike = fetch
): Promise<GroqModel[]> {
  const { apiKey, baseUrl } = configuration(env);
  if (modelCatalog && Date.now() < catalogExpiresAt) return modelCatalog;
  if (!catalogRequest) {
    catalogRequest = (async () => {
      const response = await fetchImpl(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(1200),
      });
      if (!response.ok) throw statusFromResponse(response, await response.text());
      const payload = await response.json() as { data?: unknown };
      if (!Array.isArray(payload.data)) {
        throw new LlmProviderError('INVALID_RESPONSE', 'Provider model list was invalid.');
      }
      const models = payload.data.filter((item): item is GroqModel =>
        Boolean(item && typeof item === 'object' && typeof (item as GroqModel).id === 'string')
      );
      modelCatalog = models;
      catalogExpiresAt = Date.now() + 5 * 60_000;
      return models;
    })().finally(() => {
      catalogRequest = null;
    });
  }
  return catalogRequest;
}

function selectModel(models: GroqModel[], configuredModel: string | undefined): GroqModel {
  const configured = configuredModel?.trim();
  if (configured) {
    const match = models.find((model) => model.id === configured && model.active !== false);
    if (!match) {
      throw new LlmProviderError('MODEL_UNAVAILABLE', 'Configured fallback model is not available.');
    }
    return match;
  }

  const candidate = models.find((model) =>
    model.active !== false &&
    /instant/i.test(model.id) &&
    !/(reason|thinking|deepseek-r1|qwq)/i.test(model.id)
  );
  if (!candidate) {
    throw new LlmProviderError(
      'MODEL_NOT_CONFIGURED',
      'Set FALLBACK_MODEL to an active, fast non-reasoning chat model from the provider model list.'
    );
  }
  return candidate;
}

export async function selectedGroqModel(
  env: GroqEnvironment = process.env,
  fetchImpl: FetchLike = fetch
): Promise<GroqModel> {
  const models = await discoverGroqModels(env, fetchImpl);
  return selectModel(models, env.FALLBACK_MODEL);
}

export async function extractWithGroq(options: {
  transcript: string;
  language: string;
  schema: unknown;
  validate: (value: unknown, model: string) => ExtractedVisitData;
  env?: GroqEnvironment;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}): Promise<GroqCallResult> {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const { apiKey, baseUrl } = configuration(env);
  const model = (await selectedGroqModel(env, fetchImpl)).id;
  const models = await discoverGroqModels(env, fetchImpl);
  const modelMetadata = models.find((item) => item.id === model);
  const supportsResponseFormat = modelMetadata?.supported_parameters?.includes('response_format') === true;
  const responseFormat = supportsResponseFormat
    ? {
        type: 'json_schema',
        json_schema: {
          name: 'visit_extraction',
          strict: true,
          schema: options.schema,
        },
      }
    : { type: 'json_object' };
  const prompt = `Language code: ${options.language}\nTranscript: ${options.transcript}`;
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: responseFormat,
    }),
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(1500)])
      : AbortSignal.timeout(1500),
  });
  if (!response.ok) throw statusFromResponse(response, await response.text());

  let payload: {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  try {
    payload = await response.json() as typeof payload;
  } catch {
    throw new LlmProviderError('INVALID_JSON', 'Provider returned invalid JSON.', 0, true);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new LlmProviderError('INVALID_JSON', 'Provider returned invalid JSON.', 0, true);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new LlmProviderError('INVALID_JSON', 'Provider returned invalid JSON.', 0, true);
  }
  try {
    return { extraction: options.validate(parsed, model), model };
  } catch {
    throw new LlmProviderError('INVALID_JSON', 'Provider returned schema-invalid JSON.', 0, true);
  }
}

export async function warmGroqModelCatalog(): Promise<void> {
  if (!process.env.FALLBACK_API_KEY) return;
  await discoverGroqModels();
}

export function resetGroqModelCatalog(): void {
  modelCatalog = null;
  catalogExpiresAt = 0;
  catalogRequest = null;
}
