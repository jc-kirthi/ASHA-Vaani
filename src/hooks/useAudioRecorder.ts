import { useState, useRef, useEffect, useCallback } from 'react';
import { NoiseMode } from '../types';
import { createSpeechEndpointDetector, type SpeechEndpointingOptions } from '../engine/speechEndpointing';

export interface STTErrorState {
  message: string;
  code?: string;
  canRetry: boolean;
}

export interface AudioRecorderOptions extends SpeechEndpointingOptions {
  finalizationTimeoutMs?: number;
}

export function useAudioRecorder(
  onTranscriptChunk?: (text: string, isFinal: boolean, metadata?: any) => void,
  options: AudioRecorderOptions = {}
) {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [noiseMode, setNoiseMode] = useState<NoiseMode>('normal');
  const [error, setError] = useState<STTErrorState | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const manualStopRef = useRef(false);
  const connectionTimeoutRef = useRef<number | null>(null);
  const finalizationTimeoutRef = useRef<number | null>(null);
  const speechFinalizedRef = useRef(false);
  const autoFinalizingRef = useRef(false);
  const finalTranscriptDeliveredRef = useRef(false);
  const latestTranscriptRef = useRef('');
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const releaseAudioCapture = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (workletRef.current) {
      try { workletRef.current.disconnect(); } catch {}
      workletRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {}
      sourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const stopRecording = useCallback(() => {
    manualStopRef.current = true;
    speechFinalizedRef.current = true;
    autoFinalizingRef.current = false;
    if (connectionTimeoutRef.current !== null) {
      window.clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (finalizationTimeoutRef.current !== null) {
      window.clearTimeout(finalizationTimeoutRef.current);
      finalizationTimeoutRef.current = null;
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'stop' }));
        }
        wsRef.current.close(1000, 'Recording stopped');
      } catch {}
      wsRef.current = null;
    }
    releaseAudioCapture();
    setIsRecording(false);
    setIsConnecting(false);
    setIsFinalizing(false);
  }, [releaseAudioCapture]);

  const startRecording = useCallback(
    async (langCode: string = 'hi-IN') => {
      stopRecording();
      manualStopRef.current = false;
      speechFinalizedRef.current = false;
      autoFinalizingRef.current = false;
      finalTranscriptDeliveredRef.current = false;
      latestTranscriptRef.current = '';
      setError(null);
      setIsFinalizing(false);
      setIsConnecting(true);

      const configuredSilenceMs = Number(import.meta.env.VITE_SPEECH_SILENCE_MS);
      const endpointDetector = createSpeechEndpointDetector({
        ...optionsRef.current,
        silenceDurationMs: optionsRef.current.silenceDurationMs ??
          (Number.isFinite(configuredSilenceMs) && configuredSilenceMs >= 300 && configuredSilenceMs <= 5000
            ? configuredSilenceMs
            : 1500),
      });

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

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/stt?lang=${encodeURIComponent(langCode)}`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;
        const queuedAudio: ArrayBuffer[] = [];

        const deliverFinalTranscript = (transcriptValue: string, source: string) => {
          if (finalTranscriptDeliveredRef.current) return;
          const finalText = transcriptValue.trim();
          finalTranscriptDeliveredRef.current = true;
          speechFinalizedRef.current = true;
          manualStopRef.current = true;
          autoFinalizingRef.current = false;
          setIsFinalizing(false);
          setIsRecording(false);
          setIsConnecting(false);
          releaseAudioCapture();
          if (finalizationTimeoutRef.current !== null) {
            window.clearTimeout(finalizationTimeoutRef.current);
            finalizationTimeoutRef.current = null;
          }
          if (!finalText) {
            setError({
              message: 'No speech was recognized. Please speak again or tap the microphone to retry.',
              canRetry: true,
            });
            setIsRecording(false);
            setIsConnecting(false);
            if (ws.readyState < WebSocket.CLOSING) ws.close(1000, 'Empty speech turn');
            return;
          }
          if (ws.readyState < WebSocket.CLOSING) ws.close(1000, 'Speech turn complete');
          if (wsRef.current === ws) wsRef.current = null;
          onTranscriptChunk?.(finalText, true, {
            engine: 'Gnani Prisma v3.0',
            endpoint: source,
          });
        };

        const finalizeAfterSilence = () => {
          if (speechFinalizedRef.current) return;
          speechFinalizedRef.current = true;
          autoFinalizingRef.current = true;
          manualStopRef.current = true;
          releaseAudioCapture();
          setIsRecording(false);
          setIsConnecting(false);
          setIsFinalizing(true);
          if (connectionTimeoutRef.current !== null) {
            window.clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          const timeoutMs = optionsRef.current.finalizationTimeoutMs ?? 2500;
          finalizationTimeoutRef.current = window.setTimeout(() => {
            deliverFinalTranscript(latestTranscriptRef.current, 'silence');
          }, timeoutMs);
        };

        ws.onopen = () => {
          if (connectionTimeoutRef.current !== null) {
            window.clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          while (queuedAudio.length && ws.readyState === WebSocket.OPEN) {
            const chunk = queuedAudio.shift();
            if (chunk) ws.send(chunk);
          }
          if (speechFinalizedRef.current) {
            return;
          }
          setIsConnecting(false);
          setIsRecording(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data)) as {
              type?: string;
              text?: string;
              transcript?: string;
              error?: string;
              message?: string;
              error_code?: string;
              latency?: number;
              audio_duration_ms?: number;
              detected_language_code?: string;
            };
            if (data.type === 'error' || data.error) {
              if (autoFinalizingRef.current && latestTranscriptRef.current) {
                deliverFinalTranscript(latestTranscriptRef.current, 'silence');
                return;
              }
              setError({
                message: data.message || data.error || 'Gnani Prisma v3.0 streaming failed',
                code: data.error_code,
                canRetry: true,
              });
              setIsConnecting(false);
              releaseAudioCapture();
              setIsRecording(false);
              setIsFinalizing(false);
              return;
            }
            if (data.type === 'gnani_closed') {
              if (autoFinalizingRef.current) {
                deliverFinalTranscript(latestTranscriptRef.current, 'silence');
              } else if (!finalTranscriptDeliveredRef.current && !speechFinalizedRef.current) {
                setError({
                  message: 'Gnani Prisma closed before returning a transcript. Please retry.',
                  canRetry: true,
                });
                releaseAudioCapture();
                setIsRecording(false);
                setIsConnecting(false);
              }
              if (ws.readyState < WebSocket.CLOSING) ws.close(1000, 'Speech stream ended');
              return;
            }

            const text = data.type === 'partial' ? data.text : data.text || data.transcript;
            if (typeof text !== 'string' || !text.trim()) return;
            latestTranscriptRef.current = text;
            if (data.type === 'partial') {
              onTranscriptChunk?.(text, false, { engine: 'Gnani Prisma v3.0' });
              return;
            }
            deliverFinalTranscript(text, 'provider');
          } catch {
            // Ignore non-JSON keepalive frames from the speech service.
          }
        };

        ws.onerror = () => {
          if (autoFinalizingRef.current && latestTranscriptRef.current) {
            deliverFinalTranscript(latestTranscriptRef.current, 'silence');
            return;
          }
          setError({
            message: 'Gnani Prisma v3.0 connection failed. Check the server and credentials, then retry.',
            canRetry: true,
          });
          releaseAudioCapture();
          setIsConnecting(false);
          setIsRecording(false);
          setIsFinalizing(false);
        };

        ws.onclose = (event) => {
          if (autoFinalizingRef.current && !finalTranscriptDeliveredRef.current) {
            deliverFinalTranscript(latestTranscriptRef.current, 'silence');
            return;
          }
          if (event.code !== 1000 && !manualStopRef.current && !finalTranscriptDeliveredRef.current) {
            setError({
              message: `Gnani Prisma v3.0 connection closed unexpectedly (${event.code}). Please retry.`,
              canRetry: true,
            });
            releaseAudioCapture();
            setIsConnecting(false);
            setIsRecording(false);
          }
        };

        const AudioCtxClass = window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtxClass) throw new Error('Web Audio is not available in this browser.');
        const audioCtx = new AudioCtxClass();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const updateAudioMeter = () => {
          analyser.getByteFrequencyData(freqData);
          const avg = freqData.reduce((sum, value) => sum + value, 0) / freqData.length;
          const normalized = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(normalized);
          setNoiseMode(normalized < 15 ? 'quiet' : normalized < 50 ? 'normal' : 'noisy');
          animationFrameRef.current = requestAnimationFrame(updateAudioMeter);
        };
        updateAudioMeter();

        const handleAudioFrame = (inputData: Float32Array) => {
          if (speechFinalizedRef.current) return;
          let sumSquares = 0;
          for (let index = 0; index < inputData.length; index += 1) {
            sumSquares += inputData[index] * inputData[index];
          }
          const rms = Math.sqrt(sumSquares / inputData.length);
          const sampleRate = audioCtx.sampleRate;
          const targetSampleRate = 16000;
          const resampledLength = Math.round((inputData.length * targetSampleRate) / sampleRate);
          const pcm16 = new Int16Array(resampledLength);

          for (let index = 0; index < resampledLength; index += 1) {
            const originalIndex = (index * sampleRate) / targetSampleRate;
            const sourceIndex = Math.floor(originalIndex);
            const fraction = originalIndex - sourceIndex;
            const sample1 = inputData[sourceIndex] || 0;
            const sample2 = inputData[sourceIndex + 1] || sample1;
            const interpolated = sample1 + fraction * (sample2 - sample1);
            const clamped = Math.max(-1, Math.min(1, interpolated));
            pcm16[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
          }

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(pcm16.buffer);
          } else if (ws.readyState === WebSocket.CONNECTING && queuedAudio.length < 100) {
            queuedAudio.push(pcm16.buffer);
          }
          if (endpointDetector.observe(rms, performance.now())) finalizeAfterSilence();
        };

        // Prefer AudioWorklet in modern browsers. Keep ScriptProcessor as a contained
        // fallback for older embedded Android WebViews so the working microphone path
        // remains available during the migration.
        if (audioCtx.audioWorklet) {
          const workletSource = `class P extends AudioWorkletProcessor { process(inputs) { const c = inputs[0]?.[0]; if (c) this.port.postMessage(c); return true; } } registerProcessor('asha-capture', P);`;
          const workletUrl = URL.createObjectURL(new Blob([workletSource], { type: 'application/javascript' }));
          try {
            await audioCtx.audioWorklet.addModule(workletUrl);
            URL.revokeObjectURL(workletUrl);
            const worklet = new AudioWorkletNode(audioCtx, 'asha-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
            worklet.port.onmessage = (event: MessageEvent<Float32Array>) => handleAudioFrame(new Float32Array(event.data));
            workletRef.current = worklet;
            source.connect(worklet);
            worklet.connect(audioCtx.destination);
          } catch {
            URL.revokeObjectURL(workletUrl);
          }
        }
        if (!workletRef.current) {
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          processor.onaudioprocess = (event) => handleAudioFrame(event.inputBuffer.getChannelData(0));
          source.connect(processor);
          processor.connect(audioCtx.destination);
        }

        connectionTimeoutRef.current = window.setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            setError({
              message: 'Gnani Prisma did not connect in time. Check the network and retry.',
              canRetry: true,
            });
            stopRecording();
          }
        }, 10000);
      } catch (err) {
        releaseAudioCapture();
        setError({
          message: err instanceof Error && err.name === 'NotAllowedError'
            ? 'Microphone permission was denied. Please allow microphone access in browser settings.'
            : `Microphone access error: ${err instanceof Error ? err.message : 'Unknown audio error'}`,
          canRetry: true,
        });
        setIsConnecting(false);
        setIsRecording(false);
        setIsFinalizing(false);
      }
    },
    [onTranscriptChunk, releaseAudioCapture, stopRecording]
  );

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    isConnecting,
    isFinalizing,
    audioLevel,
    noiseMode,
    error,
    clearError: () => setError(null),
    startRecording,
    stopRecording,
    setNoiseMode,
  };
}
