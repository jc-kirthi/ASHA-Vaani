import React from 'react';
import { Calendar, CheckSquare, PlusCircle, ArrowRight, ShieldCheck, HeartHandshake } from 'lucide-react';
import { FollowupItem } from '../types';

interface FollowupSummaryProps {
  beneficiaryName: string;
  beneficiaryId: string;
  followups: FollowupItem[];
  onNextBeneficiary: () => void;
  onViewRecords: () => void;
}

export const FollowupSummary: React.FC<FollowupSummaryProps> = ({
  beneficiaryName,
  beneficiaryId,
  followups,
  onNextBeneficiary,
  onViewRecords,
}) => {
  return (
    <div className="w-full bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 shadow-sm space-y-4 animate-fadeIn my-3">
      {/* Success Banner */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-emerald-950">
            Visit Record Saved Encrypted!
          </h3>
          <p className="text-xs text-emerald-700 font-medium">
            Beneficiary: {beneficiaryName} ({beneficiaryId})
          </p>
        </div>
      </div>

      {/* Follow-up Checklist */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-emerald-900 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
            Spoken Follow-up Checklist
          </span>
          <span className="text-[10px] text-emerald-700 font-normal">
            Protocol date arithmetic
          </span>
        </div>

        <div className="space-y-2">
          {followups.map((item, idx) => (
            <div
              key={idx}
              className="p-3 bg-white rounded-xl border border-emerald-100 shadow-2xs flex items-start gap-2.5"
            >
              <div className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900">{item.item}</span>
                  <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-emerald-600" />
                    {item.dueDate}
                  </span>
                </div>
                <p className="text-xs text-gray-600 font-medium mt-0.5">{item.focus}</p>
                <span className="text-[10px] text-gray-400 block mt-1 italic">
                  Source: {item.source}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-2 flex flex-col sm:flex-row gap-2">
        <button
          onClick={onNextBeneficiary}
          className="flex-1 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Next Beneficiary
        </button>

        <button
          onClick={onViewRecords}
          className="py-3 px-4 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold text-sm flex items-center justify-center gap-1.5 transition"
        >
          View Register
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
