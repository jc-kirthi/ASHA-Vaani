import { useState, useRef, useEffect, useCallback } from 'react';
import { NoiseMode } from '../types';

export function useAudioRecorder(onTranscriptChunk?: (text: string, isFinal: boolean) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [noiseMode, setNoiseMode] = useState<NoiseMode>('normal');
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  const startRecording = useCallback(
    async (langCode: string = 'hi-IN') => {
      try {
        setError(null);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        // Monitor ambient RMS noise
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          const normalized = Math.min(100, Math.round((average / 128) * 100));
          setAudioLevel(normalized);

          // Update noise mode based on ambient level
          if (normalized < 15) {
            setNoiseMode('quiet');
          } else if (normalized < 45) {
            setNoiseMode('normal');
          } else {
            setNoiseMode('noisy');
          }

          animationFrameRef.current = requestAnimationFrame(updateMeter);
        };
        updateMeter();

        // Browser SpeechRecognition fallback / live capture
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          const recognition = new SpeechRec();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = langCode;

          recognition.onresult = (event: any) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }

            if (finalTranscript && onTranscriptChunk) {
              onTranscriptChunk(finalTranscript, true);
            } else if (interimTranscript && onTranscriptChunk) {
              onTranscriptChunk(interimTranscript, false);
            }
          };

          recognition.onerror = (e: any) => {
            // Ignore no-speech or aborted errors
            if (e.error !== 'no-speech' && e.error !== 'aborted') {
              console.warn('Speech recognition warning:', e.error);
            }
          };

          try {
            recognition.start();
            recognitionRef.current = recognition;
          } catch (e) {
            // Already started
          }
        }

        setIsRecording(true);
      } catch (err: any) {
        console.error('Audio recorder error:', err);
        setError('Microphone access denied or unavailable.');
        setIsRecording(false);
      }
    },
    [onTranscriptChunk]
  );

  const stopRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setAudioLevel(0);
  }, []);

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
    startRecording,
    stopRecording,
    setNoiseMode,
  };
}
