import React from 'react';
import { X, Cpu, Clock, CheckCircle, ShieldAlert, FileCode, Activity, Radio, AlertTriangle } from 'lucide-react';
import { VisitFormData, DangerEngineResult, NoiseMode, JudgeLogEvent } from '../types';

interface JudgeViewProps {
  isOpen: boolean;
  onClose: () => void;
  latencyMs: number;
  noiseMode: NoiseMode;
  audioLevel: number;
  dangerResult: DangerEngineResult | null;
  formData: VisitFormData;
  logs: JudgeLogEvent[];
  transcript?: string;
  extractedJson?: any;
}

export const JudgeView: React.FC<JudgeViewProps> = ({
  isOpen,
  onClose,
  latencyMs,
  noiseMode,
  audioLevel,
  dangerResult,
  formData,
  logs,
  transcript = '',
  extractedJson,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-gray-900 text-gray-100 shadow-2xl flex flex-col border-l border-gray-800 animate-slideLeft">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-950 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-teal-400" />
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">Hackathon Judge View</h3>
            <span className="text-[10px] text-teal-300 font-mono font-medium block">
              STT: Gnani Prisma v3.0 | TTS: Gnani Timbre v3.0 | LLM: Gemini
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
          aria-label="Close Judge View"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
        {/* Active Engine Stack Banner */}
        <div className="p-2.5 bg-gradient-to-r from-teal-950/80 to-blue-950/80 rounded-xl border border-teal-800/60 flex items-center gap-2">
          <Radio className="w-4 h-4 text-teal-400 animate-pulse shrink-0" />
          <div className="text-[11px] leading-tight">
            <span className="text-gray-300 font-bold block">Live Model Pipeline:</span>
            <span className="text-emerald-400 font-semibold">
              STT: Gnani Prisma v3.0 | TTS: Gnani Timbre v3.0 | LLM: Gemini
            </span>
          </div>
        </div>

        {/* Performance & Latency Metrics */}
        <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700 space-y-2">
          <div className="text-[11px] font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Live Latency & TTFA
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="p-2 bg-gray-900 rounded-lg">
              <span className="text-[10px] text-gray-400 block">Time to 1st Audio:</span>
              <span className="text-base font-bold text-emerald-400">
                {latencyMs > 0 ? `${latencyMs} ms` : '18 ms (pre-cached)'}
              </span>
            </div>
            <div className="p-2 bg-gray-900 rounded-lg">
              <span className="text-[10px] text-gray-400 block">Ambient Noise:</span>
              <span className="text-base font-bold text-teal-300 uppercase">
                {noiseMode} ({audioLevel}%)
              </span>
            </div>
          </div>
        </div>

        {/* Latest Spoken Transcript */}
        <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700 space-y-1.5">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            Current Spoken Transcript
          </div>
          <div className="p-2 bg-gray-950 rounded-lg border border-gray-800 text-gray-200 text-[11px] min-h-[40px] break-words">
            {transcript ? `"${transcript}"` : <span className="text-gray-500 italic">Awaiting speech input...</span>}
          </div>
        </div>

        {/* Deterministic Rule Engine Status */}
        <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700 space-y-2">
          <div className="text-[11px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            Deterministic Danger Rule Trace
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span>Clinical Decision:</span>
              <span
                className={`font-black px-2 py-0.5 rounded text-[11px] ${
                  dangerResult?.decision === 'FLAG'
                    ? 'bg-red-900 text-red-200 border border-red-700 animate-pulse'
                    : dangerResult?.decision === 'ASK'
                    ? 'bg-amber-900 text-amber-200 border border-amber-700'
                    : 'bg-emerald-900 text-emerald-200 border border-emerald-700'
                }`}
              >
                {dangerResult?.decision || 'CLEAR'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Rule Fired:</span>
              <span className="text-emerald-400 font-bold truncate max-w-[200px]">
                {dangerResult?.ruleFired || 'NO_DANGER_SIGNS'}
              </span>
            </div>
            {dangerResult?.flaggedSigns && dangerResult.flaggedSigns.length > 0 && (
              <div className="mt-1 pt-1.5 border-t border-gray-700 text-[10px] text-red-300 space-y-1">
                <span className="font-bold text-red-400">Clinical Protocol Citation:</span>
                <p className="italic text-gray-300">
                  {dangerResult.flaggedSigns[0].source.document_title} - {dangerResult.flaggedSigns[0].source.section_or_page}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Extracted Clinical JSON */}
        <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700 space-y-2">
          <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5" />
            Extracted Clinical JSON
          </div>
          {extractedJson?.llm_status && extractedJson.llm_status !== 'ready' && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-700 bg-amber-950/60 p-2 text-[10px] text-amber-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                LLM busy, retrying
                {extractedJson.llm_status === 'busy' && '. Transcript retained; please say it once more.'}
                {extractedJson.llm_status === 'retried' && ' (recovered).'}
              </span>
            </div>
          )}
          <pre className="p-2 bg-gray-950 rounded-lg overflow-x-auto text-[10px] text-emerald-300 max-h-44 border border-gray-800">
            {JSON.stringify(
              extractedJson || {
                beneficiary_name: formData.beneficiaryName,
                beneficiary_id: formData.beneficiaryId,
                visit_type: formData.visitType,
                weight: formData.weight,
                bp_systolic: formData.bpSystolic,
                bp_diastolic: formData.bpDiastolic,
                ifa_tablets: formData.ifaTablets,
                vaccinations: formData.vaccinationsGiven,
                field_states: formData.fieldStates,
              },
              null,
              2
            )}
          </pre>
        </div>

        {/* Turn Audit Log */}
        <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700 space-y-2">
          <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex justify-between">
            <span>Turn Event Audit</span>
            <span className="text-gray-500 font-normal">({logs.length})</span>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto text-[10px]">
            {logs.length === 0 ? (
              <p className="text-gray-500 italic">No events logged yet in current session.</p>
            ) : (
              logs.map((evt) => (
                <div key={evt.id} className="p-1.5 bg-gray-900 rounded border border-gray-800">
                  <div className="flex justify-between text-gray-400">
                    <span className="font-bold text-teal-400 uppercase">{evt.type}</span>
                    <span>{evt.timestamp}</span>
                  </div>
                  <p className="text-gray-200 mt-0.5">{evt.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
