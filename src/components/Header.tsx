import React from 'react';
import { Volume2, Download, Activity } from 'lucide-react';
import { LanguageCode, NoiseMode } from '../types';
import { LANGUAGE_CATALOG } from '../data/languageData';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface HeaderProps {
  currentLanguage: LanguageCode;
  onSelectLanguage: (lang: LanguageCode) => void;
  noiseMode: NoiseMode;
  audioLevel: number;
  showJudgeView: boolean;
  onToggleJudgeView: () => void;
  healthOk: boolean;
  healthMessage: string;
  onRetryHealth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentLanguage,
  onSelectLanguage,
  noiseMode,
  audioLevel,
  showJudgeView,
  onToggleJudgeView,
  healthOk,
  healthMessage,
  onRetryHealth,
}) => {
  const { isInstallable, install, isIOS } = usePWAInstall();
  const currentLangObj = LANGUAGE_CATALOG[currentLanguage] || LANGUAGE_CATALOG['en-IN'];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-teal-100 shadow-xs px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        {/* App Branding */}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-sm">
            <Activity className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <label className="sr-only" htmlFor="visit-language">Visit language</label>
              <select
                id="visit-language"
                value={currentLanguage}
                onChange={(event) => onSelectLanguage(event.target.value as LanguageCode)}
                className="max-w-[6.5rem] rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-semibold text-gray-800"
              >
                {Object.values(LANGUAGE_CATALOG).map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
                ))}
              </select>

              {healthOk && (
                <button
                  type="button"
                  onClick={onRetryHealth}
                  className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-700"
                  title={healthMessage}
                  aria-label={healthMessage}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="hidden sm:inline text-emerald-700">Voice ready</span>
                </button>
              )}

              <h1 className="truncate text-base sm:text-lg font-bold tracking-tight text-gray-900 leading-none">
                ASHA Vaani
              </h1>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-sm bg-teal-50 text-teal-700 border border-teal-200">
                v3.0
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium leading-tight">
              {currentLangObj.ui.app_title}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="w-full sm:w-auto flex items-center justify-end gap-1.5">
          {/* Noise Meter Pill */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border ${
              noiseMode === 'quiet'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : noiseMode === 'normal'
                ? 'bg-teal-50 border-teal-200 text-teal-800'
                : 'bg-amber-50 border-amber-300 text-amber-800 animate-pulse'
            }`}
            title={`Ambient Noise Level: ${audioLevel}%`}
          >
            <Volume2 className="w-3 h-3" />
            <span className="capitalize">{noiseMode}</span>
          </div>

          {/* Judge View Button */}
          <button
            onClick={onToggleJudgeView}
            className={`px-2 py-1 text-xs font-semibold rounded-md border transition ${
              showJudgeView
                ? 'bg-purple-600 text-white border-purple-700'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300'
            }`}
            title="Toggle Live Judge View"
          >
            Judge
          </button>

          {/* PWA Install Button if available */}
          {isInstallable && (
            <button
              onClick={install}
              className="p-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition"
              title="Install PWA"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
