import './server/env.ts';
import express from 'express';
import http from 'http';
import path from 'path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { synthesizeTimbreV3, warmTTSCache } from './server/gnani.ts';
import { extractWithGemini } from './server/extractor.ts';
import { encryptPayload, decryptPayload } from './server/crypto.ts';
import { evaluateDangerSigns } from './src/engine/dangerEngine.ts';
import { parseWeight } from './src/engine/numberEngine.ts';
import type { BeneficiaryRecord } from './src/types/index.ts';

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const BENEFICIARIES_FILE = path.join(PROJECT_ROOT, 'data', 'beneficiaries.json');

app.use(express.json({ limit: '10mb' }));

app.get('/api/beneficiaries', async (_req, res) => {
  try {
    res.json(await readNewBeneficiaries());
  } catch {
    res.status(500).json({ error: 'Could not load synthetic beneficiaries.' });
  }
});

app.post('/api/beneficiaries', async (req, res) => {
  const { name, house_no, category, age, village } = req.body;
  if (
    typeof name !== 'string' || !name.trim() ||
    typeof house_no !== 'string' || !house_no.trim() ||
    !['ANC', 'PNC'].includes(category)
  ) {
    return res.status(400).json({ error: 'Name, house number, and valid beneficiary type are required.' });
  }
  try {
    const records = await readNewBeneficiaries();
    const existing = records.find((item) =>
      item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase() &&
      item.house_no === house_no.trim()
    );
    if (existing) return res.json(existing);
    const created: BeneficiaryRecord = {
      id: `NEW-${Date.now()}`,
      name: name.trim(),
      house_no: house_no.trim(),
      village: typeof village === 'string' && village.trim() ? village.trim() : 'Rampur',
      category,
      age: Number.isFinite(Number(age)) ? Number(age) : 0,
      isNew: true,
    };
    const updated = [...records, created];
    await fs.mkdir(path.dirname(BENEFICIARIES_FILE), { recursive: true });
    await fs.writeFile(BENEFICIARIES_FILE, JSON.stringify(updated, null, 2), 'utf8');
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: 'Could not save synthetic beneficiary.' });
  }
});

app.delete('/api/beneficiaries', async (_req, res) => {
  try {
    await fs.rm(BENEFICIARIES_FILE, { force: true });
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: 'Could not purge synthetic beneficiaries.' });
  }
});

type HealthStatus = {
  gnani_key: boolean;
  llm_key: boolean;
  encryption_key: boolean;
  stt_ok: boolean;
  tts_ok: boolean;
  port: number;
};

let cachedHealth: HealthStatus | null = null;
let cachedHealthAt = 0;
let healthProbe: Promise<HealthStatus> | null = null;

app.get('/api/health', async (_req, res) => {
  if (cachedHealth && Date.now() - cachedHealthAt < 60_000) {
    return res.json(cachedHealth);
  }
  if (!healthProbe) {
    healthProbe = checkHealth()
      .then((health) => {
        cachedHealth = health;
        cachedHealthAt = Date.now();
        return health;
      })
      .finally(() => {
        healthProbe = null;
      });
  }
  res.json(await healthProbe);
});

app.get('/api/config', (req, res) => {
  res.json({
    sttModel: 'prisma-v3.0',
    ttsModel: 'timbre-v3.0',
    llmModel: 'gemini-2.5-flash',
    sttEndpoint: 'wss://api.vachana.ai/stt/v3/stream',
    ttsEndpoint: 'wss://api.vachana.ai/api/v1/tts',
  });
});

// LLM Entity Extractor API
app.post('/api/extract', async (req, res) => {
  try {
    const { transcript, lang } = req.body;
    if (typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({ error: 'Missing transcript' });
    }
    const extracted = await extractWithGemini(transcript, lang || 'en-IN');
    res.json(extracted);
  } catch (err: any) {
    console.error('Gemini extraction failed.');
    res.status(502).json({ error: err.message || 'Gemini extraction failed.' });
  }
});

