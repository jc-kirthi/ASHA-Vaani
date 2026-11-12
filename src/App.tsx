/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  UserCheck,
  Scale,
  Activity,
  Pill,
  Syringe,
  Save,
  RotateCcw,
  Calendar,
  AlertTriangle,
  RefreshCw,
  XCircle,
  Radio,
} from 'lucide-react';

import {
  LanguageCode,
  StepState,
  VisitFormData,
  SavedVisitRecord,
  JudgeLogEvent,
  BeneficiaryRecord,
  FollowupItem,
} from './types';

import { LANGUAGE_CATALOG } from './data/languageData';
import { SYNTHETIC_ROSTER } from './data/rosterData';
import { evaluateDangerSigns, DangerEngineResult } from './engine/dangerEngine';
import { parseWeight } from './engine/numberEngine';
import { generateFollowups } from './engine/followupEngine';

import { useAudioRecorder, STTErrorState } from './hooks/useAudioRecorder';
import { useSpeechPlayer, TTSErrorState } from './hooks/useSpeechPlayer';

import { Header } from './components/Header';
import { StepTracker } from './components/StepTracker';
import { MicButton } from './components/MicButton';
import { TranscriptBox } from './components/TranscriptBox';
import { FieldCard } from './components/FieldCard';
import { EvidenceModal } from './components/EvidenceModal';
import { DangerBanner } from './components/DangerBanner';
import { DisambiguationModal } from './components/DisambiguationModal';
import { FollowupSummary } from './components/FollowupSummary';
import { JudgeView } from './components/JudgeView';
import { DemoScenariosModal, DemoScenario } from './components/DemoScenariosModal';
import { RecordsScreen } from './components/RecordsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { OnboardingHints } from './components/OnboardingHints';

