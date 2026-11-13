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

function decodeBase64(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function useSpeechPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCaption, setCurrentCaption] = useState<string | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number>(0);
  const [error, setError] = useState<TTSErrorState | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const generationRef = useRef(0);
  const lastRequestRef = useRef<SpeechRequest | null>(null);
  const playbackTailRef = useRef(0);

  const stop = useCallback(() => {
    generationRef.current += 1;
    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
      socketRef.current.close(1000, 'Playback interrupted');
    }
    socketRef.current = null;
    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    });
    sourcesRef.current.clear();
    playbackTailRef.current = 0;
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
      stop();
      setError(null);
      if (!text.trim()) {
        onComplete?.();
        return;
      }

      lastRequestRef.current = { text, langCode, voiceName, onComplete };
      setCurrentCaption(text);
      setIsPlaying(true);
      const generation = generationRef.current;
      const startedAt = performance.now();
      const chunks: Uint8Array[] = [];
      let firstAudioAt: number | null = null;
      let finalReceived = false;
      let finishScheduled = false;
      let failed = false;
      let playbackVersion = 0;
      let decodedChunkCount = 0;
      let decodeFailed = false;
      let decodeQueue = Promise.resolve();

      try {
        const AudioCtxClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtxClass) throw new Error('Web Audio is not available in this browser.');
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioCtxClass();
        }
        const audioContext = audioContextRef.current;
        if (audioContext.state === 'suspended') void audioContext.resume();

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${window.location.host}/ws/tts`);
        socketRef.current = socket;

        const fail = (message: string) => {
          if (failed || generation !== generationRef.current) return;
          failed = true;
          setIsPlaying(false);
          setCurrentCaption(null);
          setError({ message, canRetry: true });
          if (socket.readyState < WebSocket.CLOSING) socket.close();
        };

        const scheduleBuffer = (buffer: AudioBuffer) => {
          if (generation !== generationRef.current) return;
          const source = audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContext.destination);
          const startAt = Math.max(audioContext.currentTime + 0.02, playbackTailRef.current);
          playbackTailRef.current = startAt + buffer.duration;
          const version = playbackVersion;
          sourcesRef.current.add(source);
          source.onended = () => {
            sourcesRef.current.delete(source);
            source.disconnect();
            if (
              finalReceived &&
              sourcesRef.current.size === 0 &&
              generation === generationRef.current &&
              version === playbackVersion
            ) {
              setIsPlaying(false);
              setCurrentCaption(null);
              socketRef.current = null;
              onComplete?.();
            }
          };
          source.start(startAt);
        };

        const playCompleteAudio = async () => {
          if (!chunks.length) throw new Error('No audio returned by Gnani Timbre v3.0.');
          const totalBytes = chunks.reduce((total, chunk) => total + chunk.length, 0);
          const completeAudio = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            completeAudio.set(chunk, offset);
            offset += chunk.length;
          }
          const buffer = await audioContext.decodeAudioData(toArrayBuffer(completeAudio));
          scheduleBuffer(buffer);
        };

        socket.onopen = () => {
          if (generation !== generationRef.current) return;
          socket.send(JSON.stringify({
            text,
            voice: voiceName,
            lang: langCode,
            speed: 1.0,
          }));
        };

        socket.onmessage = (event) => {
          if (generation !== generationRef.current || failed) return;
          try {
            const data = JSON.parse(String(event.data)) as {
              type?: string;
              message?: string;
              audioBase64?: string;
              isFinal?: boolean;
              timeToFirstAudioMs?: number;
            };
            if (data.type === 'error') {
              fail(data.message || 'Gnani Timbre v3.0 synthesis failed.');
              return;
            }
            if (data.type === 'complete') finalReceived = true;
            if (data.audioBase64) {
              const audioChunk = decodeBase64(data.audioBase64);
              chunks.push(audioChunk);
              if (firstAudioAt === null) {
                firstAudioAt = performance.now();
                setLastLatencyMs(data.timeToFirstAudioMs || Math.round(firstAudioAt - startedAt));
              }
              decodeQueue = decodeQueue.then(async () => {
                if (generation !== generationRef.current || decodeFailed) return;
                try {
                  const buffer = await audioContext.decodeAudioData(toArrayBuffer(audioChunk));
                  decodedChunkCount += 1;
                  scheduleBuffer(buffer);
                } catch {
                  decodeFailed = true;
                }
              });
            }
            if (data.isFinal) finalReceived = true;
            if (finalReceived && !finishScheduled) {
              finishScheduled = true;
              void decodeQueue.then(async () => {
                if (generation !== generationRef.current || failed) return;
                socket.close(1000, 'Synthesis complete');
                if (decodeFailed && decodedChunkCount > 0) {
                  playbackVersion += 1;
                  sourcesRef.current.forEach((source) => {
                    try {
                      source.stop();
                      source.disconnect();
                    } catch {}
                  });
                  sourcesRef.current.clear();
                  playbackTailRef.current = 0;
                }
                if (decodeFailed || decodedChunkCount === 0) {
                  try {
                    await playCompleteAudio();
                  } catch (audioError) {
                    fail(audioError instanceof Error ? audioError.message : 'Gnani audio could not be played.');
                  }
                } else if (sourcesRef.current.size === 0) {
                  setIsPlaying(false);
                  setCurrentCaption(null);
                  socketRef.current = null;
                  onComplete?.();
                }
              });
            }
          } catch (messageError) {
            fail(messageError instanceof Error ? messageError.message : 'Invalid response from Gnani Timbre v3.0.');
          }
        };

        socket.onerror = () => fail('Gnani Timbre v3.0 connection failed. Check the server and credentials.');
        socket.onclose = (event) => {
          if (!finalReceived && !failed && generation === generationRef.current) {
            fail(`Gnani Timbre v3.0 closed unexpectedly (${event.code}). Please retry.`);
          }
        };
      } catch (speechError) {
        if (generation !== generationRef.current) return;
        setIsPlaying(false);
        setCurrentCaption(null);
        setError({
          message: `Gnani Timbre v3.0 TTS failed: ${speechError instanceof Error ? speechError.message : 'Unknown audio error'}`,
          canRetry: true,
        });
      }
    },
    [stop]
  );

  const retry = useCallback(() => {
    const request = lastRequestRef.current;
    if (request) void speak(request.text, request.langCode, request.voiceName, request.onComplete);
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
