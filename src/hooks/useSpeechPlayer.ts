import { useState, useRef, useCallback } from 'react';

export function useSpeechPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCaption, setCurrentCaption] = useState<string | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number>(0);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioStartTimeRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    currentUtteranceRef.current = null;
    setIsPlaying(false);
    setCurrentCaption(null);
  }, []);

  const speak = useCallback(
    (text: string, langCode: string = 'hi-IN', onComplete?: () => void) => {
      stop(); // Stop any currently playing audio immediately (barge-in guarantee)

      if (!window.speechSynthesis || !text) {
        if (onComplete) onComplete();
        return;
      }

      const startTime = performance.now();
      audioStartTimeRef.current = startTime;
      setCurrentCaption(text);
      setIsPlaying(true);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langCode;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        const elapsed = Math.round(performance.now() - startTime);
        setLastLatencyMs(elapsed);
      };

      utterance.onend = () => {
        setIsPlaying(false);
        setCurrentCaption(null);
        currentUtteranceRef.current = null;
        if (onComplete) onComplete();
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        setCurrentCaption(null);
        currentUtteranceRef.current = null;
        if (onComplete) onComplete();
      };

      currentUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [stop]
  );

  return {
    isPlaying,
    currentCaption,
    lastLatencyMs,
    speak,
    stop,
  };
}