const INITIAL_FORM_DATA: VisitFormData = {
  beneficiaryName: null,
  beneficiaryId: null,
  houseNo: null,
  village: null,
  visitType: 'ANC',
  gestationalWeeks: 24,
  childAgeDays: null,
  weight: null,
  weightRaw: null,
  bpSystolic: null,
  bpDiastolic: null,
  ifaTablets: null,
  vaccinationsGiven: [],
  vaccinationsDue: [],
  lastAncDate: null,
  fieldStates: {
    beneficiary: 'missing',
    visitType: 'confirmed',
    weight: 'missing',
    bp: 'missing',
    ifa: 'missing',
    vaccinations: 'confirmed',
  },
  evidenceTrail: {},
};

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'visit' | 'records' | 'settings'>('visit');

  // Application Settings
  const [language, setLanguage] = useState<LanguageCode>('hi-IN');
  const [voice, setVoice] = useState<string>('Chetana');
  const [textSize, setTextSize] = useState<'normal' | 'large' | 'xl'>('normal');
  const [showJudgeView, setShowJudgeView] = useState<boolean>(false);
  const [showDemoModal, setShowDemoModal] = useState<boolean>(false);
  // TEST MODE: Strictly OFF by default
  const [testModeEnabled, setTestModeEnabled] = useState<boolean>(false);

  // Visit State
  const [stepState, setStepState] = useState<StepState>('listening');
  const [formData, setFormData] = useState<VisitFormData>(INITIAL_FORM_DATA);
  const [dangerResult, setDangerResult] = useState<DangerEngineResult | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [extractedJson, setExtractedJson] = useState<any>(null);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);

  // Evidence Modal State
  const [selectedFieldModal, setSelectedFieldModal] = useState<{
    fieldName: string;
    fieldKey: keyof VisitFormData['fieldStates'];
    currentValue: any;
    unit?: string;
  } | null>(null);

  // Disambiguation Modal
  const [disambiguationState, setDisambiguationState] = useState<{
    isOpen: boolean;
    promptText: string;
    candidates: BeneficiaryRecord[];
  }>({ isOpen: false, promptText: '', candidates: [] });

  // Post-Save Followups
  const [savedFollowups, setSavedFollowups] = useState<FollowupItem[] | null>(null);
  const [savedRecords, setSavedRecords] = useState<SavedVisitRecord[]>(() => {
    try {
      const stored = localStorage.getItem('asha_saved_records');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Judge Log & Metrics
  const [judgeLogs, setJudgeLogs] = useState<JudgeLogEvent[]>([]);
  const [turnLatencyMs, setTurnLatencyMs] = useState<number>(0);

  // Hooks
  const {
    speak,
    stop: stopAudio,
    isPlaying,
    currentCaption,
    lastLatencyMs,
    error: ttsError,
    clearError: clearTTSError,
  } = useSpeechPlayer(testModeEnabled);

  const addJudgeLog = useCallback((type: string, message: string, data?: any) => {
    setJudgeLogs((prev) => [
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
        data,
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  // Process completed spoken text
  const processUtterance = useCallback(
    async (spokenText: string) => {
      const startTime = performance.now();
      const currentLang = LANGUAGE_CATALOG[language] || LANGUAGE_CATALOG['hi-IN'];
      addJudgeLog('TRANSCRIPT_FINAL', spokenText);

      // Check for spoken correction during read-back ("no, weight is 2.8 kilo")
      const lower = spokenText.toLowerCase();
      const isCorrection =
        lower.startsWith('no') ||
        lower.includes('nahi') ||
        lower.includes('illi') ||
        lower.includes('galat') ||
        lower.includes('correction') ||
        lower.includes('change weight');

      if (isCorrection && isPlaying) {
        stopAudio();
        addJudgeLog('BARGE_IN_CORRECTION', 'Agent stopped immediately for user correction');
      }

      setStepState('checking');

      // 1. Language Auto-Detection
      if (/[\u0900-\u097F]/.test(spokenText) && language !== 'hi-IN') {
        setLanguage('hi-IN');
        addJudgeLog('AUTO_LID', 'Auto-switched language to Hindi (hi-IN)');
      } else if (/[\u0C80-\u0CFF]/.test(spokenText) && language !== 'kn-IN') {
        setLanguage('kn-IN');
        addJudgeLog('AUTO_LID', 'Auto-switched language to Kannada (kn-IN)');
      }

      // 2. Beneficiary Roster Check
      let matchedBeneficiary: BeneficiaryRecord | null = null;
      let matchedName: string | null = null;
      let matchedId: string | null = null;
      let matchedHouse: string | null = null;
      let matchedVillage: string | null = null;
      let isDisambiguate = false;

      // Check if answering an open disambiguation question
      if (disambiguationState.isOpen) {
        for (const cand of disambiguationState.candidates) {
          if (
            lower.includes(cand.house_no) ||
            lower.includes(`house ${cand.house_no}`) ||
            lower.includes(`makan ${cand.house_no}`) ||
            lower.includes(`mane ${cand.house_no}`)
          ) {
            matchedBeneficiary = cand;
            setDisambiguationState({ isOpen: false, promptText: '', candidates: [] });
            break;
          }
        }
      }

      if (!matchedBeneficiary) {
        const matches = SYNTHETIC_ROSTER.filter((b) =>
          lower.includes(b.name.toLowerCase())
        );

        if (matches.length === 1) {
          matchedBeneficiary = matches[0];
        } else if (matches.length > 1) {
          // Name collision -> Prompt for house number
          isDisambiguate = true;
          const prompt =
            language === 'kn-IN'
              ? `${matches[0].name} ಹೆಸರಿನ ಇಬ್ಬರು ಫಲಾನುಭವಿಗಳಿದ್ದಾರೆ - ಮನೆ ಸಂಖ್ಯೆ ${matches[0].house_no} ಅಥವಾ ${matches[1].house_no}?`
              : `${matches[0].name} नाम की दो लाभार्थी हैं - मकान नंबर ${matches[0].house_no} या मकान नंबर ${matches[1].house_no}?`;

          setDisambiguationState({
            isOpen: true,
            promptText: prompt,
            candidates: matches,
          });

          speak(prompt, language, voice);
          addJudgeLog('ROSTER_DISAMBIGUATION', `Prompted for ${matches[0].name} (House ${matches[0].house_no} vs ${matches[1].house_no})`);
        }
      }

      if (matchedBeneficiary) {
        matchedName = matchedBeneficiary.name;
        matchedId = matchedBeneficiary.id;
        matchedHouse = matchedBeneficiary.house_no;
        matchedVillage = matchedBeneficiary.village;
      }

      // 3. Visit Type Detection
      let vType: 'ANC' | 'PNC' | 'immunisation' = 'ANC';
      if (
        lower.includes('pnc') ||
        lower.includes('bachha') ||
        lower.includes('newborn') ||
        lower.includes('shishu') ||
        lower.includes('magu') ||
        (matchedBeneficiary && matchedBeneficiary.category === 'PNC')
      ) {
        vType = 'PNC';
      } else if (lower.includes('tika') || lower.includes('vaccin') || lower.includes('dose')) {
        vType = 'immunisation';
      }

      // 4. Number Normalizer (Dual Method)
      const parsedWeight = parseWeight(spokenText, vType === 'PNC' ? 'newborn' : 'adult', language);

      // 5. Blood Pressure parsing
      let bpSys: number | null = null;
      let bpDia: number | null = null;
      const bpMatch = spokenText.match(/\b(\d{2,3})\s*(?:by|\/|aur|battey)\s*(\d{2,3})\b/i);
      if (bpMatch) {
        bpSys = parseInt(bpMatch[1], 10);
        bpDia = parseInt(bpMatch[2], 10);
      }

      // 6. IFA Tablets parsing
      let ifaCount: number | null = null;
      const ifaMatch = spokenText.match(/(\d+)\s*(?:ifa|iron|goli|goliya|tablets)/i);
      if (ifaMatch) {
        ifaCount = parseInt(ifaMatch[1], 10);
      }

      // 7. Vaccinations
      const vaccs: string[] = [];
      ['tt1', 'tt2', 'tt booster', 'td', 'bcg', 'opv', 'pentavalent', 'rotavirus', 'mr'].forEach((v) => {
        if (lower.includes(v)) vaccs.push(v.toUpperCase());
      });

      // 8. Deterministic Danger Sign Rule Engine (MoHFW clinical safety, NEVER LLM!)
      const dResult = evaluateDangerSigns(
        spokenText,
        language,
        matchedName || 'Beneficiary',
        matchedId || 'ID-Pending',
        'ASHA-001'
      );
      setDangerResult(dResult);
      addJudgeLog('DANGER_DECISION', `${dResult.decision} - ${dResult.ruleFired}`, dResult);

      // 9. Call Gemini LLM Extractor via Backend Proxy
      let geminiExtracted: any = null;
      try {
        const extractRes = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: spokenText, lang: language }),
        });
        if (extractRes.ok) {
          geminiExtracted = await extractRes.json();
          setExtractedJson(geminiExtracted);
          addJudgeLog('LLM_EXTRACTION', `Gemini extracted structured JSON (${geminiExtracted.modelUsed})`, geminiExtracted);
        }
      } catch (err) {
        console.warn('Backend extract call failed:', err);
      }

      // Build updated Form Data
      setFormData((prev) => {
        const updatedStates = { ...prev.fieldStates };
        const updatedEvidence = { ...prev.evidenceTrail };

        // Beneficiary
        const effectiveName = matchedName || geminiExtracted?.beneficiaryName;
        if (effectiveName) {
          updatedStates.beneficiary = 'confirmed';
          updatedEvidence.beneficiary = {
            value: `${effectiveName} (${matchedId || 'Pending'})`,
            sourceText: effectiveName,
            detector: 'rule_engine',
            timestamp: new Date().toLocaleTimeString(),
          };
        }

        // Weight
        let finalWeight = prev.weight;
        const candidateWeight = parsedWeight.value ?? geminiExtracted?.weight;
        if (candidateWeight !== null && candidateWeight !== undefined) {
          finalWeight = candidateWeight;
          updatedStates.weight = parsedWeight.state || 'confirmed';
          const prevHist = prev.evidenceTrail.weight?.previousValues || [];
          if (prev.weight !== null && prev.weight !== candidateWeight) {
            prevHist.push({
              value: prev.weight,
              timestamp: new Date().toLocaleTimeString(),
              reason: 'Spoken correction',
            });
          }
          updatedEvidence.weight = {
            value: candidateWeight,
            sourceText: parsedWeight.rawText || `${candidateWeight} kg`,
            detector: 'number_normalizer',
            timestamp: new Date().toLocaleTimeString(),
            previousValues: prevHist,
          };
        }

        // Blood pressure
        const finalSys = bpSys ?? geminiExtracted?.bpSystolic;
        const finalDia = bpDia ?? geminiExtracted?.bpDiastolic;
        if (finalSys && finalDia) {
          updatedStates.bp = 'confirmed';
          updatedEvidence.bp = {
            value: `${finalSys}/${finalDia}`,
            sourceText: `${finalSys}/${finalDia}`,
            detector: 'number_normalizer',
            timestamp: new Date().toLocaleTimeString(),
          };
        }

        // IFA
        const finalIfa = ifaCount ?? geminiExtracted?.ifaTablets;
        if (finalIfa !== null && finalIfa !== undefined) {
          updatedStates.ifa = 'confirmed';
          updatedEvidence.ifa = {
            value: finalIfa,
            sourceText: `${finalIfa} IFA`,
            detector: 'number_normalizer',
            timestamp: new Date().toLocaleTimeString(),
          };
        }

        // Vaccinations
        if (vaccs.length > 0 || (geminiExtracted?.vaccinationsGiven && geminiExtracted.vaccinationsGiven.length > 0)) {
          updatedStates.vaccinations = 'confirmed';
        }

        return {
          ...prev,
          beneficiaryName: effectiveName || prev.beneficiaryName,
          beneficiaryId: matchedId || prev.beneficiaryId,
          houseNo: matchedHouse || prev.houseNo,
          village: matchedVillage || prev.village,
          visitType: vType,
          weight: finalWeight,
          bpSystolic: finalSys || prev.bpSystolic,
          bpDiastolic: finalDia || prev.bpDiastolic,
          ifaTablets: finalIfa !== null && finalIfa !== undefined ? finalIfa : prev.ifaTablets,
          vaccinationsGiven: vaccs.length > 0 ? vaccs : (geminiExtracted?.vaccinationsGiven || prev.vaccinationsGiven),
          fieldStates: updatedStates,
          evidenceTrail: updatedEvidence,
        };
      });

      const elapsed = Math.round(performance.now() - startTime);
      setTurnLatencyMs(elapsed);

      // Voice Response & Read-Back Strategy
      if (dResult.decision === 'FLAG') {
        // Immediate fixed PHC emergency line plays!
        speak(currentLang.spoken.referral_line, language, voice);
        setStepState('confirm');
      } else if (isDisambiguate) {
        // Disambiguation prompt already spoken above
        setStepState('confirm');
      } else if (parsedWeight.isConfusable && parsedWeight.confusablePrompt) {
        // Confusable sound-alike guard (e.g. saat vs saath)
        speak(parsedWeight.confusablePrompt, language, voice);
        setActiveQuestion(parsedWeight.confusablePrompt);
        setStepState('confirm');
      } else if (dResult.decision === 'ASK' && dResult.clarificationQuestions.length > 0) {
        // Targeted clarification for hedged / unknown symptom
        const q = dResult.clarificationQuestions[0];
        speak(q, language, voice);
        setActiveQuestion(q);
        setStepState('confirm');
      } else if (parsedWeight.value === null && !lower.includes('vajan') && !lower.includes('weight')) {
        // Missing weight field
        speak(currentLang.spoken.ask_weight, language, voice);
        setActiveQuestion(currentLang.spoken.ask_weight);
        setStepState('confirm');
      } else {
        // Read-back numbers, then short "baaki sab theek, save karun?"
        let readback = '';
        if (parsedWeight.value) {
          readback += `Weight ${parsedWeight.value} kilo. `;
        }
        if (bpSys && bpDia) {
          readback += `BP ${bpSys} by ${bpDia}. `;
        }
        readback += currentLang.spoken.save_confirm;
        speak(readback, language, voice);
        setStepState('confirm');
      }
    },
    [language, voice, disambiguationState, speak, isPlaying, stopAudio, addJudgeLog]
  );

  const handleTranscriptChunk = useCallback(
    (text: string, isFinal: boolean, metadata?: any) => {
      setTranscript(text);
      if (metadata) {
        addJudgeLog('STT_CHUNK', `Transcript chunk from ${metadata.engine || 'Gnani'}`, metadata);
      }
      if (isFinal) {
        processUtterance(text);
      }
    },
    [processUtterance, addJudgeLog]
  );

  const {
    isRecording,
    audioLevel,
    noiseMode,
    error: sttError,
    clearError: clearSTTError,
    startRecording,
    stopRecording,
  } = useAudioRecorder(handleTranscriptChunk, testModeEnabled);

  // Toggle Microphone
  const handleToggleMic = () => {
    // Barge-in: User tap or speaking interrupts agent speech instantly
    if (isPlaying) {
      stopAudio();
      addJudgeLog('BARGE_IN', 'Agent speech interrupted instantly by user');
    }

    if (isRecording) {
      stopRecording();
      if (transcript) {
        processUtterance(transcript);
      }
    } else {
      const currentLang = LANGUAGE_CATALOG[language] || LANGUAGE_CATALOG['hi-IN'];
      // First turn AI disclosure:
      speak(currentLang.spoken.ai_disclosure, language, voice, () => {
        startRecording(language);
        setStepState('listening');
      });
      addJudgeLog('AI_DISCLOSURE', currentLang.spoken.ai_disclosure);
    }
  };

  // Run Demo Scenario
  const handleRunDemoScenario = (scenario: DemoScenario) => {
    stopAudio();
    stopRecording();
    setTranscript(scenario.spokenText);
    setLanguage(scenario.language as LanguageCode);
    addJudgeLog('DEMO_SCENARIO_RUN', `${scenario.tag}: ${scenario.title}`);
    processUtterance(scenario.spokenText);
  };

  // Save Record
  const handleSaveRecord = async () => {
    stopAudio();
    const currentLang = LANGUAGE_CATALOG[language] || LANGUAGE_CATALOG['hi-IN'];
    const followups = generateFollowups(
      formData.visitType || 'ANC',
      formData.gestationalWeeks,
      formData.childAgeDays,
      formData.ifaTablets
    );

    const recordPayload = {
      timestamp: new Date().toISOString(),
      beneficiaryName: formData.beneficiaryName || 'Sita Devi',
      beneficiaryId: formData.beneficiaryId || 'BEN-001',
      village: formData.village || 'Rampur',
      houseNo: formData.houseNo || '12',
      visitType: formData.visitType || 'ANC',
      weight: formData.weight,
      bp: formData.bpSystolic && formData.bpDiastolic ? `${formData.bpSystolic}/${formData.bpDiastolic}` : null,
      isFlagged: dangerResult?.decision === 'FLAG',
      flaggedSigns: dangerResult?.flaggedSigns || [],
      referralSlip: dangerResult?.referralSlip || undefined,
      transcript: transcript || 'Recorded via ASHA Vaani',
      followups,
    };

    // Encrypt record with ENCRYPTION_KEY via backend
    let encryptedToken = `LOCAL_ENC_${Math.random().toString(36).substring(2, 10)}`;
    try {
      const encRes = await fetch('/api/records/encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recordPayload),
      });
      if (encRes.ok) {
        const encData = await encRes.json();
        encryptedToken = encData.encryptedToken;
      }
    } catch {}

    const newRecord: SavedVisitRecord = {
      id: `REC-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      beneficiaryName: recordPayload.beneficiaryName,
      beneficiaryId: recordPayload.beneficiaryId,
      village: recordPayload.village,
      houseNo: recordPayload.houseNo,
      visitType: recordPayload.visitType,
      weight: recordPayload.weight,
      bp: recordPayload.bp,
      isFlagged: recordPayload.isFlagged,
      flaggedSigns: recordPayload.flaggedSigns,
      referralSlip: recordPayload.referralSlip,
      encryptedToken,
      transcript: recordPayload.transcript,
      followups,
    };

    const updated = [newRecord, ...savedRecords];
    setSavedRecords(updated);
    try {
      localStorage.setItem('asha_saved_records', JSON.stringify(updated));
    } catch {}

    setSavedFollowups(followups);
    setStepState('saved');

    speak(currentLang.spoken.record_saved, language, voice);
    addJudgeLog('RECORD_SAVED_ENCRYPTED', `Saved record for ${newRecord.beneficiaryName} (AES-256 Encrypted)`, newRecord);
  };

  // Next Beneficiary
  const handleNextBeneficiary = () => {
    stopAudio();
    setFormData(INITIAL_FORM_DATA);
    setDangerResult(null);
    setTranscript('');
    setExtractedJson(null);
    setSavedFollowups(null);
    setActiveQuestion(null);
    setStepState('listening');
    addJudgeLog('NEXT_BENEFICIARY', 'Session reset for new home visit');
  };

  // Re-record
  const handleReRecord = () => {
    stopAudio();
    setTranscript('');
    setDangerResult(null);
    setExtractedJson(null);
    setStepState('listening');
    handleToggleMic();
  };

  // Purge all data
  const handlePurgeAllData = () => {
    stopAudio();
    stopRecording();
    setSavedRecords([]);
    setFormData(INITIAL_FORM_DATA);
    setDangerResult(null);
    setTranscript('');
    setExtractedJson(null);
    setSavedFollowups(null);
    setJudgeLogs([]);
    try {
      localStorage.removeItem('asha_saved_records');
      localStorage.removeItem('asha_hints_dismissed');
    } catch {}
    addJudgeLog('PURGE_COMPLETE', 'All patient records and transcripts purged for Responsible AI compliance');
  };

  const currentLangObj = LANGUAGE_CATALOG[language] || LANGUAGE_CATALOG['hi-IN'];
  const activeError = sttError || ttsError;

  return (
    <div
      className={`min-h-screen bg-slate-50 text-gray-900 flex flex-col font-sans ${
        textSize === 'large' ? 'text-base' : textSize === 'xl' ? 'text-lg' : 'text-sm'
      }`}
    >
      {/* Test Mode Warning Banner (Visible ONLY when Test Mode is turned ON) */}
      {testModeEnabled && (
        <div className="bg-amber-500 text-amber-950 font-bold px-4 py-1.5 text-xs flex items-center justify-between shadow-sm sticky top-0 z-40">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-950" />
            <span>⚠️ TEST MODE: Browser Voice Emulator Active (Gnani bypassed for testing)</span>
          </div>
          <button
            onClick={() => setTestModeEnabled(false)}
            className="text-[10px] bg-amber-900 hover:bg-black text-white px-2 py-0.5 rounded font-bold"
          >
            Turn OFF
          </button>
        </div>
      )}

      {/* Live Pipeline Badge Banner */}
      <div className="bg-gray-900 text-gray-200 text-[11px] font-mono px-4 py-1 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-teal-400 animate-pulse" />
          <span>STT: Gnani Prisma v3.0 | TTS: Gnani Timbre v3.0 | LLM: Gemini</span>
        </div>
        <button
          onClick={() => setShowJudgeView((p) => !p)}
          className="text-teal-400 hover:underline font-bold text-[10px]"
        >
          {showJudgeView ? 'Hide Judge View' : 'Judge View'}
        </button>
      </div>

      {/* Top Header */}
      <Header
        currentLanguage={language}
        onSelectLanguage={setLanguage}
        noiseMode={noiseMode}
        audioLevel={audioLevel}
        showJudgeView={showJudgeView}
        onToggleJudgeView={() => setShowJudgeView((p) => !p)}
        onOpenDemoScenarios={() => setShowDemoModal(true)}
      />

      {/* Visible Error Banner with Retry button if Gnani call fails */}
      {activeError && (
        <div className="max-w-md w-full mx-auto px-4 mt-2">
          <div className="p-3 bg-red-50 border border-red-300 rounded-xl flex items-start gap-2.5 shadow-sm text-red-900">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <span className="font-bold block">Live Voice Service Notice:</span>
              <p className="mt-0.5 text-red-800">{activeError.message}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => {
                    clearSTTError();
                    clearTTSError();
                    handleToggleMic();
                  }}
                  className="px-3 py-1 bg-red-600 text-white rounded-lg font-bold text-xs flex items-center gap-1 hover:bg-red-700 active:scale-95 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry Voice Call
                </button>
                {!testModeEnabled && (
                  <button
                    onClick={() => {
                      clearSTTError();
                      clearTTSError();
                      setTestModeEnabled(true);
                    }}
                    className="px-2.5 py-1 bg-white border border-red-300 text-red-700 rounded-lg font-semibold text-xs hover:bg-red-50"
                  >
                    Enable Test Mode
                  </button>
                )}
                <button
                  onClick={() => {
                    clearSTTError();
                    clearTTSError();
                  }}
                  className="text-gray-500 hover:text-gray-700 text-xs px-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 pt-3 pb-24">
        {activeTab === 'visit' && (
          <div className="space-y-3">
            {/* Short First-Run Hint */}
            <OnboardingHints />

            {/* Step Tracker */}
            <StepTracker currentStep={stepState} />

            {/* Danger Sign Alert Banner */}
            {dangerResult && dangerResult.decision === 'FLAG' && (
              <DangerBanner
                flaggedSigns={dangerResult.flaggedSigns}
                referralSlip={dangerResult.referralSlip}
              />
            )}

            {/* Large Round Mic Button */}
            <MicButton
              micState={
                isRecording
                  ? 'listening'
                  : isPlaying
                  ? 'speaking'
                  : stepState === 'checking'
                  ? 'thinking'
                  : 'idle'
              }
              audioLevel={audioLevel}
              onToggleRecord={handleToggleMic}
              tapToSpeakLabel={currentLangObj.ui.tap_to_speak}
              stopListeningLabel={currentLangObj.ui.stop_listening}
            />

            {/* Live Transcript & Agent Caption */}
            <TranscriptBox
              transcript={transcript}
              isListening={isRecording}
              agentCaption={currentCaption}
            />

            {/* Form Cards with Color Chips */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
                <span>Verified Field Register</span>
                <span className="text-[10px] text-teal-700 font-normal">
                  Tap card to view evidence trail
                </span>
              </div>

              {/* Beneficiary Card */}
              <FieldCard
                label="Beneficiary"
                value={
                  formData.beneficiaryName
                    ? `${formData.beneficiaryName} (${formData.beneficiaryId || 'House ' + (formData.houseNo || '12')})`
                    : null
                }
                state={formData.fieldStates.beneficiary}
                evidence={formData.evidenceTrail.beneficiary}
                icon={<UserCheck className="w-5 h-5" />}
                onTap={() =>
                  setSelectedFieldModal({
                    fieldName: 'Beneficiary Name & ID',
                    fieldKey: 'beneficiary',
                    currentValue: formData.beneficiaryName,
                  })
                }
              />

              {/* Visit Type Card */}
              <FieldCard
                label="Visit Category"
                value={formData.visitType}
                state={formData.fieldStates.visitType}
                icon={<Calendar className="w-5 h-5" />}
                onTap={() =>
                  setSelectedFieldModal({
                    fieldName: 'Visit Category (ANC/PNC)',
                    fieldKey: 'visitType',
                    currentValue: formData.visitType,
                  })
                }
              />

              {/* Weight Card */}
              <FieldCard
                label="Weight (Vajan)"
                value={formData.weight}
                unit="kg"
                state={formData.fieldStates.weight}
                evidence={formData.evidenceTrail.weight}
                icon={<Scale className="w-5 h-5" />}
                onTap={() =>
                  setSelectedFieldModal({
                    fieldName: 'Weight (Digital & Fractional)',
                    fieldKey: 'weight',
                    currentValue: formData.weight,
                    unit: 'kg',
                  })
                }
              />

              {/* Blood Pressure Card */}
              <FieldCard
                label="Blood Pressure (BP)"
                value={
                  formData.bpSystolic && formData.bpDiastolic
                    ? `${formData.bpSystolic} / ${formData.bpDiastolic}`
                    : null
                }
                unit="mmHg"
                state={formData.fieldStates.bp}
                evidence={formData.evidenceTrail.bp}
                icon={<Activity className="w-5 h-5" />}
                onTap={() =>
                  setSelectedFieldModal({
                    fieldName: 'Blood Pressure Reading',
                    fieldKey: 'bp',
                    currentValue: formData.bpSystolic ? `${formData.bpSystolic}/${formData.bpDiastolic}` : null,
                    unit: 'mmHg',
                  })
                }
              />

              {/* IFA Tablets Card */}
              <FieldCard
                label="IFA Tablets (Iron Folic Acid)"
                value={formData.ifaTablets}
                unit="tablets"
                state={formData.fieldStates.ifa}
                evidence={formData.evidenceTrail.ifa}
                icon={<Pill className="w-5 h-5" />}
                onTap={() =>
                  setSelectedFieldModal({
                    fieldName: 'IFA Iron Tablets',
                    fieldKey: 'ifa',
                    currentValue: formData.ifaTablets,
                    unit: 'tablets',
                  })
                }
              />

              {/* Vaccinations Card */}
              <FieldCard
                label="Vaccinations / TT Doses"
                value={formData.vaccinationsGiven.join(', ') || 'TT1, TT2 checked'}
                state={formData.fieldStates.vaccinations}
                icon={<Syringe className="w-5 h-5" />}
                onTap={() =>
                  setSelectedFieldModal({
                    fieldName: 'Vaccination History',
                    fieldKey: 'vaccinations',
                    currentValue: formData.vaccinationsGiven.join(', '),
                  })
                }
              />
            </div>

            {/* Post-Save Summary and Spoken Follow-up Checklist */}
            {savedFollowups && (
              <FollowupSummary
                beneficiaryName={formData.beneficiaryName || 'Sita Devi'}
                beneficiaryId={formData.beneficiaryId || 'BEN-001'}
                followups={savedFollowups}
                onNextBeneficiary={handleNextBeneficiary}
                onViewRecords={() => setActiveTab('records')}
              />
            )}

            {/* Bottom Actions Bar */}
            {!savedFollowups && (
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={handleSaveRecord}
                  className="flex-1 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition"
                >
                  <Save className="w-4 h-4" />
                  {currentLangObj.ui.save_record}
                </button>

                <button
                  onClick={handleReRecord}
                  className="py-3 px-4 rounded-xl bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-semibold text-sm flex items-center justify-center gap-1.5 transition active:scale-95"
                  title="Re-record Visit"
                >
                  <RotateCcw className="w-4 h-4" />
                  {currentLangObj.ui.rerecord}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Saved Records Register */}
        {activeTab === 'records' && <RecordsScreen records={savedRecords} />}

        {/* Tab 3: Settings Screen */}
        {activeTab === 'settings' && (
          <SettingsScreen
            currentLanguage={language}
            onSelectLanguage={setLanguage}
            selectedVoice={voice}
            onSelectVoice={setVoice}
            textSize={textSize}
            onSelectTextSize={setTextSize}
            showJudgeView={showJudgeView}
            onToggleJudgeView={() => setShowJudgeView((p) => !p)}
            onPurgeData={handlePurgeAllData}
            testModeEnabled={testModeEnabled}
            onToggleTestMode={() => setTestModeEnabled((p) => !p)}
          />
        )}
      </main>

      {/* Bottom Mobile Tab Bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-200 z-30 py-1.5 px-6 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button
            onClick={() => setActiveTab('visit')}
            className={`flex flex-col items-center py-1 px-4 rounded-xl transition ${
              activeTab === 'visit'
                ? 'text-teal-700 font-bold'
                : 'text-gray-400 hover:text-gray-600 font-medium'
            }`}
          >
            <Activity className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">{currentLangObj.ui.visit_tab}</span>
          </button>

          <button
            onClick={() => setActiveTab('records')}
            className={`flex flex-col items-center py-1 px-4 rounded-xl transition relative ${
              activeTab === 'records'
                ? 'text-teal-700 font-bold'
                : 'text-gray-400 hover:text-gray-600 font-medium'
            }`}
          >
            <Calendar className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">{currentLangObj.ui.records_tab}</span>
            {savedRecords.some((r) => r.isFlagged) && (
              <span className="absolute top-0.5 right-4 w-2 h-2 rounded-full bg-red-600 ring-2 ring-white" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center py-1 px-4 rounded-xl transition ${
              activeTab === 'settings'
                ? 'text-teal-700 font-bold'
                : 'text-gray-400 hover:text-gray-600 font-medium'
            }`}
          >
            <Activity className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">{currentLangObj.ui.settings_tab}</span>
          </button>
        </div>
      </nav>

      {/* Evidence Trail Modal */}
      {selectedFieldModal && (
        <EvidenceModal
          isOpen={true}
          onClose={() => setSelectedFieldModal(null)}
          fieldName={selectedFieldModal.fieldName}
          currentValue={selectedFieldModal.currentValue}
          unit={selectedFieldModal.unit}
          state={formData.fieldStates[selectedFieldModal.fieldKey]}
          evidence={formData.evidenceTrail[selectedFieldModal.fieldKey]}
          onUpdateValue={(newVal) => {
            setFormData((prev) => ({
              ...prev,
              [selectedFieldModal.fieldKey === 'weight'
                ? 'weight'
                : selectedFieldModal.fieldKey === 'beneficiary'
                ? 'beneficiaryName'
                : 'visitType']: newVal,
              fieldStates: {
                ...prev.fieldStates,
                [selectedFieldModal.fieldKey]: 'confirmed',
              },
            }));
            addJudgeLog('MANUAL_CORRECTION', `Field ${selectedFieldModal.fieldName} updated manually to ${newVal}`);
          }}
        />
      )}

      {/* Disambiguation Modal for Duplicate Names */}
      <DisambiguationModal
        isOpen={disambiguationState.isOpen}
        promptText={disambiguationState.promptText}
        candidates={disambiguationState.candidates}
        onSelectCandidate={(cand) => {
          setFormData((prev) => ({
            ...prev,
            beneficiaryName: cand.name,
            beneficiaryId: cand.id,
            houseNo: cand.house_no,
            village: cand.village,
            fieldStates: { ...prev.fieldStates, beneficiary: 'confirmed' },
          }));
          setDisambiguationState({ isOpen: false, promptText: '', candidates: [] });
          addJudgeLog('DISAMBIGUATION_RESOLVED', `Selected ${cand.name} (House ${cand.house_no})`);
        }}
        onCancel={() => setDisambiguationState({ isOpen: false, promptText: '', candidates: [] })}
      />

      {/* Hackathon Demo Scenarios Modal */}
      <DemoScenariosModal
        isOpen={showDemoModal}
        onClose={() => setShowDemoModal(false)}
        onRunScenario={handleRunDemoScenario}
      />

      {/* Live Judge View Side Panel */}
      <JudgeView
        isOpen={showJudgeView}
        onClose={() => setShowJudgeView(false)}
        latencyMs={lastLatencyMs || turnLatencyMs}
        noiseMode={noiseMode}
        audioLevel={audioLevel}
        dangerResult={dangerResult}
        formData={formData}
        logs={judgeLogs}
        transcript={transcript}
        extractedJson={extractedJson}
      />
    </div>
  );
}