app.post('/api/evaluate', (req, res) => {
  const { transcript, lang, beneficiaryName, beneficiaryId, category } = req.body;
  if (typeof transcript !== 'string' || !transcript.trim()) {
    return res.status(400).json({ error: 'Missing transcript' });
  }
  const weightText = typeof req.body.weightText === 'string' ? req.body.weightText : '';
  res.json({
    danger: evaluateDangerSigns(
      transcript,
      typeof lang === 'string' ? lang : 'en-IN',
      typeof beneficiaryName === 'string' ? beneficiaryName : 'Beneficiary',
      typeof beneficiaryId === 'string' ? beneficiaryId : 'ID-Pending'
    ),
    weight: parseWeight(
      weightText,
      category === 'newborn' ? 'newborn' : 'adult',
      typeof lang === 'string' ? lang : 'en-IN'
    ),
    bloodPressure: (() => {
      const systolic = Number(req.body.bpSystolic);
      const diastolic = Number(req.body.bpDiastolic);
      if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
        return { state: 'missing', plausible: false };
      }
      const plausible = systolic >= 70 && systolic <= 250 && diastolic >= 40 && diastolic <= 150;
      return { state: plausible ? 'confirmed' : 'uncertain', plausible };
    })(),
    hemoglobin: (() => {
      const value = Number(req.body.hemoglobin);
      if (!Number.isFinite(value)) return { state: 'missing', plausible: false };
      const plausible = value >= 3 && value <= 20;
      return { state: plausible ? 'confirmed' : 'uncertain', plausible };
    })(),
  });
});

// TTS REST Endpoint (uses in-memory pre-synthesized cache)
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice, lang, speed } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }
    const result = await synthesizeTimbreV3({ text, voice, lang, speed });
    res.json(result);
  } catch (err: any) {
    console.error('TTS error:', err.message);
    res.status(502).json({
      error: 'Gnani Timbre v3.0 synthesis failed',
      details: err.message,
      canRetry: true,
    });
  }
});

// Encrypted Record Storage Endpoints
app.post('/api/records/encrypt', (req, res) => {
  try {
    const encryptedToken = encryptPayload(req.body);
    res.json({ encryptedToken });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/records/decrypt', (req, res) => {
  try {
    const { token } = req.body;
    const decrypted = decryptPayload(token);
    res.json({ data: JSON.parse(decrypted) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// WebSocket Server for Real-Time Streaming (STT & TTS)
const wssSTT = new WebSocketServer({ noServer: true });
const wssTTS = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/ws/stt') {
    wssSTT.handleUpgrade(request, socket, head, (ws) => {
      wssSTT.emit('connection', ws, request, url);
    });
  } else if (pathname === '/ws/tts') {
    wssTTS.handleUpgrade(request, socket, head, (ws) => {
      wssTTS.emit('connection', ws, request, url);
    });
  } else {
    // Other websocket paths or vite HMR
  }
});

// STT WebSocket Streaming Handler
wssSTT.on('connection', (clientWs: WebSocket, request: any, url: any) => {
  const lang = url?.searchParams?.get('lang') || 'en-IN';
  const apiKey = process.env.GNANI_API_KEY;

  if (!apiKey) {
    clientWs.send(
      JSON.stringify({
        type: 'error',
        error_code: 'MISSING_API_KEY',
        message: 'GNANI_API_KEY is missing. Set GNANI_API_KEY in the .env file in the project root, then restart the backend.',
      })
    );
    clientWs.close();
    return;
  }

  // Connect to Gnani Prisma v3.0 streaming STT
  const gnaniHeaders = {
    'x-api-key-id': apiKey,
    model: 'prisma-v3.0',
    language_code: lang,
    'x-sample-rate': '16000',
    format: 'transcribe',
    'x-vad-threshold': '0.7',
    'x-min-silence-ms': '300',
    'x-min-speech-ms': '50',
    'x-min-segment-ms': '100',
  };

  let gnaniWs: WebSocket | null = null;
  let isGnaniOpen = false;
  const audioBufferQueue: Buffer[] = [];

  try {
    gnaniWs = new WebSocket('wss://api.vachana.ai/stt/v3/stream', {
      headers: gnaniHeaders,
    });
  } catch (err: any) {
    clientWs.send(
      JSON.stringify({
        type: 'error',
        error_code: 'GNANI_CONNECTION_ERROR',
        message: `Failed to initiate Gnani STT connection: ${err.message}`,
      })
    );
    clientWs.close();
    return;
  }

  gnaniWs.on('open', () => {
    isGnaniOpen = true;
    // Flush any buffered chunks
    while (audioBufferQueue.length > 0) {
      const chunk = audioBufferQueue.shift();
      if (chunk && gnaniWs?.readyState === WebSocket.OPEN) {
        gnaniWs.send(chunk);
      }
    }
  });

  gnaniWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // Forward Gnani events directly to the client
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(msg));
      }
    } catch {
      // Forward raw if not JSON
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    }
  });

  gnaniWs.on('error', (err: any) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          error_code: 'GNANI_STT_ERROR',
          message: `Gnani Prisma v3.0 STT error: ${err.message || 'Connection failed (HTTP 401 Unauthorized)'}`,
          canRetry: true,
        })
      );
    }
  });

  gnaniWs.on('close', (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(
        JSON.stringify({
          type: 'gnani_closed',
          code,
          reason: reason.toString(),
        })
      );
    }
  });

  // Client messages (audio chunks or control signals)
  clientWs.on('message', (message: any, isBinary: boolean) => {
    if (isBinary) {
      const pcmBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message as ArrayBuffer);
      if (isGnaniOpen && gnaniWs?.readyState === WebSocket.OPEN) {
        gnaniWs.send(pcmBuffer);
      } else {
        // Queue audio while Gnani connection finishes handshake
        if (audioBufferQueue.length < 50) {
          audioBufferQueue.push(pcmBuffer);
        }
      }
    } else {
      // Text control frame from client (e.g. stop, flush, language change)
      try {
        const textMsg = JSON.parse(message.toString());
        if (textMsg.type === 'stop') {
          if (gnaniWs?.readyState === WebSocket.OPEN) {
            gnaniWs.close();
          }
        }
      } catch {}
    }
  });

  clientWs.on('close', () => {
    if (gnaniWs && gnaniWs.readyState === WebSocket.OPEN) {
      gnaniWs.close();
    }
  });
});

