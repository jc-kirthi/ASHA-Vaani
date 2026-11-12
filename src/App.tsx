/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { DangerEngineResult } from './types';

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
  visitType: null,
  gestationalWeeks: null,
  childAgeDays: null,
  weight: null,
  weightRaw: null,
  bpSystolic: null,
  bpDiastolic: null,
  ifaTablets: null,
  ifaStatus: null,
  vaccinationsGiven: [],
  vaccinationsDue: [],
  lastAncDate: null,
  fieldStates: {
    beneficiary: 'missing',
    visitType: 'missing',
    weight: 'missing',
    bp: 'missing',
    ifa: 'missing',
    vaccinations: 'confirmed',
  },
  evidenceTrail: {},
};

interface PipelineField {
  value: unknown;
  state: 'confirmed' | 'uncertain' | 'missing';
  evidence: string;
}

interface PipelineTurnResponse {
  session_id: string;
  transcript: string;
  extracted: Record<string, unknown>;
  fields: Record<string, PipelineField>;
  questions: string[];
  answer_text: string | null;
  danger: DangerEngineResult;
  read_back_text: string | null;
  saved: boolean;
  encrypted_record: string | null;
  followups: FollowupItem[];
  referral_slip: string | null;
  saved_record: Record<string, unknown> | null;
  test_mode: boolean;
  roster_label: string | null;
  rule: string;
}

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'visit' | 'records' | 'settings'>('visit');

  // Application Settings
  const [language, setLanguage] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem('asha_language');
      if (saved && saved in LANGUAGE_CATALOG) return saved as LanguageCode;
    } catch {}
    return 'en-IN';
  });
  const [voice, setVoice] = useState<string>(() => {
    try {
      return localStorage.getItem('asha_voice') || LANGUAGE_CATALOG['en-IN'].defaultVoice;
    } catch {
      return LANGUAGE_CATALOG['en-IN'].defaultVoice;
    }
  });
  const [textSize, setTextSize] = useState<'normal' | 'large' | 'xl'>('normal');
  const [showJudgeView, setShowJudgeView] = useState<boolean>(false);
  const [showDemoModal, setShowDemoModal] = useState<boolean>(false);
  const [serverTestMode, setServerTestMode] = useState(false);

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
    return [];
  });
  const [newBeneficiaries, setNewBeneficiaries] = useState<BeneficiaryRecord[]>([]);
  const [pipelineFields, setPipelineFields] = useState<Record<string, PipelineField>>({});
  const [selectedPipelineField, setSelectedPipelineField] = useState<{ key: string; label: string } | null>(null);
  const pipelineSessionIdRef = useRef(`visit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [workflowError, setWorkflowError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const stopRecordingRef = useRef<() => void>(() => {});
  const lastProcessedTranscriptRef = useRef('');
  const visitTranscriptRef = useRef('');
  const awaitingSaveConfirmationRef = useRef(false);

  useEffect(() => {
    let active = true;
    const restoreEncryptedRecords = async () => {
      try {
        const stored = JSON.parse(localStorage.getItem('asha_saved_records') || '[]');
        if (!Array.isArray(stored) || stored.length === 0) return;
        const records = await Promise.all(stored.map(async (item) => {
          if (!item || typeof item.encryptedToken !== 'string') return null;
          const response = await fetch('/api/records/decrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: item.encryptedToken }),
          });
          if (!response.ok) throw new Error('A saved encrypted record could not be decrypted.');
          const result = await response.json();
          return result.data as SavedVisitRecord;
        }));
        const validRecords = records.filter((record): record is SavedVisitRecord => record !== null);
        localStorage.setItem(
          'asha_saved_records',
          JSON.stringify(validRecords.map((record) => ({
            id: record.id,
            timestamp: record.timestamp,
            encryptedToken: record.encryptedToken,
          })))
        );
        if (active) setSavedRecords(validRecords);
      } catch {
        localStorage.removeItem('asha_saved_records');
        if (active) setWorkflowError({
          message: 'Saved records could not be decrypted. The local copies were removed; check ENCRYPTION_KEY in the project root .env file.',
          canRetry: true,
        });
      }
    };
    void restoreEncryptedRecords();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch('/api/beneficiaries')
      .then(async (response) => {
        if (!response.ok) throw new Error('Synthetic beneficiaries could not be loaded.');
        return response.json();
      })
      .then((beneficiaries: BeneficiaryRecord[]) => {
        if (active) setNewBeneficiaries(beneficiaries);
      })
      .catch(() => {
        if (active) setWorkflowError({
          message: 'Synthetic beneficiaries could not be loaded. Retry after checking the backend.',
          canRetry: true,
        });
      });
    return () => {
      active = false;
    };
  }, []);

  // Judge Log & Metrics
  const [judgeLogs, setJudgeLogs] = useState<JudgeLogEvent[]>([]);
  const [turnLatencyMs, setTurnLatencyMs] = useState<number>(0);
  const [serviceHealth, setServiceHealth] = useState({
    gnani_key: false,
    llm_key: false,
    encryption_key: false,
    stt_ok: false,
    tts_ok: false,
    port: 3000,
  });
  const [healthAvailable, setHealthAvailable] = useState(false);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Backend health check failed');
      const health = await response.json();
      setServiceHealth(health);
      setHealthAvailable(true);
      const configResponse = await fetch('/api/config');
      if (configResponse.ok) {
        const config = await configResponse.json();
        setServerTestMode(config.testMode === true);
      }
    } catch {
      setHealthAvailable(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => void refreshHealth(), 60_000);
    return () => window.clearInterval(timer);
  }, [refreshHealth]);

  useEffect(() => {
    try {
      localStorage.setItem('asha_language', language);
      localStorage.setItem('asha_voice', voice);
    } catch {}
  }, [language, voice]);

  const healthOk = healthAvailable &&
    serviceHealth.gnani_key &&
    serviceHealth.llm_key &&
    serviceHealth.encryption_key &&
    serviceHealth.stt_ok &&
    serviceHealth.tts_ok;
  const missingKeys = [
    !serviceHealth.gnani_key && 'GNANI_API_KEY',
    !serviceHealth.llm_key && 'LLM_API_KEY',
    !serviceHealth.encryption_key && 'ENCRYPTION_KEY',
  ].filter(Boolean);
  const healthMessage = !healthAvailable
    ? 'Backend health check is unavailable. Restart the backend and retry.'
    : missingKeys.length
      ? missingKeys.map((key) => `${key} is missing. Put ${key} in the .env file in the project root, then restart the server.`).join(' ')
      : !serviceHealth.stt_ok || !serviceHealth.tts_ok
        ? 'Gnani Prisma or Timbre health check failed. Check GNANI_API_KEY and connectivity, then retry.'
        : 'A backend service check failed. Review server configuration and retry.';

  // Hooks
  const {
    speak,
    retry: retryTTS,
    stop: stopAudio,
    isPlaying,
    currentCaption,
    lastLatencyMs,
    error: ttsError,
    clearError: clearTTSError,
  } = useSpeechPlayer();

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

  const createSyntheticBeneficiary = useCallback((
    name: string,
    houseNo: string,
    category: 'ANC' | 'PNC',
    age = 0,
    village = 'Rampur'
  ) => {
    const existing = [...SYNTHETIC_ROSTER, ...newBeneficiaries].find(
      (beneficiary) =>
        beneficiary.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
        beneficiary.house_no === houseNo
    );
    if (existing) return existing;
    const created: BeneficiaryRecord = {
      id: `NEW-${Date.now()}`,
      name,
      house_no: houseNo || 'Unknown',
      village: village || 'Rampur',
      category,
      age,
      isNew: true,
    };
    setNewBeneficiaries((previous) => [...previous, created]);
    void fetch('/api/beneficiaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: created.name,
        house_no: created.house_no,
        village: created.village,
        category: created.category,
        age: created.age,
      }),
    })
      .then(async (response) => {
        const saved = await response.json();
        if (!response.ok) throw new Error(saved.error || 'Could not save synthetic beneficiary.');
        setNewBeneficiaries((previous) => previous.map((item) => item.id === created.id ? saved : item));
      })
      .catch((error) => {
        setWorkflowError({
          message: error instanceof Error ? error.message : 'Could not save synthetic beneficiary.',
          canRetry: true,
        });
      });
    return created;
  }, [newBeneficiaries]);
  const startRecordingRef = useRef<(lang: string) => Promise<void>>(async () => {});
  const saveRecordRef = useRef<() => Promise<void>>(async () => {});

  // Process completed spoken text
  const processUtterance = useCallback(
    async (spokenText: string) => {
      const pipelineStarted = performance.now();
      const pipelineUtterance = spokenText.trim();
      if (!pipelineUtterance) return;
      if (isPlaying && /^(no|nahi|illi|galat|correction)\b/i.test(pipelineUtterance)) {
        stopAudio();
      }
      try {
        setWorkflowError(null);
        const response = await fetch('/api/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: pipelineSessionIdRef.current,
            transcript: pipelineUtterance,
            language,
          }),
        });
        const result = await response.json() as PipelineTurnResponse & { error?: string };
        if (!response.ok) throw new Error(result.error || 'Visit pipeline failed.');

        visitTranscriptRef.current = result.transcript;
        setTranscript(result.transcript);
        setPipelineFields(result.fields);
        setExtractedJson(result.extracted);
        setDangerResult(result.danger);
        setActiveQuestion(result.questions[0] || null);
        awaitingSaveConfirmationRef.current = Boolean(result.read_back_text);
        setTurnLatencyMs(Math.round(performance.now() - pipelineStarted));
        setStepState(result.saved ? 'saved' : result.questions.length ? 'confirm' : 'checking');
        addJudgeLog('TURN_PIPELINE', result.rule, {
          source: result.test_mode ? 'mock text test' : 'Gnani Prisma v3.0',
          transcript: result.transcript,
          extracted: result.extracted,
          fields: result.fields,
          rule: result.rule,
          decision: result.danger.decision,
        });

        const field = (name: string) => result.fields[name];
        const value = (name: string) => field(name)?.value;
        const evidence = (name: string) => {
          const item = field(name);
          if (!item) return undefined;
          return {
            value: item.value,
            sourceText: item.evidence,
            detector: 'LLM' as const,
            timestamp: new Date().toLocaleTimeString(),
          };
        };
        setFormData((previous) => ({
          ...previous,
          beneficiaryName: typeof value('name') === 'string' ? value('name') as string : previous.beneficiaryName,
          beneficiaryId: typeof result.saved_record?.beneficiaryId === 'string'
            ? String(result.saved_record.beneficiaryId)
            : previous.beneficiaryId,
          houseNo: typeof value('houseNo') === 'string' ? value('houseNo') as string : previous.houseNo,
          visitType: ['ANC', 'PNC', 'immunisation'].includes(String(value('visitType')))
            ? value('visitType') as VisitFormData['visitType'] : previous.visitType,
          weight: typeof value('weight') === 'number' ? value('weight') as number : previous.weight,
          bpSystolic: typeof value('bpSystolic') === 'number' ? value('bpSystolic') as number : previous.bpSystolic,
          bpDiastolic: typeof value('bpDiastolic') === 'number' ? value('bpDiastolic') as number : previous.bpDiastolic,
          ifaStatus: typeof value('ifaStatus') === 'string' ? value('ifaStatus') as string : previous.ifaStatus,
          lastAncDate: typeof value('lastAncDate') === 'string' ? value('lastAncDate') as string : previous.lastAncDate,
          gestationalWeeks: typeof value('pregnancyMonths') === 'number'
            ? (value('pregnancyMonths') as number) * 4 : previous.gestationalWeeks,
          childAgeDays: typeof value('babyAgeDays') === 'number' ? value('babyAgeDays') as number : previous.childAgeDays,
          vaccinationsGiven: Array.isArray(value('vaccinationsGiven'))
            ? value('vaccinationsGiven') as string[] : previous.vaccinationsGiven,
          fieldStates: {
            beneficiary: field('name')?.state || previous.fieldStates.beneficiary,
            visitType: field('visitType')?.state || previous.fieldStates.visitType,
            weight: field('weight')?.state || previous.fieldStates.weight,
            bp: field('bpSystolic')?.state === 'uncertain' || field('bpDiastolic')?.state === 'uncertain'
              ? 'uncertain'
              : value('bpSystolic') !== null && value('bpDiastolic') !== null
                ? 'confirmed' : 'missing',
            ifa: field('ifaStatus')?.state || previous.fieldStates.ifa,
            vaccinations: field('vaccinationsGiven')?.state || 'missing',
          },
          evidenceTrail: {
            beneficiary: evidence('name'),
            weight: evidence('weight'),
            bp: evidence('bpSystolic'),
            ifa: evidence('ifaStatus'),
          },
        }));

        if (result.roster_label) {
          const rosterResponse = await fetch('/api/beneficiaries');
          if (rosterResponse.ok) setNewBeneficiaries(await rosterResponse.json());
        }
        if (result.saved && result.saved_record) {
          const record = result.saved_record;
          const savedVisit: SavedVisitRecord = {
            id: String(record.id || `REC-${Date.now()}`),
            timestamp: String(record.timestamp || new Date().toISOString()),
            beneficiaryName: String(record.beneficiaryName || value('name') || 'Unknown'),
            beneficiaryId: String(record.beneficiaryId || value('name') || 'Unknown'),
            village: String(record.village || 'Rampur'),
            houseNo: String(record.houseNo || value('houseNo') || 'Unknown'),
            visitType: String(record.visitType || value('visitType') || 'ANC'),
            weight: typeof record.weight === 'number' ? record.weight : null,
            bp: typeof record.bp === 'string' ? record.bp : null,
            isFlagged: record.isFlagged === true,
            flaggedSigns: result.danger.flaggedSigns,
            referralSlip: result.referral_slip || undefined,
            encryptedToken: result.encrypted_record || undefined,
            transcript: result.transcript,
            followups: result.followups,
          };
          setSavedRecords((previous) => [savedVisit, ...previous.filter((item) => item.id !== savedVisit.id)]);
          const stored = JSON.parse(localStorage.getItem('asha_saved_records') || '[]');
          localStorage.setItem('asha_saved_records', JSON.stringify([
            { id: savedVisit.id, timestamp: savedVisit.timestamp, encryptedToken: result.encrypted_record },
            ...(Array.isArray(stored) ? stored : []),
          ]));
          setSavedFollowups(result.followups);
        }

        if (result.answer_text) {
          const responseText = result.read_back_text || result.answer_text;
          const spokenText = result.saved && result.followups.length
            ? `${responseText} ${result.followups.map((item) => `${item.item}, due ${item.dueDate}`).join('. ')}`
            : responseText;
          if (result.read_back_text) void startRecordingRef.current(language);
          speak(spokenText, language, voice, () => {
            if (!result.read_back_text && !result.saved && result.questions.length) {
              void startRecordingRef.current(language);
            }
          });
        } else if (result.questions.length) {
          speak(result.questions[0], language, voice, () => {
            void startRecordingRef.current(language);
          });
        }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Visit pipeline failed.';
        setWorkflowError({ message, canRetry: true });
        setStepState('confirm');
        addJudgeLog('TURN_PIPELINE_ERROR', 'Backend turn pipeline failed.');
        return;
      }

    },
    [
      language,
      voice,
      speak,
      isPlaying,
      stopAudio,
      addJudgeLog,
    ]
  );

  const handleTranscriptChunk = useCallback(
    (text: string, isFinal: boolean, metadata?: any) => {
      setTranscript(text);
      if (metadata) {
        addJudgeLog('STT_CHUNK', `Transcript chunk from ${metadata.engine || 'Gnani'}`, metadata);
      }
      if (isFinal) {
        const finalText = text.trim();
        const isSpokenCorrection = /^(no|nahi|illi|galat|correction)\b/i.test(finalText) ||
          /change weight/i.test(finalText);
        const isSaveConfirmation = awaitingSaveConfirmationRef.current &&
          /^(yes|yeah|yep|correct|okay|ok|save|haan|हां|हाँ|ಹೌದು)\b/i.test(finalText);
        if (isPlaying && !isSpokenCorrection && !isSaveConfirmation) return;
        if (finalText && finalText !== lastProcessedTranscriptRef.current) {
          lastProcessedTranscriptRef.current = finalText;
          stopRecordingRef.current();
          void processUtterance(finalText);
        }
      }
    },
    [processUtterance, addJudgeLog, isPlaying]
  );

  const {
    isRecording,
    audioLevel,
    noiseMode,
    error: sttError,
    clearError: clearSTTError,
    startRecording,
    stopRecording,
  } = useAudioRecorder(handleTranscriptChunk);
  startRecordingRef.current = startRecording;
  stopRecordingRef.current = stopRecording;

  // Toggle Microphone
  const handleToggleMic = () => {
    // Barge-in: User tap or speaking interrupts agent speech instantly
    if (isPlaying) {
      stopAudio();
      addJudgeLog('BARGE_IN', 'Agent speech interrupted instantly by user');
      if (!isRecording) {
        setStepState('listening');
        void startRecording(language);
        return;
      }
    }

    if (isRecording) {
      stopRecording();
      if (transcript.trim() && transcript.trim() !== lastProcessedTranscriptRef.current) {
        lastProcessedTranscriptRef.current = transcript.trim();
        void processUtterance(transcript.trim());
      }
    } else {
      const currentLang = LANGUAGE_CATALOG[language] || LANGUAGE_CATALOG['en-IN'];
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
    pipelineSessionIdRef.current = `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPipelineFields({});
    awaitingSaveConfirmationRef.current = false;
    lastProcessedTranscriptRef.current = '';
    visitTranscriptRef.current = '';
    setTranscript(scenario.spokenText);
    setLanguage(scenario.language as LanguageCode);
    addJudgeLog('DEMO_SCENARIO_RUN', `${scenario.tag}: ${scenario.title}`);
    processUtterance(scenario.spokenText);
  };

  // Save Record
  const handleSaveRecord = async () => {
    await processUtterance('yes');
    return;
  };
  saveRecordRef.current = handleSaveRecord;

  // Next Beneficiary
  const handleNextBeneficiary = () => {
    stopAudio();
    pipelineSessionIdRef.current = `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPipelineFields({});
    awaitingSaveConfirmationRef.current = false;
    lastProcessedTranscriptRef.current = '';
    setFormData(INITIAL_FORM_DATA);
    setDangerResult(null);
    setTranscript('');
    visitTranscriptRef.current = '';
    setExtractedJson(null);
    setSavedFollowups(null);
    setActiveQuestion(null);
    setStepState('listening');
    addJudgeLog('NEXT_BENEFICIARY', 'Session reset for new home visit');
  };

  // Re-record
  const handleReRecord = () => {
    stopAudio();
    pipelineSessionIdRef.current = `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPipelineFields({});
    awaitingSaveConfirmationRef.current = false;
    lastProcessedTranscriptRef.current = '';
    setTranscript('');
    visitTranscriptRef.current = '';
    setDangerResult(null);
    setExtractedJson(null);
    setStepState('listening');
    handleToggleMic();
  };

  // Purge all data
  const handlePurgeAllData = () => {
    stopAudio();
    stopRecording();
    pipelineSessionIdRef.current = `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPipelineFields({});
    awaitingSaveConfirmationRef.current = false;
    lastProcessedTranscriptRef.current = '';
    visitTranscriptRef.current = '';
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
    void fetch('/api/beneficiaries', { method: 'DELETE' })
      .then((response) => {
        if (!response.ok) throw new Error('Could not purge synthetic beneficiaries.');
        setNewBeneficiaries([]);
      })
      .catch(() => setWorkflowError({
        message: 'Synthetic beneficiaries could not be purged from the backend.',
        canRetry: true,
      }));
    addJudgeLog('PURGE_COMPLETE', 'All patient records and transcripts purged for Responsible AI compliance');
  };

  const currentLangObj = LANGUAGE_CATALOG[language] || LANGUAGE_CATALOG['en-IN'];
  const activeError = sttError || ttsError || workflowError;

  return (
    <div
      className={`min-h-screen bg-slate-50 text-gray-900 flex flex-col font-sans ${
        textSize === 'large' ? 'text-base' : textSize === 'xl' ? 'text-lg' : 'text-sm'
      }`}
    >
      {/* Test Mode Warning Banner */}
      {serverTestMode && (
        <div className="bg-amber-500 text-amber-950 font-bold px-4 py-1.5 text-xs flex items-center justify-between shadow-sm sticky top-0 z-40">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-950" />
            <span>TEST MODE: Mock text extraction active; live Gnani voice path is unchanged.</span>
          </div>
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
        healthOk={healthOk}
        healthMessage={healthMessage}
        onRetryHealth={() => void refreshHealth()}
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
                    if (ttsError) {
                      clearTTSError();
                      retryTTS();
                    } else {
                      clearSTTError();
                      handleToggleMic();
                    }
                  }}
                  className="px-3 py-1 bg-red-600 text-white rounded-lg font-bold text-xs flex items-center gap-1 hover:bg-red-700 active:scale-95 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  {ttsError ? 'Retry TTS' : 'Retry Voice Call'}
                </button>
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
                    ? `${formData.beneficiaryName}${formData.beneficiaryId
                      ? ` (${formData.beneficiaryId})`
                      : formData.houseNo ? ` (House ${formData.houseNo})` : ''}`
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
                value={formData.ifaTablets ?? formData.ifaStatus}
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

              {[
                ['age', 'Age'],
                ['beneficiaryType', 'Beneficiary Type'],
                ['pregnancyMonths', 'Months Pregnant'],
                ['babyAgeDays', 'Baby Age (days)'],
                ['houseNo', 'House Number'],
                ['hemoglobin', 'Haemoglobin'],
                ['lastAncDate', 'Last ANC Date'],
                ['ttStatus', 'TT / Td Doses'],
                ['ttLastDoseDate', 'Last TT / Td Dose Date'],
                ['symptoms', 'Symptoms'],
                ['notes', 'Other Notes'],
              ].map(([key, label]) => {
                const item = pipelineFields[key];
                const itemValue = item?.value;
                const displayValue = Array.isArray(itemValue)
                  ? itemValue.map((symptom) =>
                      typeof symptom === 'object' && symptom !== null
                        ? `${(symptom as { negated?: boolean }).negated ? 'No ' : ''}${(symptom as { canonicalId?: string }).canonicalId || 'symptom'}`
                        : String(symptom)
                    ).join(', ')
                  : typeof itemValue === 'object' && itemValue !== null
                    ? JSON.stringify(itemValue)
                    : typeof itemValue === 'string' || typeof itemValue === 'number'
                      ? itemValue
                      : null;
                const evidence = item ? {
                  value: item.value,
                  sourceText: item.evidence,
                  detector: 'LLM' as const,
                  timestamp: new Date().toLocaleTimeString(),
                } : undefined;
                return (
                  <FieldCard
                    key={key}
                    label={label}
                    value={displayValue}
                    state={item?.state || 'missing'}
                    evidence={evidence}
                    icon={<Activity className="w-5 h-5" />}
                    onTap={() => setSelectedPipelineField({ key, label })}
                  />
                );
              })}
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
        {activeTab === 'records' && (
          <RecordsScreen
            records={savedRecords}
            beneficiaries={newBeneficiaries}
            onAddBeneficiary={(name, houseNo, category) => {
              const beneficiary = createSyntheticBeneficiary(name, houseNo, category);
              addJudgeLog('NEW_BENEFICIARY_ADDED', `New synthetic/demo beneficiary ${beneficiary.name} added.`);
            }}
          />
        )}

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
      {selectedPipelineField && (
        <EvidenceModal
          isOpen={true}
          onClose={() => setSelectedPipelineField(null)}
          fieldName={selectedPipelineField.label}
          currentValue={(() => {
            const value = pipelineFields[selectedPipelineField.key]?.value;
            return typeof value === 'string' || typeof value === 'number' ? value : '';
          })()}
          state={pipelineFields[selectedPipelineField.key]?.state || 'missing'}
          evidence={pipelineFields[selectedPipelineField.key] ? {
            value: pipelineFields[selectedPipelineField.key].value,
            sourceText: pipelineFields[selectedPipelineField.key].evidence,
            detector: 'LLM',
            timestamp: new Date().toLocaleTimeString(),
          } : undefined}
          onUpdateValue={(newValue) => {
            const fieldKey = selectedPipelineField.key;
            setPipelineFields((previous) => ({
              ...previous,
              [fieldKey]: {
                value: newValue,
                state: 'confirmed',
                evidence: previous[fieldKey]?.evidence || 'Manual keypad correction',
              },
            }));
            void fetch('/api/turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id: pipelineSessionIdRef.current,
                transcript: '',
                language,
                corrections: { [fieldKey]: newValue },
              }),
            }).then(async (response) => {
              const result = await response.json() as PipelineTurnResponse & { error?: string };
              if (!response.ok) throw new Error(result.error || 'Could not apply field correction.');
              setPipelineFields(result.fields);
              setDangerResult(result.danger);
              setActiveQuestion(result.questions[0] || null);
              awaitingSaveConfirmationRef.current = Boolean(result.read_back_text);
              if (result.read_back_text) {
                void startRecordingRef.current(language);
                speak(result.read_back_text, language, voice);
              } else if (result.answer_text) {
                speak(result.answer_text, language, voice, () => {
                  if (result.questions.length) void startRecordingRef.current(language);
                });
              }
            }).catch((error) => {
              setWorkflowError({
                message: error instanceof Error ? error.message : 'Could not apply field correction.',
                canRetry: true,
              });
            });
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
