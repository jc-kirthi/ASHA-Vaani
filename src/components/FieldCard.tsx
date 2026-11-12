import React from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle, ChevronRight, Edit3 } from 'lucide-react';
import { FieldState, FieldEvidence } from '../types';

interface FieldCardProps {
  label: string;
  value: string | number | null;
  unit?: string;
  state: FieldState;
  evidence?: FieldEvidence;
  icon: React.ReactNode;
  onTap: () => void;
}

export const FieldCard: React.FC<FieldCardProps> = ({
  label,
  value,
  unit,
  state,
  evidence,
  icon,
  onTap,
}) => {
  const isConfirmed = state === 'confirmed';
  const isUncertain = state === 'uncertain';
  const isMissing = state === 'missing';

  return (
    <div
      onClick={onTap}
      role="button"
      tabIndex={0}
      className={`min-h-[56px] p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none active:scale-[0.98] ${
        isConfirmed
          ? 'bg-white border-emerald-200 hover:border-emerald-300 shadow-2xs'
          : isUncertain
          ? 'bg-amber-50/70 border-amber-300 hover:border-amber-400 shadow-xs'
          : 'bg-red-50/50 border-red-200 hover:border-red-300'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Field Icon */}
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            isConfirmed
              ? 'bg-emerald-50 text-emerald-700'
              : isUncertain
              ? 'bg-amber-100 text-amber-800'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {icon}
        </div>

        {/* Labels & Value */}
        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-tight block">
            {label}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span
              className={`text-base font-bold leading-tight ${
                isConfirmed
                  ? 'text-gray-900'
                  : isUncertain
                  ? 'text-amber-900 font-extrabold'
                  : 'text-red-700 font-medium italic'
              }`}
            >
              {value !== null && value !== undefined && value !== ''
                ? String(value)
                : 'Missing (Not recorded)'}
            </span>
            {unit && value !== null && (
              <span className="text-xs font-semibold text-gray-500">{unit}</span>
            )}
          </div>
        </div>
      </div>

      {/* State Badge & Chevron */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border capitalize ${
            isConfirmed
              ? 'bg-emerald-100/70 text-emerald-800 border-emerald-200'
              : isUncertain
              ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
              : 'bg-red-100 text-red-800 border-red-200'
          }`}
        >
          {isConfirmed && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
          {isUncertain && <AlertTriangle className="w-3 h-3 text-amber-600" />}
          {isMissing && <HelpCircle className="w-3 h-3 text-red-600" />}
          {state}
        </span>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
};
