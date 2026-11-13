/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  UserCheck,
  CheckCircle2,
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
  PlayCircle,
  RotateCcw,
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
  beneficiary_result: {
    status: 'created' | 'existing';
    beneficiary: BeneficiaryRecord;
  } | null;
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

function getFieldUpdateMessages(
  previous: Record<string, PipelineField>,
  next: Record<string, PipelineField>
): string[] {
  const labels: Record<string, string> = {
    name: 'Patient',
    age: 'Age',
    visitType: 'Visit type',
    weight: 'Weight',
    bpSystolic: 'Blood pressure',
    hemoglobin: 'Haemoglobin',
    lastAncDate: 'Last ANC date',
    ttStatus: 'TT/Td status',
    ifaStatus: 'IFA status',
    vaccinationsGiven: 'Vaccinations',
  };
  return Object.entries(next).flatMap(([key, field]) => {
    if (field.value === null || field.value === undefined) return [];
    const oldValue = previous[key]?.value;
    if (JSON.stringify(oldValue) === JSON.stringify(field.value)) return [];
    const label = labels[key] || key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase());
    const format = (value: unknown) => Array.isArray(value) ? value.join(', ') : String(value);
    return [oldValue === null || oldValue === undefined
      ? `${label} added: ${format(field.value)}`
      : `${label} updated: ${format(oldValue)} → ${format(field.value)}`];
  });
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
  const [demoMode, setDemoMode] = useState(false);
  const [demoStage, setDemoStage] = useState<'idle' | 'running' | 'complete'>('idle');
  const demoModeRef = useRef(false);

  // Visit State
  const [stepState, setStepState] = useState<StepState>('start');
  const [visitStarted, setVisitStarted] = useState(false);
  const [dangerResult, setDangerResult] = useState<DangerEngineResult | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [fieldUpdates, setFieldUpdates] = useState<string[]>([]);
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
  const [beneficiaryNotice, setBeneficiaryNotice] = useState<PipelineTurnResponse['beneficiary_result']>(null);
  const beneficiaryNoticeKeysRef = useRef(new Set<string>());
  const beneficiaryNoticeTimeoutRef = useRef<number | null>(null);
  const [pipelineFields, setPipelineFields] = useState<Record<string, PipelineField>>({});
  const pipelineFieldsRef = useRef(pipelineFields);
  const [beneficiarySearch, setBeneficiarySearch] = useState('');
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [selectedPipelineField, setSelectedPipelineField] = useState<{ key: string; label: string } | null>(null);
  const pipelineSessionIdRef = useRef(`visit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [workflowError, setWorkflowError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const stopRecordingRef = useRef<() => void>(() => {});
  const lastProcessedTranscriptRef = useRef('');
  const awaitingSaveConfirmationRef = useRef(false);
  const previewTimerRef = useRef<number | null>(null);
  const previewRequestIdRef = useRef(0);

  useEffect(() => {
    pipelineFieldsRef.current = pipelineFields;
  }, [pipelineFields]);

  useEffect(() => {
    demoModeRef.current = demoMode;
  }, [demoMode]);

  useEffect(() => () => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    if (beneficiaryNoticeTimeoutRef.current !== null) {
      window.clearTimeout(beneficiaryNoticeTimeoutRef.current);
    }
  }, []);

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
      const saveAttempt = awaitingSaveConfirmationRef.current &&
        /^(yes|yeah|yep|correct|okay|ok|save|haan|हां|हाँ|ಹೌದು)\b/i.test(pipelineUtterance);
      if (!saveAttempt) setReadyToConfirm(false);
      setStepState('checking');
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
        const updates = getFieldUpdateMessages(pipelineFieldsRef.current, result.fields);
        if (updates.length) setFieldUpdates(updates);
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
        setStepState(result.saved ? 'saved' : result.read_back_text ? 'confirm' : 'checking');
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

        if (result.beneficiary_result) {
          const noticeKey = `${result.session_id}:${result.beneficiary_result.beneficiary.id}`;
          if (!beneficiaryNoticeKeysRef.current.has(noticeKey)) {
            beneficiaryNoticeKeysRef.current.add(noticeKey);
            setBeneficiaryNotice(result.beneficiary_result);
            if (beneficiaryNoticeTimeoutRef.current !== null) {
              window.clearTimeout(beneficiaryNoticeTimeoutRef.current);
            }
            beneficiaryNoticeTimeoutRef.current = window.setTimeout(() => {
              setBeneficiaryNotice(null);
              beneficiaryNoticeTimeoutRef.current = null;
            }, 7000);
          }
        }
        if (result.roster_label === 'created') {
          void fetch('/api/beneficiaries').then(async (rosterResponse) => {
            if (rosterResponse.ok) setNewBeneficiaries(await rosterResponse.json());
          }).catch(() => {
            if (!demoModeRef.current) {
              setWorkflowError({
                message: 'Patient was saved, but the roster could not be refreshed.',
                canRetry: true,
              });
            }
          });
        }
        if (result.duplicate_candidates.length) {
          setDisambiguationState({
            isOpen: true,
            promptText: result.questions[0] || 'Select the patient for this visit.',
            candidates: result.duplicate_candidates,
          });
        }
        if (result.saved && result.saved_record) {
          const savedVisit = toSavedVisitRecord(result.saved_record);
          setSavedRecordId(savedVisit.id);
          setSavedRecords((previous) => [savedVisit, ...previous.filter((item) => item.id !== savedVisit.id)]);
          setSavedFollowups(result.followups);
          setWorkflowError(null);
        }

        if (result.answer_text) {
          const responseText = result.read_back_text || result.answer_text;
          const spokenText = result.saved && result.followups.length
            ? `${responseText} ${result.followups.map((item) => `${item.item}, due ${item.dueDate}`).join('. ')}`
            : responseText;
          speak(spokenText, language, voice, () => {
            if (!demoModeRef.current && !result.saved && result.questions.length) {
              void startRecordingRef.current(language);
            }
          });
        } else if (result.questions.length) {
          speak(result.questions[0], language, voice, () => {
            if (!demoModeRef.current) void startRecordingRef.current(language);
          });
        }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Visit pipeline failed.';
        setWorkflowError({ message, canRetry: true });
        setReadyToConfirm(saveAttempt);
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
      const updates = getFieldUpdateMessages(pipelineFieldsRef.current, result.fields);
      if (updates.length) setFieldUpdates(updates);
      setPipelineFields(result.fields);
      setDangerResult(result.danger);
      setActiveQuestion(result.questions[0] || null);
      awaitingSaveConfirmationRef.current = Boolean(result.read_back_text);
      setReadyToConfirm(Boolean(result.read_back_text) && !result.saved);
      setStepState(result.saved ? 'saved' : result.read_back_text ? 'confirm' : 'checking');
      if (result.read_back_text || result.answer_text) {
        speak(result.read_back_text || result.answer_text || '', language, voice, () => {
          if (!demoModeRef.current && !result.saved && result.questions.length) void startRecordingRef.current(language);
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

  const retryWorkflow = async () => {
    if (readyToConfirm && awaitingSaveConfirmationRef.current) {
      await processUtterance('yes');
      return;
    }
    try {
      const [recordsResponse, beneficiariesResponse] = await Promise.all([
        fetch('/api/records'),
        fetch('/api/beneficiaries'),
      ]);
      const records = await recordsResponse.json();
      const beneficiaries = await beneficiariesResponse.json();
      if (!recordsResponse.ok) throw new Error(records.error || 'Saved visits could not be loaded.');
      if (!beneficiariesResponse.ok) throw new Error(beneficiaries.error || 'Beneficiaries could not be loaded.');
      setSavedRecords((records as Array<Record<string, unknown>>).map(toSavedVisitRecord));
      setNewBeneficiaries(beneficiaries as BeneficiaryRecord[]);
      setWorkflowError(null);
    } catch (error) {
      setWorkflowError({
        message: error instanceof Error ? error.message : 'The visit register could not be refreshed.',
        canRetry: true,
      });
    }
  };

  const handleTranscriptChunk = useCallback(
    (text: string, isFinal: boolean, metadata?: any) => {
      setTranscript(text);
      if (metadata) {
        addJudgeLog('STT_CHUNK', `Transcript chunk from ${metadata.engine || 'Gnani'}`, metadata);
      }
      if (isFinal) {
        previewRequestIdRef.current += 1;
        if (previewTimerRef.current !== null) {
          window.clearTimeout(previewTimerRef.current);
          previewTimerRef.current = null;
        }
        setStepState('checking');
        const finalText = text.trim();
        const isSpokenCorrection = /^(no|nahi|illi|galat|correction|actually|update|change|weight|bp|age|नहीं|वजन|उम्र|ಇಲ್ಲ|ತೂಕ)\b/i.test(finalText) ||
          /change weight|not correct|instead/i.test(finalText);
        const isSaveConfirmation = awaitingSaveConfirmationRef.current &&
          /^(yes|yeah|yep|correct|okay|ok|save|haan|हां|हाँ|ಹೌದು)\b/i.test(finalText);
        if (isPlaying && !isSpokenCorrection && !isSaveConfirmation) return;
        if (finalText && finalText !== lastProcessedTranscriptRef.current) {
          lastProcessedTranscriptRef.current = finalText;
          stopRecordingRef.current();
          void processUtterance(finalText);
        }
      } else if (text.trim().length >= 6) {
        if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
        const requestId = ++previewRequestIdRef.current;
        previewTimerRef.current = window.setTimeout(async () => {
          try {
            const response = await fetch('/api/turn/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id: pipelineSessionIdRef.current,
                transcript: text.trim(),
                language,
              }),
            });
            const result = await response.json() as { fields?: Record<string, PipelineField>; error?: string };
            if (!response.ok) throw new Error(result.error || 'Live register preview failed.');
            if (requestId !== previewRequestIdRef.current || !result.fields) return;
            const updates = getFieldUpdateMessages(pipelineFieldsRef.current, result.fields);
            if (updates.length) setFieldUpdates(updates);
            setPipelineFields(result.fields);
          } catch (error) {
            if (requestId === previewRequestIdRef.current) {
              setWorkflowError({
                message: error instanceof Error ? error.message : 'Live register preview failed.',
                canRetry: true,
              });
            }
          }
        }, 500);
      }
    },
    [processUtterance, addJudgeLog, isPlaying, language]
  );

  const {
    isRecording,
    isConnecting,
    isFinalizing,
    audioLevel,
    noiseMode,
    error: sttError,
    clearError: clearSTTError,
    startRecording,
    stopRecording,
  } = useAudioRecorder(handleTranscriptChunk);
  const startVoiceTurn = useCallback(async (languageCode: string) => {
    lastProcessedTranscriptRef.current = '';
    await startRecording(languageCode);
  }, [startRecording]);
  startRecordingRef.current = startVoiceTurn;
  stopRecordingRef.current = stopRecording;

  useEffect(() => {
    if (isFinalizing) setStepState('checking');
  }, [isFinalizing]);

  useEffect(() => {
    if (ttsError && !demoMode && visitStarted && !isRecording && !isConnecting && !isFinalizing && stepState !== 'saved') {
      void startRecordingRef.current(language);
    }
  }, [demoMode, isConnecting, isRecording, isFinalizing, language, stepState, ttsError, visitStarted]);

  const startVisit = () => {
    setVisitStarted(true);
    setStepState('listening');
    const greeting = language === 'en-IN'
      ? 'Namaste! I am your ASHA Vaani assistant. Please tell me the patient visit details. You can explain everything together.'
      : language === 'hi-IN'
        ? 'नमस्ते! मैं आपका एआई सहायक हूँ। कृपया भेंट की जानकारी बताइए। आप सभी विवरण एक साथ बता सकती हैं।'
        : language === 'kn-IN'
          ? 'ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ AI ಸಹಾಯಕ. ದಯವಿಟ್ಟು ಭೇಟಿಯ ವಿವರಗಳನ್ನು ತಿಳಿಸಿ. ಎಲ್ಲಾ ವಿವರಗಳನ್ನು ಒಟ್ಟಿಗೆ ಹೇಳಬಹುದು.'
          : currentLangObj.spoken.ai_disclosure;
    addJudgeLog('AI_GREETING', greeting);
    speak(greeting, language, voice, () => {
      setStepState('listening');
      void startRecordingRef.current(language);
    });
  };

  const startDemo = async () => {
    if (demoStage === 'running') return;
    stopAudio();
    stopRecording();
    demoModeRef.current = true;
    setDemoMode(true);
    setDemoStage('running');
    pipelineSessionIdRef.current = `demo-${Date.now()}`;
    setPipelineFields({});
    setFieldUpdates([]);
    setDangerResult(null);
    setTranscript('');
    setExtractedJson(null);
    setSavedFollowups(null);
    setSavedRecordId(null);
    setReadyToConfirm(false);
    setActiveQuestion(null);
    setVisitStarted(true);
    setStepState('listening');
    addJudgeLog('DEMO_STARTED', 'Synthetic demo session started; no live microphone or patient data used.');
    const greeting = 'Namaste! I am your ASHA Vaani assistant. This is a simulated visit. Please review the patient details as they are captured.';
    speak(greeting, language, voice);
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    await wait(900);
    const initial = 'Simulated transcript: Patient name is Lakshmi, patient ID DEMO-001, 26 years old, house 42 in Demo Nagar. She is pregnant, seven months. This is an ANC visit. Her blood pressure is 110 by 70. She takes IFA regularly. Her last ANC visit was 2026-10-20. She has received two TT doses. No bleeding or fever.';
    setTranscript(initial);
    await processUtterance(initial);
    await wait(900);
    await processUtterance('56 kilograms.');
    await wait(900);
    await processUtterance('Actually, the weight is 58 kilograms, not 56.');
    await wait(900);
    await submitCorrections({
      name: 'Lakshmi',
      beneficiaryId: 'DEMO-001',
      age: 26,
      houseNo: '42',
      village: 'Demo Nagar',
      visitType: 'ANC',
      pregnancyMonths: 7,
      gestationalWeeks: 28,
      bpSystolic: 110,
      bpDiastolic: 70,
      weight: 58,
      ifaStatus: 'regular',
      lastAncDate: '2026-10-20',
      ttStatus: '2 doses',
      ttLastDoseDate: '2026-10-20',
      symptoms: 'No bleeding or fever',
    });
    await wait(900);
    await processUtterance('Yes, everything is correct. Save this visit.');
    setDemoStage('complete');
    addJudgeLog('DEMO_COMPLETED', 'Synthetic visit completed and saved through the real backend persistence path.');
  };

  const exitDemo = () => {
    demoModeRef.current = false;
    setDemoMode(false);
    setDemoStage('idle');
    stopAudio();
    stopRecording();
    addJudgeLog('DEMO_EXITED', 'Demo mode exited; live patient workflow is available.');
  };

  // Toggle Microphone
  const handleToggleMic = () => {
    if (isFinalizing) return;
    if (isConnecting) {
      stopRecording();
      return;
    }
    // Barge-in: User tap or speaking interrupts agent speech instantly
    if (isPlaying) {
      stopAudio();
      setVisitStarted(true);
      addJudgeLog('BARGE_IN', 'Agent speech interrupted instantly by user');
      if (!isRecording) {
        setStepState('listening');
        void startRecordingRef.current(language);
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
      if (!visitStarted) {
        startVisit();
      } else {
        setStepState('listening');
        void startRecordingRef.current(language);
      }
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
    setFieldUpdates([]);
    setVisitStarted(false);
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
    setStepState('start');
    addJudgeLog('NEXT_BENEFICIARY', 'Session reset for new home visit');
  };

  // Re-record
  const handleReRecord = () => {
    stopAudio();
    pipelineSessionIdRef.current = `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPipelineFields({});
    setFieldUpdates([]);
    setVisitStarted(false);
    setSavedFollowups(null);
    setSavedRecordId(null);
    setReadyToConfirm(false);
    awaitingSaveConfirmationRef.current = false;
    lastProcessedTranscriptRef.current = '';
    setTranscript('');
    setDangerResult(null);
    setExtractedJson(null);
    setStepState('start');
    startVisit();
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
  const startVisitLabel = language === 'hi-IN'
    ? 'भेंट शुरू करें'
    : language === 'kn-IN'
      ? 'ಭೇಟಿ ಪ್ರಾರಂಭಿಸಿ'
      : 'Start visit';
  // Demo Mode deliberately falls back to the local browser voice when Gnani
  // credentials are unavailable. Keep that provider diagnostic visible in the
  // banner, but do not present it as a failed microphone workflow.
  const activeError = demoMode ? workflowError : sttError || ttsError || workflowError;
  const selectLanguage = (nextLanguage: LanguageCode) => {
    setLanguage(nextLanguage);
    setVoice(LANGUAGE_CATALOG[nextLanguage]?.defaultVoice || LANGUAGE_CATALOG['en-IN'].defaultVoice);
  };

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
        onSelectLanguage={selectLanguage}
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
              <span className="font-bold block">
                {workflowError ? 'Visit workflow notice:' : 'Live Voice Service Notice:'}
              </span>
              <p className="mt-0.5 text-red-800">{activeError.message}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => {
                    if (workflowError) {
                      void retryWorkflow();
                      return;
                    }
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
                  {workflowError ? 'Retry visit' : ttsError ? 'Retry TTS' : 'Retry Voice Call'}
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

      {beneficiaryNotice && (
        <div
          className="fixed top-20 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-emerald-300 bg-white p-4 shadow-xl md:left-auto md:right-6 md:translate-x-0"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-emerald-900">
                {beneficiaryNotice.status === 'created'
                  ? 'Patient successfully registered'
                  : 'Existing patient matched.'}
              </p>
              <p className="mt-1 text-sm text-gray-700">
                {beneficiaryNotice.beneficiary.name}
                {beneficiaryNotice.beneficiary.age !== null
                  ? ` · ${beneficiaryNotice.beneficiary.age} years`
                  : ''}
              </p>
              <p className="text-sm text-gray-600">
                House {beneficiaryNotice.beneficiary.house_no}
                {beneficiaryNotice.beneficiary.village
                  ? ` · ${beneficiaryNotice.beneficiary.village}`
                  : ''}
              </p>
              <p className="text-xs text-gray-500">Patient ID: {beneficiaryNotice.beneficiary.id}</p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('visit');
                  setBeneficiaryNotice(null);
                  if (beneficiaryNoticeTimeoutRef.current !== null) {
                    window.clearTimeout(beneficiaryNoticeTimeoutRef.current);
                    beneficiaryNoticeTimeoutRef.current = null;
                  }
                }}
                className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800"
              >
                Continue to visit
              </button>
            </div>
            <button
              type="button"
              aria-label="Dismiss beneficiary notice"
              onClick={() => setBeneficiaryNotice(null)}
              className="rounded p-1 text-gray-500 hover:bg-gray-100"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 pt-3 pb-24">
        <section className="demo-panel mb-4" aria-label="Synthetic demo mode">
          <div>
            <p className="demo-kicker">Hackathon sandbox</p>
            <h2>Repeatable voice visit demo</h2>
            <p>Uses synthetic patient data, simulated transcript labels, and the real validation, danger, follow-up, and encrypted save path.</p>
          </div>
          <div className="demo-actions">
            <button type="button" className="demo-button demo-button-primary" onClick={() => void startDemo()} disabled={demoStage === 'running'}>
              <PlayCircle className="w-4 h-4" /> {demoStage === 'running' ? 'Demo running…' : demoStage === 'complete' ? 'Restart Demo' : 'Start Demo'}
            </button>
            {demoMode && <button type="button" className="demo-button" onClick={exitDemo}><RotateCcw className="w-4 h-4" /> Exit Demo</button>}
          </div>
          {demoMode && <p className="demo-status" aria-live="polite">{demoStage === 'complete' ? 'Demo complete — synthetic record saved. Danger FLAG / ASK / CLEAR rules remain available in Judge View.' : 'DEMO MODE: simulated transcript; no microphone input is being used.'}</p>}
        </section>
        {activeTab === 'visit' && (
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-6 md:space-y-0 md:items-start">
            <section className="space-y-3">
            {/* Short First-Run Hint */}
            <OnboardingHints />

            <section className="p-3 bg-white rounded-xl border border-gray-200 space-y-2">
              <label htmlFor="beneficiary-search" className="block text-sm font-bold text-gray-800">
                Select a patient
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
                  : isFinalizing
                  ? 'thinking'
                  : isConnecting
                  ? 'connecting'
                  : isPlaying
                  ? 'speaking'
                  : stepState === 'checking'
                  ? 'thinking'
                  : (demoMode ? workflowError : sttError || ttsError || workflowError)
                  ? 'error'
                  : 'idle'
              }
              audioLevel={audioLevel}
              onToggleRecord={handleToggleMic}
              onRetry={() => {
                if (workflowError && !sttError && !ttsError) void retryWorkflow();
                else handleToggleMic();
              }}
              tapToSpeakLabel={visitStarted ? currentLangObj.ui.tap_to_speak : startVisitLabel}
              stopListeningLabel={currentLangObj.ui.stop_listening}
              helperText={isPlaying
                ? 'Tap to interrupt and speak a correction.'
                : isConnecting
                  ? 'Connecting to the microphone and Gnani speech service…'
                  : isFinalizing
                    ? 'Finishing speech recognition…'
                  : visitStarted
                    ? 'Your spoken notes are kept together for this visit.'
                    : 'Start with a spoken greeting; no typing is needed.'}
            />

            {/* Live Transcript & Agent Caption */}
            <TranscriptBox
              transcript={transcript}
              isListening={isRecording}
              agentCaption={currentCaption}
            />
            </section>

            {/* Form Cards with Color Chips */}
            <section className="space-y-2 pt-1 md:pr-2">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
                <span>Verified Field Register</span>
                <span className="text-[10px] text-teal-700 font-normal">
                  Tap card to view evidence trail
                </span>
              </div>
              {fieldUpdates.length > 0 && (
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950" aria-live="polite">
                  <p className="mb-1 font-bold">Register updates</p>
                  {fieldUpdates.slice(-5).map((update, index) => <p key={`${index}-${update}`}>{update}</p>)}
                </div>
              )}

              {/* Patient Card */}
              <FieldCard
                label="Patient"
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
                    fieldName: 'Patient Name & ID',
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
                ['beneficiaryType', 'Patient Type'],
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
            </section>
          </div>
        )}

        {/* Post-Save Summary and Spoken Follow-up Checklist */}
        {activeTab === 'visit' && savedFollowups && (
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
            onSelectLanguage={selectLanguage}
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
