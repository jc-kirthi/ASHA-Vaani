import { useState, useRef, useEffect, useCallback } from 'react';
import { NoiseMode } from '../types';

export interface STTErrorState {
  message: string;
  code?: string;
  canRetry: boolean;
}

export function useAudioRecorder(
  onTranscriptChunk?: (text: string, isFinal: boolean, metadata?: any) => void
) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [noiseMode, setNoiseMode] = useState<NoiseMode>('normal');
  const [error, setError] = useState<STTErrorState | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const manualStopRef = useRef(false);

  const stopRecording = useCallback(() => {
    manualStopRef.current = true;
    // 1. Stop animation meter
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // 2. Close STT WebSocket
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'stop' }));
          wsRef.current.close();
        }
      } catch {}
      wsRef.current = null;
    }

    // 3. Clean up audio processing nodes
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }

    // 4. Release microphone track
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // 5. Close AudioContext
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    setIsRecording(false);
    setAudioLevel(0);
  }, []);

  const startRecording = useCallback(
    async (langCode: string = 'hi-IN') => {
      stopRecording();
      manualStopRef.current = false;
      setError(null);

      // Gnani Prisma v3.0 streaming STT path
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        mediaStreamRef.current = stream;

        // Establish WebSocket connection to backend Gnani STT proxy
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/stt?lang=${encodeURIComponent(langCode)}`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[STT] Connected to backend Gnani Prisma v3.0 proxy');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'error' || data.error) {
              console.error('[STT] Gnani STT error:', data);
              setError({
                message: data.message || 'Gnani Prisma v3.0 streaming failed',
                code: data.error_code,
                canRetry: true,
              });
              stopRecording();
              return;
            }

            // Gnani Prisma v3.0 emits transcript messages with text field
            if (data.type === 'partial' && typeof data.text === 'string') {
              onTranscriptChunk?.(data.text, false, { engine: 'Gnani Prisma v3.0' });
            } else if (data.text) {
              const text = data.text;
              if (onTranscriptChunk) {
                onTranscriptChunk(text, true, {
                  engine: 'Gnani Prisma v3.0',
                  latency: data.latency,
                  audioDurationMs: data.audio_duration_ms,
                  detectedLang: data.detected_language_code,
                });
              }
            } else if (data.transcript) {
              if (onTranscriptChunk) {
                onTranscriptChunk(data.transcript, true, { engine: 'Gnani Prisma v3.0' });
              }
            }
          } catch {
            // Non-JSON message
          }
        };

        ws.onerror = () => {
          console.error('[STT] WebSocket error communicating with backend');
          setError({
            message: 'Gnani Prisma v3.0 connection failed. Check server connection or credentials.',
            canRetry: true,
          });
        };

        ws.onclose = (event) => {
          if (event.code !== 1000 && !manualStopRef.current) {
            console.warn('[STT] WebSocket closed:', event.code, event.reason);
            setError({
              message: `Gnani Prisma v3.0 connection closed unexpectedly (${event.code}). Please retry.`,
              canRetry: true,
            });
          }
        };

        // Initialize AudioContext
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtxClass();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        // Ambient noise level & speech amplitude monitoring
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const updateAudioMeter = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(freqData);

          let sum = 0;
          for (let i = 0; i < freqData.length; i++) {
            sum += freqData[i];
          }
          const avg = sum / freqData.length;
          const normalized = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(normalized);

          if (normalized < 15) {
            setNoiseMode('quiet');
          } else if (normalized < 50) {
            setNoiseMode('normal');
          } else {
            setNoiseMode('noisy');
          }

          animationFrameRef.current = requestAnimationFrame(updateAudioMeter);
        };
        updateAudioMeter();

        // Downsample/Convert Float32 PCM to 16-bit Linear PCM (16kHz)
        const bufferSize = 4096;
        const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (!isRecording && ws.readyState !== WebSocket.OPEN) return;

          const inputData = e.inputBuffer.getChannelData(0);
          const sampleRate = audioCtx.sampleRate;
          const targetSampleRate = 16000;

          // Resample to 16kHz
          const resampledLength = Math.round((inputData.length * targetSampleRate) / sampleRate);
          const pcm16 = new Int16Array(resampledLength);

          for (let i = 0; i < resampledLength; i++) {
            const originalIndex = (i * sampleRate) / targetSampleRate;
            const index = Math.floor(originalIndex);
            const frac = originalIndex - index;
            const sample1 = inputData[index] || 0;
            const sample2 = inputData[index + 1] || sample1;
            const interp = sample1 + frac * (sample2 - sample1);

            // Clamp and convert to 16-bit PCM
            const clamped = Math.max(-1, Math.min(1, interp));
            pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
          }

          // Send binary buffer to backend
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(pcm16.buffer);
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

        setIsRecording(true);
      } catch (err: any) {
        console.error('[STT] Mic initialization error:', err);
        setError({
          message: err.name === 'NotAllowedError'
            ? 'Microphone permission was denied. Please allow microphone access in browser settings.'
            : `Microphone access error: ${err.message}`,
          canRetry: true,
        });
        setIsRecording(false);
      }
    },
    [onTranscriptChunk, stopRecording, isRecording, error]
  );

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    audioLevel,
    noiseMode,
    error,
    clearError: () => setError(null),
    startRecording,
    stopRecording,
    setNoiseMode,
  };
}
