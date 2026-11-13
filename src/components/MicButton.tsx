import React from 'react';
import { Mic, MicOff, Loader2, Volume2, AlertCircle, RefreshCw } from 'lucide-react';
import { MicState } from '../types';

interface MicButtonProps {
  micState: MicState;
  audioLevel: number;
  onToggleRecord: () => void;
  onRetry?: () => void;
  tapToSpeakLabel?: string;
  stopListeningLabel?: string;
  helperText?: string;
}

export const MicButton: React.FC<MicButtonProps> = ({
  micState,
  audioLevel,
  onToggleRecord,
  onRetry,
  tapToSpeakLabel = 'Tap to Speak',
  stopListeningLabel = 'Tap to Stop',
  helperText,
}) => {
  const isListening = micState === 'listening';
  const isThinking = micState === 'thinking';
  const isSpeaking = micState === 'speaking';
  const isConnecting = micState === 'connecting';
  const isError = micState === 'error';

  return (
    <div className="flex flex-col items-center justify-center my-3">
      <div className="relative flex items-center justify-center">
        {/* Animated Ripple Waves when Listening */}
        {isListening && (
          <>
            <span
              className="absolute w-24 h-24 rounded-full bg-teal-400 opacity-30 animate-ping"
              style={{ animationDuration: '1.4s' }}
            />
            <span
              className="absolute w-28 h-28 rounded-full bg-teal-300 opacity-20 animate-pulse"
              style={{ transform: `scale(${1 + audioLevel * 0.005})` }}
            />
          </>
        )}

        {/* Core Round Mic Button */}
        <button
          onClick={isError && onRetry ? onRetry : onToggleRecord}
          className={`relative z-10 w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all duration-200 shadow-lg active:scale-95 focus:outline-hidden ${
            isError
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-200'
              : isListening
              ? 'bg-red-600 text-white shadow-red-200 ring-4 ring-red-100 animate-pulse'
              : isThinking
              ? 'bg-amber-500 text-white shadow-amber-200'
              : isSpeaking
              ? 'bg-teal-700 text-white shadow-teal-200 ring-4 ring-teal-200'
              : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-200'
          }`}
          aria-label={isListening ? stopListeningLabel : tapToSpeakLabel}
        >
          {isConnecting && <Loader2 className="w-8 h-8 animate-spin" />}
          {isListening && <Mic className="w-9 h-9" />}
          {isThinking && <Loader2 className="w-8 h-8 animate-spin" />}
          {isSpeaking && <Volume2 className="w-9 h-9 animate-bounce" />}
          {isError && <RefreshCw className="w-8 h-8" />}
          {!isConnecting && !isListening && !isThinking && !isSpeaking && !isError && (
            <Mic className="w-9 h-9" />
          )}
        </button>
      </div>

      {/* Button Status Text */}
      <div className="mt-2.5 text-center">
        <p className="text-sm font-bold text-gray-800">
          {isListening
            ? 'Listening — pause to analyze automatically'
            : isThinking
            ? 'Analyzing speech...'
            : isSpeaking
            ? 'Agent speaking (tap to interrupt)'
            : isConnecting
            ? 'Connecting audio...'
            : isError
            ? 'Error! Tap to retry'
            : tapToSpeakLabel}
        </p>
        <p className="text-xs text-gray-500 font-medium">
          {helperText || (isListening
            ? 'Speech is analyzed after a pause. Tap to stop early.'
            : isSpeaking
            ? 'Barge-in active: speak anytime to interrupt'
            : 'Tap button to start recording home visit')}
        </p>
      </div>
    </div>
  );
};
