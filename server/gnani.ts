import WebSocket from 'ws';

export interface TTSRequest {
  text: string;
  voice?: string;
  lang?: string;
  speed?: number;
}

export interface TTSResponseChunk {
  chunkIndex: number;
  audioBase64: string;
  isFinal: boolean;
  timeToFirstAudioMs?: number;
}

// In-memory audio cache for fixed lines (AI disclosure, referral lines, save confirmation)
const ttsCache = new Map<string, string>();

/**
 * Synthesizes text using Gnani Timbre v3.0 WebSocket.
 * Returns the complete audio base64 or streams chunks via onChunk callback.
 */
export async function synthesizeTimbreV3(
  req: TTSRequest,
  onChunk?: (chunk: TTSResponseChunk) => void
): Promise<{ audioBase64: string; timeToFirstAudioMs: number; cached: boolean }> {
  const apiKey = process.env.GNANI_API_KEY;
  if (!apiKey) {
    throw new Error('GNANI_API_KEY is missing. Set GNANI_API_KEY in the .env file in the project root, then restart the backend.');
  }

  const voice = req.voice || 'Shivani';
  const lang = req.lang || 'en-IN';
  const text = req.text.trim();
  const speed = req.speed || 1.0;

  const cacheKey = `${voice}:${lang}:${text}`;
  if (ttsCache.has(cacheKey)) {
    const cachedAudio = ttsCache.get(cacheKey)!;
    if (onChunk) {
      onChunk({
        chunkIndex: 0,
        audioBase64: cachedAudio,
        isFinal: true,
        timeToFirstAudioMs: 5,
      });
    }
    return { audioBase64: cachedAudio, timeToFirstAudioMs: 5, cached: true };
  }

  const startTime = Date.now();
  let firstAudioTime: number | null = null;
  const audioChunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let isSettled = false;

    const timeout = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        if (ws) {
          try { ws.close(); } catch {}
        }
        reject(new Error('Gnani Timbre v3.0 WebSocket timeout after 8000ms'));
      }
    }, 8000);

    try {
      ws = new WebSocket('wss://api.vachana.ai/api/v1/tts', {
        headers: {
          'X-API-Key-ID': apiKey,
        },
      });
    } catch (err: any) {
      clearTimeout(timeout);
      return reject(new Error(`Failed to create Gnani TTS WebSocket: ${err.message}`));
    }

    ws.on('open', () => {
      const payload = {
        text,
        voice,
        model: 'timbre-v3.0',
        language: lang,
        speed,
        audio_config: {
          sample_rate: 24000,
          num_channels: 1,
          sample_width: 2,
          encoding: 'linear_pcm',
          container: 'wav',
        },
      };
      ws?.send(JSON.stringify(payload));
    });

    ws.on('message', (raw) => {
      try {
        const event = JSON.parse(raw.toString());
        const msg = event.data && typeof event.data === 'object' ? event.data : event;
        if (event.type === 'error' || msg.error || msg.detail) {
          isSettled = true;
          clearTimeout(timeout);
          ws?.close();
          const detail = event.message || msg.detail?.message || msg.error || 'Gnani Timbre TTS Error';
          return reject(new Error(`Gnani Timbre v3.0 API Error: ${detail}`));
        }

        if (msg.audio) {
          if (firstAudioTime === null) {
            firstAudioTime = Date.now() - startTime;
          }
          audioChunks.push(Buffer.from(msg.audio, 'base64'));

          if (onChunk) {
            onChunk({
              chunkIndex: msg.chunk_index ?? audioChunks.length,
              audioBase64: msg.audio,
              isFinal: !!msg.is_final,
              timeToFirstAudioMs: firstAudioTime,
            });
          }
        }

        if (msg.is_final || event.type === 'complete') {
          isSettled = true;
          clearTimeout(timeout);
          ws?.close();

          const fullAudio = Buffer.concat(audioChunks).toString('base64');
          if (fullAudio) {
            // Cache fixed or common lines under 200 characters
            if (text.length < 200) {
              ttsCache.set(cacheKey, fullAudio);
            }
          }

          resolve({
            audioBase64: fullAudio,
            timeToFirstAudioMs: firstAudioTime || (Date.now() - startTime),
            cached: false,
          });
        }
      } catch (err: any) {
        console.error('Error parsing Gnani TTS message:', err);
      }
    });

    ws.on('error', (err: any) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeout);
        reject(new Error(`Gnani Timbre v3.0 connection error: ${err.message || '401 Unauthorized / Connection Failed'}`));
      }
    });

    ws.on('close', (code, reason) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeout);
        if (audioChunks.length > 0) {
          const fullAudio = Buffer.concat(audioChunks).toString('base64');
          resolve({
            audioBase64: fullAudio,
            timeToFirstAudioMs: firstAudioTime || (Date.now() - startTime),
            cached: false,
          });
        } else {
          reject(new Error(`Gnani Timbre v3.0 closed unexpectedly (code ${code}): ${reason.toString() || 'Connection closed'}`));
        }
      }
    });
  });
}

/**
 * Pre-synthesizes key fixed lines on server start for zero-latency instant response.
 */
export async function warmTTSCache() {
  const apiKey = process.env.GNANI_API_KEY;
  if (!apiKey) return;

  const fixedLines = [
    { lang: 'hi-IN', voice: 'Chetana', text: 'नमस्ते, मैं आशा वाणी हूँ, एक कृत्रिम बुद्धिमत्ता सहायक। आप अपने गृह भेंट के विवरण बोल सकते हैं।' },
    { lang: 'hi-IN', voice: 'Chetana', text: 'खतरे का लक्षण पाया गया है! तत्काल प्राथमिक स्वास्थ्य केंद्र (PHC) रेफरल आवश्यक है।' },
    { lang: 'hi-IN', voice: 'Chetana', text: 'बाकी सब ठीक है, क्या मैं यह विवरण सुरक्षित करूँ?' },
    { lang: 'kn-IN', voice: 'Chetana', text: 'ನಮಸ್ಕಾರ, ನಾನು ಆಶಾ ವಾಣಿ, AI ಸಹಾಯಕ. ನಿಮ್ಮ ಭೇಟಿಯ ವಿವರಗಳನ್ನು ಹೇಳಬಹುದು.' },
    { lang: 'kn-IN', voice: 'Chetana', text: 'ಅಪಾಯದ ಲಕ್ಷಣ ಕಂಡುಬಂದಿದೆ! ತಕ್ಷಣ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರಕ್ಕೆ (PHC) ಕರೆದೊಯ್ಯಿರಿ.' },
    { lang: 'kn-IN', voice: 'Chetana', text: 'ಎಲ್ಲಾ ಸರಿಯಾಗಿದೆ, ಈ ದಾಖಲೆಯನ್ನು ಉಳಿಸುವುದೇ?' },
    { lang: 'en-IN', voice: 'Shivani', text: 'Hello, I am ASHA Vaani, an artificial intelligence assistant. Please speak your visit notes.' },
    { lang: 'en-IN', voice: 'Shivani', text: 'Please refer to the PHC now.' },
    { lang: 'en-IN', voice: 'Shivani', text: 'Everything else okay, save?' },
  ];

  for (const item of fixedLines) {
    try {
      await synthesizeTimbreV3({ text: item.text, lang: item.lang, voice: item.voice });
    } catch (error) {
      if (!process.env.GNANI_API_KEY) return;
      throw error;
    }
  }
}