// TTS WebSocket Streaming Handler
wssTTS.on('connection', (clientWs) => {
  clientWs.on('message', async (data) => {
    try {
      const payload = JSON.parse(data.toString());
      const { text, voice, lang, speed } = payload;

      if (!text) {
        return clientWs.send(
          JSON.stringify({ type: 'error', message: 'No text provided for synthesis' })
        );
      }

      await synthesizeTimbreV3(
        { text, voice, lang, speed },
        (chunk) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: 'chunk',
                ...chunk,
              })
            );
          }
        }
      );
    } catch (err: any) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            error_code: 'GNANI_TTS_ERROR',
            message: err.message,
            canRetry: true,
          })
        );
      }
    }
  });
});

// Mount Vite in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`[ASHA Vaani] Unified Server running on http://${HOST}:${PORT}`);
    console.log(`[ASHA Vaani] STT: Gnani Prisma v3.0 | TTS: Gnani Timbre v3.0 | LLM: Gemini`);
    warmTTSCache().catch(() => {
      console.warn('[ASHA Vaani] Timbre fixed-line cache warmup failed.');
    });
  });
}

startServer();

async function checkHealth(): Promise<HealthStatus> {
  const gnaniKey = Boolean(process.env.GNANI_API_KEY);
  const llmKey = Boolean(process.env.LLM_API_KEY);
  const encryptionKey = Boolean(process.env.ENCRYPTION_KEY);
  const [sttOk, ttsOk] = gnaniKey
    ? await Promise.all([probeGnaniStt(), probeGnaniTts()])
    : [false, false];
  return {
    gnani_key: gnaniKey,
    llm_key: llmKey,
    encryption_key: encryptionKey,
    stt_ok: sttOk,
    tts_ok: ttsOk,
    port: PORT,
  };
}

async function readNewBeneficiaries(): Promise<BeneficiaryRecord[]> {
  try {
    const content = await fs.readFile(BENEFICIARIES_FILE, 'utf8');
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) throw new Error('Stored beneficiary data is invalid.');
    return parsed as BeneficiaryRecord[];
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function probeGnaniStt(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket | null = null;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (ws && ws.readyState < WebSocket.CLOSING) ws.close();
      resolve(ok);
    };
    const timeout = setTimeout(() => finish(false), 3500);
    try {
      ws = new WebSocket('wss://api.vachana.ai/stt/v3/stream', {
        headers: {
          'x-api-key-id': process.env.GNANI_API_KEY!,
          model: 'prisma-v3.0',
          language_code: 'en-IN',
          format: 'transcribe',
          'x-sample-rate': '16000',
        },
      });
      ws.once('open', () => {
        ws?.send(Buffer.alloc(3200));
        setTimeout(() => finish(true), 250);
      });
      ws.on('message', (message) => {
        try {
          const response = JSON.parse(message.toString());
          if (response.type === 'error' || response.error) finish(false);
        } catch {
          finish(false);
        }
      });
      ws.once('error', () => finish(false));
      ws.once('close', () => {
        if (!settled) finish(false);
      });
    } catch {
      finish(false);
    }
  });
}

async function probeGnaniTts(): Promise<boolean> {
  try {
    const result = await synthesizeTimbreV3({
      text: 'Ready.',
      voice: 'Shivani',
      lang: 'en-IN',
    });
    return result.audioBase64.length > 0;
  } catch {
    return false;
  }
}
