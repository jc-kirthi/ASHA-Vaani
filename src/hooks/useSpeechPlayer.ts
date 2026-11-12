import { useState, useRef, useCallback } from 'react';

export interface TTSErrorState {
  message: string;
  canRetry: boolean;
}

interface SpeechRequest {
  text: string;
  langCode: string;
  voiceName: string;
  onComplete?: () => void;
}

export function useSpeechPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCaption, setCurrentCaption] = useState<string | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number>(0);
  const [error, setError] = useState<TTSErrorState | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<SpeechRequest | null>(null);

  // Instant barge-in stop
  const stop = useCallback(() => {
    // Abort ongoing HTTP / WebSocket fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop Web Audio playback node immediately
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {}
      currentSourceRef.current = null;
    }

    setIsPlaying(false);
    setCurrentCaption(null);
  }, []);

  const speak = useCallback(
    async (
      text: string,
      langCode: string = 'hi-IN',
      voiceName: string = 'Chetana',
      onComplete?: () => void
    ) => {
      // Barge-in guarantee: stop any audio currently playing
      stop();
      setError(null);

      if (!text || text.trim().length === 0) {
        if (onComplete) onComplete();
        return;
      }

      lastRequestRef.current = { text, langCode, voiceName, onComplete };
      setCurrentCaption(text);
      setIsPlaying(true);
      const startTime = performance.now();

      // Gnani Timbre v3.0 TTS path
      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;

      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice: voiceName,
            lang: langCode,
            speed: 1.0,
          }),
          signal: abortCtrl.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.details || errData.error || `HTTP ${response.status} from Gnani TTS proxy`);
        }

        const data = await response.json();
        const latency = data.timeToFirstAudioMs || Math.round(performance.now() - startTime);
        setLastLatencyMs(latency);

        if (!data.audioBase64) {
          throw new Error('No audio returned by Gnani Timbre v3.0');
        }

        // Convert base64 to ArrayBuffer
        const binaryStr = window.atob(data.audioBase64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        // Initialize AudioContext if needed
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioCtxClass();
        }
        const audioCtx = audioContextRef.current;
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        // Decode audio data (WAV / linear PCM)
        const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0));

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        currentSourceRef.current = source;

        source.onended = () => {
          setIsPlaying(false);
          setCurrentCaption(null);
          currentSourceRef.current = null;
          if (onComplete) onComplete();
        };

        source.start(0);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Normal interruption by user barge-in
          return;
        }
        console.error('[TTS] Gnani Timbre v3.0 error:', err);
        setIsPlaying(false);
        setCurrentCaption(null);
        setError({
          message: `Gnani Timbre v3.0 TTS failed: ${err.message}`,
          canRetry: true,
        });
      }
    },
    [stop]
  );

  const retry = useCallback(() => {
    const request = lastRequestRef.current;
    if (request) {
      void speak(request.text, request.langCode, request.voiceName, request.onComplete);
    }
  }, [speak]);

  return {
    isPlaying,
    currentCaption,
    lastLatencyMs,
    error,
    clearError: () => setError(null),
    speak,
    retry,
    stop,
  };
}
