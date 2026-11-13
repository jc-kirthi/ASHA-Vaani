import React from 'react';
import { Users, Home, MapPin, Check } from 'lucide-react';
import { BeneficiaryRecord } from '../types';

interface DisambiguationModalProps {
  isOpen: boolean;
  promptText: string;
  candidates: BeneficiaryRecord[];
  onSelectCandidate: (candidate: BeneficiaryRecord) => void;
  onCancel: () => void;
}

export const DisambiguationModal: React.FC<DisambiguationModalProps> = ({
  isOpen,
  promptText,
  candidates,
  onSelectCandidate,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden p-4 space-y-4">
        <div className="flex items-center gap-2.5 text-teal-800">
          <div className="p-2 rounded-xl bg-teal-100 text-teal-700">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Duplicate Name Found</h3>
            <p className="text-xs text-gray-500 font-medium">
              Patient Roster Disambiguation
            </p>
          </div>
        </div>

        {/* Spoken Question Prompt */}
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-teal-950 font-semibold text-sm">
          "{promptText}"
        </div>

        {/* Candidate Choices */}
        <div className="space-y-2">
          {candidates.map((cand) => (
            <button
              key={cand.id}
              onClick={() => onSelectCandidate(cand)}
              className="w-full p-3 rounded-xl border border-gray-200 hover:border-teal-400 hover:bg-teal-50/50 transition text-left flex items-center justify-between group active:scale-[0.98]"
            >
              <div>
                <span className="font-bold text-gray-900 block text-sm group-hover:text-teal-800">
                  {cand.name}
                </span>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                  <span className="flex items-center gap-1 font-semibold text-teal-700 bg-teal-100/60 px-1.5 py-0.5 rounded-sm">
                    <Home className="w-3 h-3" />
                    House {cand.house_no}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-gray-400" />
                    {cand.village}
                  </span>
                  <span className="font-medium text-gray-600">
                    {cand.category} ({cand.category === 'ANC' ? `Trimester ${cand.trimester}` : `Infant Day ${cand.child_age_days}`})
                  </span>
                </div>
              </div>

              <div className="w-8 h-8 rounded-full bg-gray-100 group-hover:bg-teal-600 group-hover:text-white flex items-center justify-center transition text-gray-400">
                <Check className="w-4 h-4" />
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 text-center"
        >
          Cancel & Enter ID Manually
        </button>
      </div>
    </div>
  );
};
