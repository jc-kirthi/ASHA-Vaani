import React, { useState } from 'react';
import { Globe2, Mic2, Type, Cpu, Trash2, ShieldCheck, Check, AlertTriangle, Radio } from 'lucide-react';
import { LanguageCode } from '../types';
import { LANGUAGE_CATALOG } from '../data/languageData';

interface SettingsScreenProps {
  currentLanguage: LanguageCode;
  onSelectLanguage: (lang: LanguageCode) => void;
  selectedVoice: string;
  onSelectVoice: (voice: string) => void;
  textSize: 'normal' | 'large' | 'xl';
  onSelectTextSize: (size: 'normal' | 'large' | 'xl') => void;
  showJudgeView: boolean;
  onToggleJudgeView: () => void;
  onPurgeData: () => Promise<boolean>;
}

const STOCK_VOICES = [
  { id: 'Chetana', gender: 'Female', persona: 'Gentle, empathetic (Healthcare)' },
  { id: 'Shivani', gender: 'Female', persona: 'Warm, patient' },
  { id: 'Lakshmi', gender: 'Female', persona: 'Expressive, energetic' },
  { id: 'Kalpana', gender: 'Female', persona: 'Composed, caring' },
  { id: 'Avinash', gender: 'Male', persona: 'Professional, firm' },
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  currentLanguage,
  onSelectLanguage,
  selectedVoice,
  onSelectVoice,
  textSize,
  onSelectTextSize,
  showJudgeView,
  onToggleJudgeView,
  onPurgeData,
}) => {
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeDone, setPurgeDone] = useState(false);
  const [purging, setPurging] = useState(false);

  const handleConfirmPurge = async () => {
    setPurging(true);
    setPurgeDone(false);
    try {
      if (!await onPurgeData()) return;
      setShowPurgeConfirm(false);
      setPurgeDone(true);
      setTimeout(() => setPurgeDone(false), 3000);
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-4 pb-20 text-gray-800">
      {/* Model & Voice Pipeline Card */}
      <div className="p-4 bg-white rounded-2xl border border-teal-200 shadow-2xs space-y-2">
        <div className="flex items-center gap-2 text-teal-800 font-bold text-sm">
          <Radio className="w-5 h-5 text-teal-600 animate-pulse" />
          <span>Active Pipeline Architecture</span>
        </div>
        <div className="p-2.5 bg-teal-50/70 rounded-xl text-xs space-y-1 text-teal-950">
          <div><span className="font-bold">STT:</span> Gnani Prisma v3.0 (streaming audio)</div>
          <div><span className="font-bold">TTS:</span> Gnani Timbre v3.0 (WebSocket audio chunks)</div>
          <div><span className="font-bold">Extractor:</span> Gemini → Groq → deterministic rules</div>
          <div><span className="font-bold">Safety:</span> Independent danger-sign rules; references unverified</div>
        </div>
      </div>

      {/* Language Selector Section */}
      <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-teal-800">
          <Globe2 className="w-5 h-5 text-teal-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">Spoken Language</h3>
            <p className="text-xs text-gray-500">
              Prisma v3.0 STT & Timbre v3.0 TTS language routing
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          {Object.values(LANGUAGE_CATALOG).map((lang) => {
            const isSelected = currentLanguage === lang.code;

            return (
              <button
                key={lang.code}
                onClick={() => onSelectLanguage(lang.code as LanguageCode)}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                  isSelected
                    ? 'bg-teal-50 border-teal-500 text-teal-900 ring-2 ring-teal-100 font-bold'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold leading-tight">{lang.nativeName}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] text-gray-500 font-medium">{lang.name}</span>
                  {lang.isFullyTested ? (
                    <span className="text-[9px] px-1 rounded-sm bg-emerald-100 text-emerald-800 font-bold">
                      Full
                    </span>
                  ) : (
                    <span className="text-[9px] px-1 rounded-sm bg-amber-100 text-amber-800 font-bold">
                      Strict
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timbre Stock Voice Choice */}
      <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-teal-800">
          <Mic2 className="w-5 h-5 text-teal-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">Timbre v3.0 Stock Voice</h3>
            <p className="text-xs text-gray-500">Choose the voice used for generated speech responses.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          {STOCK_VOICES.map((v) => (
            <div
              key={v.id}
              onClick={() => onSelectVoice(v.id)}
              className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                selectedVoice === v.id
                  ? 'bg-teal-50 border-teal-500 font-bold text-teal-950 ring-2 ring-teal-100'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700'
              }`}
            >
              <div>
                <span className="text-xs font-bold block">{v.id} ({v.gender})</span>
                <span className="text-[11px] text-gray-500">{v.persona}</span>
              </div>
              {selectedVoice === v.id && <Check className="w-4 h-4 text-teal-600" />}
            </div>
          ))}
        </div>
      </div>

      {/* Font Size Selector */}
      <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-teal-800">
          <Type className="w-5 h-5 text-teal-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">Text Size (High Contrast)</h3>
            <p className="text-xs text-gray-500">Optimized for low-end mobile screens in sunlight</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(['normal', 'large', 'xl'] as const).map((sz) => (
            <button
              key={sz}
              onClick={() => onSelectTextSize(sz)}
              className={`py-2 px-3 rounded-xl border text-xs font-bold capitalize transition text-center ${
                textSize === sz
                  ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>

      {/* Judge View Setting */}
      <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-2xs flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Judge View Diagnostic Overlay</h3>
            <p className="text-xs text-gray-500">Live latency ms, rule source citations, and JSON</p>
          </div>
        </div>

        <button
          onClick={onToggleJudgeView}
          className={`w-12 h-6 rounded-full transition relative shrink-0 ${
            showJudgeView ? 'bg-purple-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition transform ${
              showJudgeView ? 'left-7' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* Register data deletion */}
      <div className="p-4 bg-red-50/70 border border-red-200 rounded-2xl space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-red-100 text-red-700 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-950">Delete Register Data</h3>
            <p className="text-xs text-red-800 leading-snug">
              Permanently deletes all saved beneficiaries and visit records from this server. This cannot be undone.
            </p>
          </div>
        </div>

        {purgeDone && (
          <div className="p-2.5 bg-emerald-100 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-700" />
            Saved beneficiaries and visit records were deleted from the server.
          </div>
        )}

        {!showPurgeConfirm ? (
          <button
            onClick={() => setShowPurgeConfirm(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-white border border-red-300 text-red-700 font-bold text-xs hover:bg-red-100 transition flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            Purge All Register Data & Transcripts
          </button>
        ) : (
          <div className="p-3 bg-white rounded-xl border border-red-300 space-y-2">
            <p className="text-xs font-bold text-red-900 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Confirm permanent data purge?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmPurge}
                disabled={purging}
                className="flex-1 py-1.5 rounded-lg bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition"
              >
                {purging ? 'Deleting…' : 'Delete now'}
              </button>
              <button
                onClick={() => setShowPurgeConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 font-semibold text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
