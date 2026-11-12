import React from 'react';
import { Mic, CheckCircle2, ShieldCheck, BookmarkCheck } from 'lucide-react';
import { StepState } from '../types';

interface StepTrackerProps {
  currentStep: StepState;
}

const STEPS: Array<{ key: StepState; label: string; icon: React.FC<{ className?: string }> }> = [
  { key: 'listening', label: 'Listening', icon: Mic },
  { key: 'checking', label: 'Checking', icon: ShieldCheck },
  { key: 'confirm', label: 'Confirm', icon: CheckCircle2 },
  { key: 'saved', label: 'Saved', icon: BookmarkCheck },
];

export const StepTracker: React.FC<StepTrackerProps> = ({ currentStep }) => {
  const getStepIndex = (s: StepState) => {
    switch (s) {
      case 'listening': return 0;
      case 'checking': return 1;
      case 'confirm': return 2;
      case 'saved': return 3;
      default: return 0;
    }
  };

  const activeIdx = getStepIndex(currentStep);

  return (
    <div className="w-full bg-white border border-gray-100 rounded-xl p-2.5 shadow-2xs">
      <div className="flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isCurrent = idx === activeIdx;
          const isDone = idx < activeIdx;

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                    isCurrent
                      ? 'bg-teal-600 text-white ring-4 ring-teal-100'
                      : isDone
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span
                  className={`mt-1 text-[11px] font-semibold tracking-tight ${
                    isCurrent
                      ? 'text-teal-700'
                      : isDone
                      ? 'text-emerald-700'
                      : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 rounded-full transition ${
                    idx < activeIdx ? 'bg-emerald-400' : 'bg-gray-200'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
