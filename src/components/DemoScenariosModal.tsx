import React from 'react';
import { X, Play, ShieldAlert, CheckCircle2, VolumeX, AlertTriangle, Users, Globe2, HelpCircle } from 'lucide-react';

export interface DemoScenario {
  id: string;
  tag: string;
  title: string;
  description: string;
  spokenText: string;
  language: string;
  expectedOutcome: string;
  icon: React.ReactNode;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'noisy-note',
    tag: '(a) Ambient Noise',
    title: 'Noisy Home Visit Note',
    description: 'Dictate ANC visit under household background noise. VAD filters noise, live transcript highlights words.',
    spokenText: 'Sita Devi ka ANC visit hai, BP 120 by 80 aur weight 55 kilo hai, bleeding nahi hai',
    language: 'hi-IN',
    expectedOutcome: 'Normal status, noise mode detected, confirmed BP and weight.',
    icon: <Play className="w-4 h-4 text-teal-600" />,
  },
  {
    id: 'negated-symptom',
    tag: '(b) Negation',
    title: 'Negated Symptom (No False Alarm)',
    description: 'Worker mentions past bleeding that has stopped ("pehle thi, ab nahi"). Deterministic engine evaluates temporal transition.',
    spokenText: 'Pooja Singh ko pehle bleeding thi ab nahi hai, sab normal hai',
    language: 'hi-IN',
    expectedOutcome: 'CLEAR (no emergency referral, past episode resolved).',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  },
  {
    id: 'danger-sign',
    tag: '(c) Real Danger',
    title: 'Obstetric Emergency (Immediate Referral)',
    description: 'Active severe bleeding during pregnancy. Triggers full-width RED banner and factual referral slip.',
    spokenText: 'Sunita Sharma ko subah se tez bukhar hai aur bleeding ho rahi hai',
    language: 'hi-IN',
    expectedOutcome: 'FLAG: Emergency PHC referral line plays, referral slip generated with Copy button.',
    icon: <ShieldAlert className="w-4 h-4 text-red-600" />,
  },
  {
    id: 'weight-correction',
    tag: '(d) Voice Correction',
    title: 'Weight Correction During Read-Back',
    description: 'ASHA corrects weight by voice ("nahi nahi, do aath kilo hai"). Normalizer updates to 2.80 kg and logs history.',
    spokenText: 'Nahi nahi, vajan 2.5 nahi do aath kilo hai',
    language: 'hi-IN',
    expectedOutcome: 'Weight updated to 2.80 kg. Evidence trail stores correction history.',
    icon: <Play className="w-4 h-4 text-teal-600" />,
  },
  {
    id: 'barge-in',
    tag: '(e) Barge-In',
    title: 'Instant Barge-In Interruption',
    description: 'Interrupt the agent mid-sentence while audio is playing. Audio cuts out instantly (<50ms).',
    spokenText: 'Ruko didi, mujhe ek aur baat batani hai',
    language: 'hi-IN',
    expectedOutcome: 'Immediate audio cancellation, switches from speaking to listening.',
    icon: <VolumeX className="w-4 h-4 text-purple-600" />,
  },
  {
    id: 'missing-field',
    tag: '(f) Missing Field',
    title: 'Missing Field (Targeted Question)',
    description: 'ASHA speaks visit details but leaves out weight. Agent asks targeted short question.',
    spokenText: 'Sita Devi ka visit kiya, BP 120 by 80 hai aur bleeding bilkul nahi hai',
    language: 'hi-IN',
    expectedOutcome: 'Weight card marked red Missing. Agent asks: "कृपया लाभार्थी का वजन बताइए।"',
    icon: <HelpCircle className="w-4 h-4 text-amber-600" />,
  },
  {
    id: 'confusable-number',
    tag: '(g) Confusable Guard',
    title: 'Sound-Alike Number Guard (Saat vs Saath)',
    description: 'Spoken word "saat" (7) sounds like "saath" (60). Normalizer flags uncertainty and reads back digit-by-digit.',
    spokenText: 'Vajan saat kilo bataya, shishu do hafte ka hai',
    language: 'hi-IN',
    expectedOutcome: 'Field state Uncertain. Agent prompts: "सात (7) या साठ (60)?"',
    icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
  },
  {
    id: 'duplicate-roster',
    tag: '(h) Duplicate Name',
    title: 'Beneficiary Name Disambiguation',
    description: 'Two beneficiaries in Rampur named "Sita Devi". Agent prompts house number disambiguation.',
    spokenText: 'Sita Devi se mile Rampur mein',
    language: 'hi-IN',
    expectedOutcome: 'Modal prompts: "सीता देवी - मकान नंबर 12 या मकान नंबर 40?"',
    icon: <Users className="w-4 h-4 text-blue-600" />,
  },
  {
    id: 'language-switch',
    tag: '(i) Mid-Demo Switch',
    title: 'Kannada Obstetric Visit',
    description: 'Switch to Kannada mid-session. Evaluates Kannada vernacular notes with Timbre v3.0 prompts.',
    spokenText: 'Maguvige tumba jwara ide mathu haalu kudiyuttilla',
    language: 'kn-IN',
    expectedOutcome: 'Kannada UI and speech. Flags newborn not feeding and refers to PHC in Kannada.',
    icon: <Globe2 className="w-4 h-4 text-teal-600" />,
  },
];

interface DemoScenariosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunScenario: (scenario: DemoScenario) => void;
}

export const DemoScenariosModal: React.FC<DemoScenariosModalProps> = ({
  isOpen,
  onClose,
  onRunScenario,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 bg-teal-600 text-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold leading-tight">Hackathon Judging Demo Scenarios</h3>
            <p className="text-xs text-teal-100 font-medium">
              1-Tap test execution for all 9 evaluation scenarios from the brief
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-teal-100 hover:text-white hover:bg-teal-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="p-3 overflow-y-auto space-y-2">
          {DEMO_SCENARIOS.map((sc) => (
            <div
              key={sc.id}
              onClick={() => {
                onRunScenario(sc);
                onClose();
              }}
              role="button"
              className="p-3 rounded-xl border border-gray-200 hover:border-teal-500 hover:bg-teal-50/40 transition cursor-pointer group active:scale-[0.99] flex items-start gap-3"
            >
              <div className="p-2 rounded-lg bg-gray-100 group-hover:bg-teal-100 transition mt-0.5 shrink-0">
                {sc.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-gray-100 group-hover:bg-teal-100 text-gray-700 group-hover:text-teal-900">
                    {sc.tag}
                  </span>
                  <h4 className="text-sm font-bold text-gray-900 group-hover:text-teal-900 truncate">
                    {sc.title}
                  </h4>
                </div>

                <p className="text-xs text-gray-600 mt-1 leading-snug">
                  {sc.description}
                </p>

                <div className="mt-2 p-1.5 bg-gray-50 rounded-md border border-gray-100 font-mono text-[11px] text-teal-900 truncate">
                  "{sc.spokenText}"
                </div>

                <div className="mt-1 text-[11px] font-semibold text-emerald-700">
                  Expected: {sc.expectedOutcome}
                </div>
              </div>

              <button className="self-center px-3 py-1.5 rounded-lg bg-teal-600 text-white font-bold text-xs shrink-0 group-hover:bg-teal-700 transition shadow-xs">
                Test
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
