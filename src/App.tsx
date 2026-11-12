/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  UserCheck,
  Scale,
  Activity,
  Pill,
  Syringe,
  Save,
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
  DangerSignAlert,
} from './types';

import { LANGUAGE_CATALOG } from './data/languageData';
import { DangerEngineResult } from './types';

import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useSpeechPlayer } from './hooks/useSpeechPlayer';

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
import { RecordsScreen } from './components/RecordsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { OnboardingHints } from './components/OnboardingHints';

interface PipelineField {
  value: unknown;
  state: 'confirmed' | 'uncertain' | 'missing';
  evidence: string;
  detector?: 'LLM' | 'rule_engine' | 'number_normalizer' | 'manual_edit';
  previousValues?: Array<{ value: unknown; timestamp: string; evidence: string }>;
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
  duplicate_candidates: BeneficiaryRecord[];
  rule: string;
  llm_status: 'ready' | 'retried' | 'busy';
  extraction_status: {
    provider: 'Gemini' | 'Groq' | 'Rules';
    model: string | null;
    failedProviders: Array<{ provider: 'Gemini' | 'Groq'; status: string }>;
    providerLatencyMs: { Gemini: number; Groq: number };
    totalLatencyMs: number;
    llmCalls: number;
  } | null;
}

function formDataFromPipeline(fields: Record<string, PipelineField>): VisitFormData {
  const value = (key: string) => fields[key]?.value;
  const number = (key: string): number | null => typeof value(key) === 'number' ? value(key) as number : null;
  const text = (key: string): string | null => typeof value(key) === 'string' ? value(key) as string : null;
  const state = (key: string): 'confirmed' | 'uncertain' | 'missing' => fields[key]?.state || 'missing';
  const evidence = (key: string) => {
    const item = fields[key];
    if (!item) return undefined;
    return {
      value: item.value,
      sourceText: item.evidence,
      detector: item.detector || 'rule_engine',
      timestamp: new Date().toLocaleTimeString(),
      previousValues: item.previousValues?.map((previous) => ({
        value: previous.value,
        timestamp: previous.timestamp,
        reason: previous.evidence,
      })),
    };
  };
  const vaccinations = value('vaccinationsGiven');
  const due = value('vaccinationsDue');
  const systolic = number('bpSystolic');
  const diastolic = number('bpDiastolic');
  const pregnancyWeeks = number('gestationalWeeks');

  return {
    beneficiaryName: text('name'),
    beneficiaryId: text('beneficiaryId'),
    houseNo: text('houseNo'),
    village: text('village'),
    visitType: ['ANC', 'PNC', 'immunisation'].includes(String(value('visitType')))
      ? value('visitType') as VisitFormData['visitType'] : null,
    gestationalWeeks: pregnancyWeeks,
    childAgeDays: number('babyAgeDays'),
    weight: number('weight'),
    weightRaw: fields.weight?.evidence || null,
    bpSystolic: systolic,
    bpDiastolic: diastolic,
    ifaTablets: number('ifaTablets'),
    ifaStatus: text('ifaStatus'),
    vaccinationsGiven: Array.isArray(vaccinations) ? vaccinations as string[] : [],
    vaccinationsDue: Array.isArray(due) ? due as string[] : [],
    lastAncDate: text('lastAncDate'),
    fieldStates: {
      beneficiary: state('name'),
      visitType: state('visitType'),
      weight: state('weight'),
      bp: state('bpSystolic') === 'uncertain' || state('bpDiastolic') === 'uncertain'
        ? 'uncertain'
        : systolic !== null && diastolic !== null ? 'confirmed' : 'missing',
      ifa: state('ifaStatus'),
      vaccinations: state('vaccinationsGiven'),
    },
    evidenceTrail: {
      beneficiary: evidence('name'),
      visitType: evidence('visitType'),
      weight: evidence('weight'),
      bp: evidence('bpSystolic'),
      ifa: evidence('ifaStatus'),
      vaccinations: evidence('vaccinationsGiven'),
    },
  };
}

