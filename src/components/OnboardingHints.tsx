import React, { useState } from 'react';
import { Lightbulb, X, CheckCircle, Volume2, ShieldAlert } from 'lucide-react';

export const OnboardingHints: React.FC = () => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    return localStorage.getItem('asha_hints_dismissed') === 'true';
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('asha_hints_dismissed', 'true');
  };

  return (
    <div className="p-3.5 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-2xl border border-teal-200 text-teal-950 shadow-2xs relative mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
          <Lightbulb className="w-4 h-4 text-amber-500 fill-amber-500" />
          Quick Tips for ASHA Di
        </span>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-full text-teal-700 hover:text-teal-950 hover:bg-teal-100 transition"
          title="Dismiss Hints"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-1.5 text-xs">
        <div className="flex items-start gap-2">
          <span className="font-bold text-teal-700">1.</span>
          <span>Speak naturally in Hindi, Kannada or English with medical terms ("TT injection", "ANC checkup", "dhai kilo").</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="font-bold text-teal-700">2.</span>
          <span>Danger signs are verified strictly via MoHFW rules. The agent immediately warns of emergencies.</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="font-bold text-teal-700">3.</span>
          <span>Tap any field card to inspect auditable source words or adjust numbers with the quick keypad.</span>
        </div>
      </div>
    </div>
  );
};
