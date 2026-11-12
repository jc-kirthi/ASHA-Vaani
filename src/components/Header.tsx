import React from 'react';
import { Volume2, ShieldAlert, Sparkles, Download, Activity, PlayCircle } from 'lucide-react';
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
  onOpenDemoScenarios: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentLanguage,
  onSelectLanguage,
  noiseMode,
  audioLevel,
  showJudgeView,
  onToggleJudgeView,
  onOpenDemoScenarios,
}) => {
  const { isInstallable, install, isIOS } = usePWAInstall();
  const currentLangObj = LANGUAGE_CATALOG[currentLanguage] || LANGUAGE_CATALOG['hi-IN'];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-teal-100 shadow-xs px-4 py-2.5">
      <div className="max-w-md mx-auto flex items-center justify-between gap-2">
        {/* App Branding */}
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-sm">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-bold tracking-tight text-gray-900 leading-none">
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
        <div className="flex items-center gap-1.5">
          {/* Quick Demo Scenarios Button */}
          <button
            onClick={onOpenDemoScenarios}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition"
            title="Try Demo Scenarios"
          >
            <PlayCircle className="w-3.5 h-3.5 text-teal-600" />
            <span className="hidden sm:inline">Demos</span>
          </button>

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