function toSavedVisitRecord(record: Record<string, unknown>): SavedVisitRecord {
  const followups = Array.isArray(record.followups) ? record.followups as FollowupItem[] : [];
  const number = (key: string) => typeof record[key] === 'number' ? record[key] as number : null;
  const text = (key: string) => typeof record[key] === 'string' ? record[key] as string : null;
  return {
    id: String(record.id),
    timestamp: String(record.timestamp || ''),
    beneficiaryName: String(record.beneficiaryName || ''),
    beneficiaryId: String(record.beneficiaryId || ''),
    village: String(record.village || ''),
    houseNo: String(record.houseNo || ''),
    visitType: String(record.visitType || ''),
    visitDate: text('visitDate') || undefined,
    age: number('age'),
    pregnancyMonths: number('pregnancyMonths'),
    gestationalWeeks: number('gestationalWeeks'),
    babyAgeDays: number('babyAgeDays'),
    weight: number('weight'),
    bp: typeof record.bp === 'string' ? record.bp : null,
    hemoglobin: number('hemoglobin'),
    ifaStatus: text('ifaStatus'),
    ifaTablets: number('ifaTablets'),
    lastAncDate: text('lastAncDate'),
    ttStatus: text('ttStatus'),
    ttLastDoseDate: text('ttLastDoseDate'),
    vaccinationsGiven: Array.isArray(record.vaccinationsGiven)
      ? record.vaccinationsGiven.filter((value): value is string => typeof value === 'string')
      : [],
    symptoms: Array.isArray(record.symptoms) ? record.symptoms as Array<Record<string, unknown>> : [],
    notes: text('notes'),
    isFlagged: record.isFlagged === true,
    flaggedSigns: Array.isArray(record.flaggedSigns) ? record.flaggedSigns as DangerSignAlert[] : [],
    referralSlip: typeof record.referralSlip === 'string' ? record.referralSlip : undefined,
    transcript: String(record.transcript || ''),
    followups,
  };
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
  const [serverTestMode, setServerTestMode] = useState(false);

  // Visit State
  const [stepState, setStepState] = useState<StepState>('listening');
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
  const [beneficiarySearch, setBeneficiarySearch] = useState('');
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [selectedPipelineField, setSelectedPipelineField] = useState<{ key: string; label: string } | null>(null);
  const pipelineSessionIdRef = useRef(`visit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [workflowError, setWorkflowError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const stopRecordingRef = useRef<() => void>(() => {});
  const lastProcessedTranscriptRef = useRef('');
  const awaitingSaveConfirmationRef = useRef(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/records')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Saved visits could not be loaded.');
        return data as Array<Record<string, unknown>>;
      })
      .then((records) => {
        if (!active) return;
        setSavedRecords(records.map(toSavedVisitRecord));
      })
      .catch((error) => {
        if (active) setWorkflowError({
          message: error instanceof Error ? error.message : 'Saved visits could not be loaded.',
          canRetry: true,
        });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch('/api/beneficiaries')
      .then(async (response) => {
        if (!response.ok) throw new Error('Beneficiaries could not be loaded.');
        return response.json();
      })
      .then((beneficiaries: BeneficiaryRecord[]) => {
        if (active) setNewBeneficiaries(beneficiaries);
      })
      .catch(() => {
        if (active) setWorkflowError({
          message: 'Beneficiaries could not be loaded. Retry after checking the backend.',
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

  const formData = useMemo(() => formDataFromPipeline(pipelineFields), [pipelineFields]);

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
        : 'Voice services and encrypted storage are ready.';

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

  const createBeneficiary = useCallback(async (
    name: string,
    houseNo: string,
    category: 'ANC' | 'PNC',
    village: string,
    age: number | null = null
  ): Promise<boolean> => {
    const existing = newBeneficiaries.find(
      (beneficiary) =>
        beneficiary.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
        beneficiary.house_no === houseNo &&
        beneficiary.village.toLocaleLowerCase() === village.toLocaleLowerCase()
    );
    if (existing) return true;
    try {
      const response = await fetch('/api/beneficiaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, house_no: houseNo, village, category, age }),
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || 'Could not save beneficiary.');
      setNewBeneficiaries((previous) =>
        previous.some((item) => item.id === saved.id) ? previous : [...previous, saved]
      );
      setWorkflowError(null);
      return true;
    } catch (error) {
      setWorkflowError({
        message: error instanceof Error ? error.message : 'Could not save beneficiary.',
        canRetry: true,
      });
      return false;
    }
  }, [newBeneficiaries]);
  const startRecordingRef = useRef<(lang: string) => Promise<void>>(async () => {});

  // Process completed spoken text
  const processUtterance = useCallback(
    async (spokenText: string) => {
      const pipelineStarted = performance.now();
      const pipelineUtterance = spokenText.trim();
      if (!pipelineUtterance) return;
      setReadyToConfirm(false);
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

        setTranscript(result.transcript);
        setPipelineFields(result.fields);
        setExtractedJson({
          ...result.extracted,
          llm_status: result.llm_status,
          extraction_status: result.extraction_status,
        });
        setDangerResult(result.danger);
        setActiveQuestion(result.questions[0] || null);
        awaitingSaveConfirmationRef.current = Boolean(result.read_back_text);
        setReadyToConfirm(Boolean(result.read_back_text) && !result.saved);
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
        if (result.llm_status !== 'ready') {
          const statusMessage = result.llm_status === 'busy'
            ? 'LLM unavailable; transcript retained'
            : result.extraction_status?.provider === 'Rules'
              ? 'Rule-based extraction fallback used'
              : 'LLM fallback used';
          addJudgeLog('LLM_RETRY', statusMessage, {
            status: result.llm_status,
            model: result.extracted.modelUsed,
          });
        }

        if (result.roster_label) {
          const rosterResponse = await fetch('/api/beneficiaries');
          if (rosterResponse.ok) setNewBeneficiaries(await rosterResponse.json());
        }
        if (result.duplicate_candidates.length) {
          setDisambiguationState({
            isOpen: true,
            promptText: result.questions[0] || 'Select the beneficiary for this visit.',
            candidates: result.duplicate_candidates,
          });
        }
        if (result.saved && result.saved_record) {
          const savedVisit = toSavedVisitRecord(result.saved_record);
          setSavedRecordId(savedVisit.id);
          setSavedRecords((previous) => [savedVisit, ...previous.filter((item) => item.id !== savedVisit.id)]);
          setSavedFollowups(result.followups);
        }

        if (result.answer_text) {
          const responseText = result.read_back_text || result.answer_text;
          const spokenText = result.saved && result.followups.length
            ? `${responseText} ${result.followups.map((item) => `${item.item}, due ${item.dueDate}`).join('. ')}`
            : responseText;
          speak(spokenText, language, voice, () => {
            if (!result.saved && result.questions.length) {
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

  const submitCorrections = useCallback(async (corrections: Record<string, unknown>) => {
    try {
      const response = await fetch('/api/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: pipelineSessionIdRef.current,
          transcript: '',
          language,
          corrections,
        }),
      });
      const result = await response.json() as PipelineTurnResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not apply field correction.');
      setPipelineFields(result.fields);
      setDangerResult(result.danger);
      setActiveQuestion(result.questions[0] || null);
      awaitingSaveConfirmationRef.current = Boolean(result.read_back_text);
      setReadyToConfirm(Boolean(result.read_back_text) && !result.saved);
      setStepState(result.saved ? 'saved' : result.questions.length ? 'confirm' : 'checking');
      if (result.read_back_text || result.answer_text) {
        speak(result.read_back_text || result.answer_text || '', language, voice, () => {
          if (!result.saved && result.questions.length) void startRecordingRef.current(language);
        });
      }
    } catch (error) {
      setWorkflowError({
        message: error instanceof Error ? error.message : 'Could not apply field correction.',
        canRetry: true,
      });
    }
  }, [language, speak, voice]);

  const updateFollowup = useCallback(async (
    recordId: string,
    followupId: string,
    completed: boolean
  ) => {
    try {
      const response = await fetch(
        `/api/records/${encodeURIComponent(recordId)}/followups/${encodeURIComponent(followupId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update follow-up.');
      const record = toSavedVisitRecord(result);
      setSavedRecords((previous) => previous.map((item) => item.id === record.id ? record : item));
      if (record.id === savedRecordId) setSavedFollowups(record.followups);
    } catch (error) {
      setWorkflowError({
        message: error instanceof Error ? error.message : 'Could not update follow-up.',
        canRetry: true,
      });
    }
  }, [savedRecordId]);

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

  // Save Record
  const handleSaveRecord = async () => {
    if (!readyToConfirm) return;
    await processUtterance('yes');
    return;
  };

  // Next Beneficiary
  const handleNextBeneficiary = () => {
    stopAudio();
    pipelineSessionIdRef.current = `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPipelineFields({});
    awaitingSaveConfirmationRef.current = false;
    lastProcessedTranscriptRef.current = '';
    setDangerResult(null);
    setTranscript('');
    setExtractedJson(null);
    setSavedFollowups(null);
    setSavedRecordId(null);
    setReadyToConfirm(false);
    setBeneficiarySearch('');
    setActiveQuestion(null);
    setStepState('listening');
    addJudgeLog('NEXT_BENEFICIARY', 'Session reset for new home visit');
  };

  // Re-record
  const handleReRecord = () => {
    stopAudio();
    pipelineSessionIdRef.current = `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPipelineFields({});
    setSavedFollowups(null);
    setSavedRecordId(null);
    setReadyToConfirm(false);
    awaitingSaveConfirmationRef.current = false;
    lastProcessedTranscriptRef.current = '';
    setTranscript('');
    setDangerResult(null);
    setExtractedJson(null);
    setStepState('listening');
    handleToggleMic();
  };

  const handleCancelVisit = () => {
    stopAudio();
    stopRecording();
    void fetch(`/api/turn/${encodeURIComponent(pipelineSessionIdRef.current)}`, { method: 'DELETE' });
    handleNextBeneficiary();
  };

  // Purge all data
  const handlePurgeAllData = async (): Promise<boolean> => {
    const activeSessionId = pipelineSessionIdRef.current;
    stopAudio();
    stopRecording();
    pipelineSessionIdRef.current = `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPipelineFields({});
    awaitingSaveConfirmationRef.current = false;
    lastProcessedTranscriptRef.current = '';
    setDangerResult(null);
    setTranscript('');
    setExtractedJson(null);
    setSavedFollowups(null);
    setSavedRecordId(null);
    setReadyToConfirm(false);
    setJudgeLogs([]);
    try {
      localStorage.removeItem('asha_hints_dismissed');
    } catch {}
    try {
      const responses = await Promise.all([
        fetch(`/api/turn/${encodeURIComponent(activeSessionId)}`, { method: 'DELETE' }),
        fetch('/api/beneficiaries', { method: 'DELETE' }),
        fetch('/api/records', { method: 'DELETE' }),
      ]);
      if (responses.some((response) => !response.ok)) {
        throw new Error('One or more register items could not be deleted from the server.');
      }
      setSavedRecords([]);
      setNewBeneficiaries([]);
      setWorkflowError(null);
      return true;
    } catch (error) {
      setWorkflowError({
        message: error instanceof Error ? error.message : 'Register data could not be deleted.',
        canRetry: true,
      });
      return false;
    }
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

            <section className="p-3 bg-white rounded-xl border border-gray-200 space-y-2">
              <label htmlFor="beneficiary-search" className="block text-sm font-bold text-gray-800">
                Select a beneficiary
              </label>
              <input
                id="beneficiary-search"
                value={beneficiarySearch}
                onChange={(event) => setBeneficiarySearch(event.target.value)}
                placeholder="Search name, ID, village or house number"
                className="w-full px-3 py-3 rounded-lg border border-gray-300 text-base"
              />
              {beneficiarySearch.trim() && (
                <div className="max-h-44 overflow-y-auto space-y-1">
                  {newBeneficiaries
                    .filter((beneficiary) => [
                      beneficiary.name,
                      beneficiary.id,
                      beneficiary.village,
                      beneficiary.house_no,
                    ].some((value) => value.toLocaleLowerCase().includes(beneficiarySearch.toLocaleLowerCase())))
                    .slice(0, 8)
                    .map((beneficiary) => (
                      <button
                        key={beneficiary.id}
                        type="button"
                        onClick={() => {
                          setBeneficiarySearch(`${beneficiary.name} · ${beneficiary.id}`);
                          void submitCorrections({
                            name: beneficiary.name,
                            beneficiaryId: beneficiary.id,
                            houseNo: beneficiary.house_no,
                            village: beneficiary.village,
                            ...(beneficiary.age !== null ? { age: beneficiary.age } : {}),
                            beneficiaryType: beneficiary.category === 'ANC' ? 'pregnant_woman' : 'mother',
                          });
                        }}
                        className="w-full p-2 text-left rounded-lg bg-teal-50 hover:bg-teal-100 text-sm"
                      >
                        <strong>{beneficiary.name}</strong> · {beneficiary.id} · House {beneficiary.house_no}, {beneficiary.village}
                      </button>
                    ))}
                </div>
              )}
            </section>

            {/* Step Tracker */}
            <StepTracker currentStep={stepState} />
            {activeQuestion && (
              <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-950" aria-live="polite">
                {activeQuestion}
              </p>
            )}

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
                value={formData.vaccinationsGiven.length ? formData.vaccinationsGiven.join(', ') : null}
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
                ['village', 'Village'],
                ['visitDate', 'Visit Date'],
                ['gestationalWeeks', 'Gestational Weeks'],
                ['hemoglobin', 'Haemoglobin'],
                ['lastAncDate', 'Last ANC Date'],
                ['ttStatus', 'TT / Td Doses'],
                ['ttLastDoseDate', 'Last TT / Td Dose Date'],
                ['ifaTablets', 'IFA Tablet Quantity'],
                ['vaccinationsDue', 'Vaccinations Due'],
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
                  detector: item.detector || 'rule_engine',
                  timestamp: new Date().toLocaleTimeString(),
                  previousValues: item.previousValues?.map((previous) => ({
                    value: previous.value,
                    timestamp: previous.timestamp,
                    reason: previous.evidence,
                  })),
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
                beneficiaryName={formData.beneficiaryName || ''}
                beneficiaryId={formData.beneficiaryId || ''}
                followups={savedFollowups}
                onNextBeneficiary={handleNextBeneficiary}
                onViewRecords={() => setActiveTab('records')}
                onCompleteFollowup={(followupId, completed) =>
                  savedRecordId ? updateFollowup(savedRecordId, followupId, completed) : Promise.resolve()
                }
              />
            )}

            {/* Bottom Actions Bar */}
            {!savedFollowups && (
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSaveRecord}
                  disabled={!readyToConfirm}
                  className="flex-1 min-w-40 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  Confirm and save
                </button>
                <button
                  onClick={() => {
                    const uncertain = Object.entries(pipelineFields).find(([, item]) => item.state === 'uncertain');
                    const key = uncertain?.[0] || 'weight';
                    setSelectedPipelineField({ key, label: key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase()) });
                  }}
                  className="flex-1 min-w-36 py-3 px-3 rounded-xl bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-semibold text-sm transition"
                >
                  Correct information
                </button>
                <button
                  onClick={handleCancelVisit}
                  className="py-3 px-3 rounded-xl bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-semibold text-sm transition"
                >
                  Cancel visit
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
            onCompleteFollowup={updateFollowup}
            onAddBeneficiary={async (name, houseNo, village, category) => {
              const added = await createBeneficiary(name, houseNo, category, village);
              if (added) addJudgeLog('NEW_BENEFICIARY_ADDED', `Beneficiary ${name} registered.`);
              return added;
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
            let corrections: Record<string, unknown>;
            if (selectedFieldModal.fieldKey === 'bp') {
              const match = String(newVal).match(/^\s*(\d{2,3})\s*(?:\/|by)\s*(\d{2,3})\s*$/i);
              if (!match) {
                setWorkflowError({ message: 'Enter blood pressure as systolic/diastolic, for example 110/70.', canRetry: true });
                return;
              }
              corrections = { bpSystolic: Number(match[1]), bpDiastolic: Number(match[2]) };
            } else if (selectedFieldModal.fieldKey === 'beneficiary') {
              corrections = { name: newVal };
            } else if (selectedFieldModal.fieldKey === 'ifa') {
              corrections = typeof newVal === 'number' ? { ifaTablets: newVal } : { ifaStatus: newVal };
            } else if (selectedFieldModal.fieldKey === 'vaccinations') {
              corrections = { vaccinationsGiven: String(newVal).split(',').map((item) => item.trim()).filter(Boolean) };
            } else {
              corrections = { [selectedFieldModal.fieldKey]: newVal };
            }
            void submitCorrections(corrections);
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
            detector: pipelineFields[selectedPipelineField.key].detector || 'rule_engine',
            timestamp: new Date().toLocaleTimeString(),
            previousValues: pipelineFields[selectedPipelineField.key].previousValues?.map((previous) => ({
              value: previous.value,
              timestamp: previous.timestamp,
              reason: previous.evidence,
            })),
          } : undefined}
          onUpdateValue={(newValue) => {
            const fieldKey = selectedPipelineField.key;
            void submitCorrections({ [fieldKey]: newValue });
          }}
        />
      )}

      {/* Disambiguation Modal for Duplicate Names */}
      <DisambiguationModal
        isOpen={disambiguationState.isOpen}
        promptText={disambiguationState.promptText}
        candidates={disambiguationState.candidates}
        onSelectCandidate={(cand) => {
          void submitCorrections({
            name: cand.name,
            beneficiaryId: cand.id,
            houseNo: cand.house_no,
            village: cand.village,
            ...(cand.age !== null ? { age: cand.age } : {}),
            beneficiaryType: cand.category === 'ANC' ? 'pregnant_woman' : 'mother',
          });
          setDisambiguationState({ isOpen: false, promptText: '', candidates: [] });
          addJudgeLog('DISAMBIGUATION_RESOLVED', `Selected ${cand.name} (House ${cand.house_no})`);
        }}
        onCancel={() => setDisambiguationState({ isOpen: false, promptText: '', candidates: [] })}
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
