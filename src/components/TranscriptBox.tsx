import React from 'react';
import { Volume2, Sparkles, MessageSquare } from 'lucide-react';

interface TranscriptBoxProps {
  transcript: string;
  isListening: boolean;
  agentCaption: string | null;
}

export const TranscriptBox: React.FC<TranscriptBoxProps> = ({
  transcript,
  isListening,
  agentCaption,
}) => {
  // Highlight latest words
  const words = transcript ? transcript.trim().split(/\s+/) : [];
  const previousWords = words.slice(0, -3).join(' ');
  const latestWords = words.slice(-3).join(' ');

  return (
    <div className="w-full space-y-2">
      {/* Agent Spoken Caption */}
      {agentCaption && (
        <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-950 text-sm flex items-start gap-2.5 shadow-2xs animate-fadeIn">
          <div className="p-1 rounded-md bg-teal-600 text-white shrink-0 mt-0.5">
            <Volume2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-teal-700 block mb-0.5">
              ASHA Vaani Spoken Audio
            </span>
            <p className="font-semibold leading-snug">{agentCaption}</p>
          </div>
        </div>
      )}

      {/* Live Worker Speech Transcript */}
      <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 min-h-[72px] flex flex-col justify-between">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
            Live Spoken Transcript
          </span>
          {isListening && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
              Live Stream
            </span>
          )}
        </div>

        <div className="text-sm font-medium text-gray-800 leading-relaxed">
          {transcript ? (
            <p>
              <span>{previousWords} </span>
              <span className="font-bold text-teal-800 bg-teal-100/70 px-1 py-0.5 rounded-sm">
                {latestWords}
              </span>
            </p>
          ) : (
            <p className="text-gray-400 italic">
              Spoken words will stream live here (e.g. "Sita Devi ka ANC visit hai, weight 55 kilo hai, BP 120 by 80...")
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
