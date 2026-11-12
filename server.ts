import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { synthesizeTimbreV3, warmTTSCache } from './server/gnani.ts';
import { extractWithGemini } from './server/extractor.ts';
import { encryptPayload, decryptPayload } from './server/crypto.ts';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.json({ limit: '10mb' }));

// Health and Diagnostics API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    stt: 'Gnani Prisma v3.0',
    tts: 'Gnani Timbre v3.0',
    llm: 'Gemini (gemini-2.5-flash)',
    keysConfigured: {
      gnani: !!process.env.GNANI_API_KEY,
      llm: !!(process.env.LLM_API_KEY || process.env.GEMINI_API_KEY),
      encryption: !!process.env.ENCRYPTION_KEY,
    },
  });
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
    if (!transcript) {
      return res.status(400).json({ error: 'Missing transcript' });
    }
    const extracted = await extractWithGemini(transcript, lang || 'hi-IN');
    res.json(extracted);
  } catch (err: any) {
    console.error('Extraction error:', err.message);
    res.status(500).json({ error: err.message });
  }
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
  const lang = url?.searchParams?.get('lang') || 'hi-IN';
  const apiKey = process.env.GNANI_API_KEY;

  if (!apiKey) {
    clientWs.send(
      JSON.stringify({
        type: 'error',
        error_code: 'MISSING_API_KEY',
        message: 'GNANI_API_KEY is not configured on the server.',
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
    'x-min-silence-ms': '500',
    'x-min-speech-ms': '100',
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
    // Warm up TTS cache asynchronously
    warmTTSCache().catch(() => {});
  });
}

startServer();
