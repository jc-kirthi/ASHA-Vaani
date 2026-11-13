import React, { useState } from 'react';
import { AlertOctagon, Copy, Check, ExternalLink, ArrowRight } from 'lucide-react';
import { DangerSignAlert } from '../types';

interface DangerBannerProps {
  flaggedSigns: DangerSignAlert[];
  referralSlip?: string | null;
  onDismiss?: () => void;
}

export const DangerBanner: React.FC<DangerBannerProps> = ({
  flaggedSigns,
  referralSlip,
}) => {
  const [copied, setCopied] = useState(false);

  if (!flaggedSigns || flaggedSigns.length === 0) return null;

  const handleCopy = () => {
    if (referralSlip) {
      navigator.clipboard.writeText(referralSlip);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="w-full bg-red-600 text-white rounded-2xl p-4 shadow-lg border-2 border-red-700 animate-pulse my-3">
      {/* Alert Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-white/20 shrink-0 mt-0.5">
          <AlertOctagon className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-widest bg-white/25 px-2 py-0.5 rounded-sm">
              Obstetric Danger Sign
            </span>
            <span className="text-xs font-bold text-red-100">
              Independent symptom check
            </span>
          </div>

          <h2 className="text-xl font-black mt-1 leading-tight tracking-tight">
            {flaggedSigns.map((s) => s.name).join(', ')}
          </h2>

          <p className="text-sm font-bold text-red-100 mt-1 flex items-center gap-1.5">
            <ArrowRight className="w-4 h-4 shrink-0" />
            Refer to PHC now. This tool does not replace emergency care.
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-white/20 text-[11px] text-red-100">
        Clinical reference metadata is unverified and is not presented as a citation.
      </div>

      {/* Factual Referral Slip Box */}
      {referralSlip && (
        <div className="mt-3 p-2.5 bg-red-950/40 rounded-xl border border-red-400/40 text-xs text-red-50 font-mono">
          <div className="flex items-center justify-between mb-1.5 font-sans">
            <span className="font-bold text-[11px] uppercase tracking-wider text-red-200">
              One-Line Referral Slip (Facts Only, No Medical Advice)
            </span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white text-red-800 font-bold hover:bg-red-50 active:scale-95 transition text-[11px]"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied Slip!' : 'Copy Referral Slip'}
            </button>
          </div>
          <p className="break-all select-all leading-relaxed text-[11px]">
            {referralSlip}
          </p>
        </div>
      )}
    </div>
  );
};
