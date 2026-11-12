import React, { useState } from 'react';
import { X, Check, Clock, Sparkles, FileText, History, Delete } from 'lucide-react';
import { FieldEvidence, FieldState } from '../types';

interface EvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  fieldName: string;
  currentValue: any;
  unit?: string;
  state: FieldState;
  evidence?: FieldEvidence;
  onUpdateValue: (newVal: any) => void;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  isOpen,
  onClose,
  fieldName,
  currentValue,
  unit,
  state,
  evidence,
  onUpdateValue,
}) => {
  if (!isOpen) return null;

  const [inputVal, setInputVal] = useState<string>(
    currentValue !== null && currentValue !== undefined ? String(currentValue) : ''
  );

  const handleKeypadPress = (val: string) => {
    if (val === 'C') {
      setInputVal('');
    } else if (val === 'back') {
      setInputVal((prev) => prev.slice(0, -1));
    } else {
      setInputVal((prev) => prev + val);
    }
  };

  const handleSave = () => {
    const num = parseFloat(inputVal);
    if (!isNaN(num)) {
      onUpdateValue(num);
    } else {
      onUpdateValue(inputVal);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-teal-50/60">
          <div>
            <h3 className="text-base font-bold text-gray-900">{fieldName} - Evidence Trail</h3>
            <span className="text-xs text-gray-500 font-medium">
              Auditable clinical derivation trail & manual fix pad
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Evidence Details */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-600 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-teal-600" />
                Spoken Source Words:
              </span>
              <span className="font-mono bg-white px-2 py-0.5 rounded-sm border border-gray-200 font-bold text-gray-800">
                "{evidence?.sourceText || 'None'}"
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                Deriving Detector:
              </span>
              <span className="font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-sm border border-teal-200">
                {evidence?.detector || 'Rule Engine'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-600 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                Detection Timestamp:
              </span>
              <span className="text-gray-700 font-medium">
                {evidence?.timestamp || new Date().toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Revision History if value was corrected */}
          {evidence?.previousValues && evidence.previousValues.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs">
              <span className="font-bold text-amber-900 flex items-center gap-1 mb-1.5">
                <History className="w-3.5 h-3.5 text-amber-700" />
                Correction History (Never Silently Overwritten):
              </span>
              <ul className="space-y-1">
                {evidence.previousValues.map((h, i) => (
                  <li key={i} className="text-amber-800 flex justify-between">
                    <span>Old: <strong>{String(h.value)}</strong></span>
                    <span className="text-[10px] text-amber-600">{h.timestamp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Quick Keypad for Rapid One-Handed Numbers */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 block">
              Quick Number Keypad (Touch to Adjust):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                className="flex-1 p-2.5 rounded-xl border border-gray-300 text-lg font-bold text-center focus:outline-teal-600 bg-gray-50"
                placeholder="Enter value"
              />
              {unit && <span className="font-bold text-sm text-gray-600">{unit}</span>}
            </div>

            {/* Keypad Grid */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleKeypadPress(k)}
                  className="h-11 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-teal-100 text-base font-bold text-gray-800 transition flex items-center justify-center select-none"
                >
                  {k === 'back' ? <Delete className="w-5 h-5 text-gray-600" /> : k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-semibold rounded-xl text-gray-700 hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 text-sm font-bold rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition shadow-sm flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Confirm Value
          </button>
        </div>
      </div>
    </div>
  );
};
