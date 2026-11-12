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
    return [];
  });
  const [newBeneficiaries, setNewBeneficiaries] = useState<BeneficiaryRecord[]>([]);
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
      ? missingKeys.map((key) => `${key} is missing. Set ${key} in the .env file in the project root, then restart the backend.`).join(' ')
      : !serviceHealth.stt_ok || !serviceHealth.tts_ok
        ? 'Gnani Prisma or Timbre health check failed. Check GNANI_API_KEY and connectivity, then retry.'
        : 'A backend service check failed. Review server configuration and retry.';

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
      const startTime = performance.now();
      const currentUtterance = spokenText.trim();
      const fullTranscript = visitTranscriptRef.current
        ? `${visitTranscriptRef.current} ${currentUtterance}`
        : currentUtterance;
      visitTranscriptRef.current = fullTranscript;
      setTranscript(fullTranscript);
      addJudgeLog('TRANSCRIPT_FINAL', currentUtterance);
      setWorkflowError(null);

      // Check for spoken correction during read-back ("no, weight is 2.8 kilo")
      const lower = fullTranscript.toLowerCase();
      const isCorrection =
        /^(no|nahi|illi|galat|correction)\b/i.test(currentUtterance) ||
        currentUtterance.toLowerCase().includes('change weight');

      const isAffirmative = /^(yes|yeah|yep|correct|okay|ok|save|haan|हां|हाँ|ಹೌದು)\b/i.test(currentUtterance);
      if (stepState === 'confirm' && isAffirmative && awaitingSaveConfirmationRef.current) {
        awaitingSaveConfirmationRef.current = false;
        stopAudio();
        await saveRecordRef.current();
        return;
      }
      awaitingSaveConfirmationRef.current = false;

      if (isCorrection && isPlaying) {
        stopAudio();
        addJudgeLog('BARGE_IN_CORRECTION', 'Agent stopped immediately for user correction');
      }

      setStepState('checking');

      // 1. Language Auto-Detection
      let utteranceLanguage = language;
      if (/[\u0900-\u097F]/.test(currentUtterance) && language !== 'hi-IN') {
        utteranceLanguage = 'hi-IN';
        setLanguage(utteranceLanguage);
        addJudgeLog('AUTO_LID', 'Auto-switched language to Hindi (hi-IN)');
      } else if (/[\u0C80-\u0CFF]/.test(currentUtterance) && language !== 'kn-IN') {
        utteranceLanguage = 'kn-IN';
        setLanguage(utteranceLanguage);
        addJudgeLog('AUTO_LID', 'Auto-switched language to Kannada (kn-IN)');
      }
      const currentLang = LANGUAGE_CATALOG[utteranceLanguage] || LANGUAGE_CATALOG['en-IN'];

      let geminiExtracted: any;
      try {
        const extractRes = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: activeQuestion && !/save/i.test(activeQuestion)
              ? `Question: ${activeQuestion}\nAnswer: ${fullTranscript}`
              : fullTranscript,
            lang: utteranceLanguage,
          }),
        });
        const extractData = await extractRes.json();
        if (!extractRes.ok) {
          throw new Error(extractData.error || `Gemini extraction failed (HTTP ${extractRes.status}).`);
        }
        geminiExtracted = extractData;
        setExtractedJson(geminiExtracted);
        addJudgeLog('LLM_EXTRACTION', `Gemini structured extraction (${geminiExtracted.modelUsed})`, geminiExtracted);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Gemini extraction failed.';
        setWorkflowError({ message, canRetry: true });
        setStepState('confirm');
        addJudgeLog('LLM_EXTRACTION_ERROR', 'Gemini extraction failed.');
        return;
      }

      const rawBeneficiaryNames: unknown = geminiExtracted.beneficiaryNames;
      let spokenNames: string[] = Array.isArray(rawBeneficiaryNames)
        ? Array.from(new Set(rawBeneficiaryNames.filter((name): name is string =>
            typeof name === 'string' && Boolean(name.trim())
          )))
        : [];
      if (activeQuestion?.startsWith('Which person is this visit for:')) {
        const answer = currentUtterance.toLocaleLowerCase();
        const selectedName = spokenNames.find((name: string) =>
          answer.includes(name.toLocaleLowerCase()) ||
          answer === name.split(/\s+/)[0].toLocaleLowerCase()
        );
        if (selectedName) {
          geminiExtracted.beneficiaryName = selectedName;
          spokenNames = [selectedName];
          setActiveQuestion(null);
        }
      }
      if (spokenNames.length > 1) {
        const prompt = `Which person is this visit for: ${spokenNames.join(' or ')}?`;
        setActiveQuestion(prompt);
        setStepState('confirm');
        speak(prompt, utteranceLanguage, voice, () => {
          void startRecordingRef.current(utteranceLanguage);
        });
        addJudgeLog('MULTIPLE_BENEFICIARIES', 'Asked which named person this visit is for.', spokenNames);
        return;
      }

      // 2. Beneficiary Roster Check
      let matchedBeneficiary: BeneficiaryRecord | null = null;
      let matchedName: string | null = null;
      let matchedId: string | null = null;
      let matchedHouse: string | null = null;
      let matchedVillage: string | null = null;
      let isDisambiguate = false;
      let addedNewBeneficiary = false;

      // Check if answering an open disambiguation question
      if (disambiguationState.isOpen) {
        const saidHouse = geminiExtracted.houseNo || fullTranscript.match(/\b(?:house|makan|mane)\s*(?:number|no\.?)?\s*(\d+)\b/i)?.[1];
        for (const cand of disambiguationState.candidates) {
          if (saidHouse && String(saidHouse) === cand.house_no) {
            matchedBeneficiary = cand;
            setDisambiguationState({ isOpen: false, promptText: '', candidates: [] });
            break;
          }
        }
      }

      if (!matchedBeneficiary) {
        const extractedName = geminiExtracted.beneficiaryName || spokenNames[0];
        const matches = extractedName
          ? [...SYNTHETIC_ROSTER, ...newBeneficiaries].filter(
              (beneficiary) => beneficiary.name.toLocaleLowerCase() === extractedName.toLocaleLowerCase()
            )
          : [];

        const extractedHouse = geminiExtracted.houseNo
          ? String(geminiExtracted.houseNo)
          : fullTranscript.match(/\b(?:house|makan|mane)\s*(?:number|no\.?)?\s*(\d+)\b/i)?.[1];
        const selectedMatch = matches.length > 1 && extractedHouse
          ? matches.find((beneficiary) => beneficiary.house_no === extractedHouse)
          : undefined;
        if (selectedMatch) {
          matchedBeneficiary = selectedMatch;
        } else if (matches.length === 1) {
          matchedBeneficiary = matches[0];
        } else if (matches.length > 1) {
          // Name collision -> Prompt for house number
          isDisambiguate = true;
          const prompt = utteranceLanguage === 'kn-IN'
              ? `${matches[0].name} ಹೆಸರಿನ ಇಬ್ಬರು ಫಲಾನುಭವಿಗಳಿದ್ದಾರೆ - ಮನೆ ಸಂಖ್ಯೆ ${matches[0].house_no} ಅಥವಾ ${matches[1].house_no}?`
              : utteranceLanguage === 'en-IN'
                ? `There are multiple beneficiaries named ${matches[0].name}. Which house is this visit for: ${matches.map((item) => item.house_no).join(' or ')}?`
                : `${matches[0].name} नाम की दो लाभार्थी हैं - मकान नंबर ${matches[0].house_no} या मकान नंबर ${matches[1].house_no}?`;

          setDisambiguationState({
            isOpen: true,
            promptText: prompt,
            candidates: matches,
          });

          speak(prompt, utteranceLanguage, voice, () => {
            void startRecordingRef.current(utteranceLanguage);
          });
          addJudgeLog('ROSTER_DISAMBIGUATION', `Prompted for ${matches[0].name} (House ${matches[0].house_no} vs ${matches[1].house_no})`);
        } else if (extractedName) {
          const category = geminiExtracted.beneficiaryType === 'newborn' || geminiExtracted.visitType === 'PNC'
            ? 'PNC'
            : 'ANC';
          matchedBeneficiary = createSyntheticBeneficiary(
            extractedName,
            extractedHouse || 'Unknown',
            category,
            Number(geminiExtracted.age) || 0,
            geminiExtracted.village || 'Rampur'
          );
          addedNewBeneficiary = true;
          addJudgeLog('NEW_BENEFICIARY_ADDED', `New synthetic/demo beneficiary ${extractedName} added.`);
        }
      }

      if (matchedBeneficiary) {
        matchedName = matchedBeneficiary.name;
        matchedId = matchedBeneficiary.id;
        matchedHouse = matchedBeneficiary.house_no;
        matchedVillage = matchedBeneficiary.village;
      }
      const beneficiaryAnnouncement = addedNewBeneficiary && matchedName
        ? `New beneficiary ${matchedName} added. `
        : '';

      // 3. Visit Type and normalized fields
      let vType: 'ANC' | 'PNC' | 'immunisation' =
        geminiExtracted.visitType || formData.visitType || 'ANC';
      if (geminiExtracted.visitType) {
        vType = geminiExtracted.visitType;
      } else if (
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
      const rawWeightText = geminiExtracted.evidence?.weight ||
        fullTranscript.match(/(?:weight|vajan|wazan|bhaar|ತೂಕ)\s*(?:is|of|hai|:)?\s*\d+(?:\.\d+)?\s*(?:kg|kilo(?:grams?)?|grams?)?/i)?.[0] ||
        (geminiExtracted.weight !== null ? `${geminiExtracted.weight} kilo` : '');
      let parsedWeight: any;
      let bpUncertain = false;
      let dResult: DangerEngineResult;
      try {
        const evaluationResponse = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: fullTranscript,
            weightText: rawWeightText,
            lang: utteranceLanguage,
            beneficiaryName: matchedName || geminiExtracted.beneficiaryName,
            beneficiaryId: matchedId,
            category: geminiExtracted.beneficiaryType === 'newborn' ? 'newborn' : 'adult',
            bpSystolic: geminiExtracted.bpSystolic,
            bpDiastolic: geminiExtracted.bpDiastolic,
            hemoglobin: geminiExtracted.hemoglobin,
          }),
        });
        const evaluation = await evaluationResponse.json();
        if (!evaluationResponse.ok) {
          throw new Error(evaluation.error || 'Deterministic safety checks failed.');
        }
        parsedWeight = evaluation.weight;
        bpUncertain = evaluation.bloodPressure.state === 'uncertain' ||
          geminiExtracted.confidence.bp === 'uncertain';
        dResult = evaluation.danger;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Deterministic safety checks failed.';
        setWorkflowError({ message, canRetry: true });
        setStepState('confirm');
        return;
      }

      const bpSys = geminiExtracted.bpSystolic;
      const bpDia = geminiExtracted.bpDiastolic;
      const ifaCount = geminiExtracted.ifaTablets;

      // 7. Vaccinations
      const vaccs: string[] = [];
      ['tt1', 'tt2', 'tt booster', 'td', 'bcg', 'opv', 'pentavalent', 'rotavirus', 'mr'].forEach((v) => {
        if (lower.includes(v)) vaccs.push(v.toUpperCase());
      });

      setDangerResult(dResult);
      addJudgeLog('DANGER_DECISION', `${dResult.decision} - ${dResult.ruleFired}`, dResult);
      setExtractedJson({ ...geminiExtracted, normalizedWeight: parsedWeight.value, dangerDecision: dResult.decision });

      // Build updated Form Data
      setFormData((prev) => {
        const updatedStates = { ...prev.fieldStates };
        const updatedEvidence = { ...prev.evidenceTrail };

        // Beneficiary
        const effectiveName = matchedName || geminiExtracted?.beneficiaryName;
        if (effectiveName) {
          updatedStates.beneficiary = geminiExtracted.confidence.beneficiary === 'uncertain'
            ? 'uncertain'
            : 'confirmed';
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
          updatedStates.weight = geminiExtracted.confidence.weight === 'uncertain'
            ? 'uncertain'
            : parsedWeight.state || 'confirmed';
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
            sourceText: parsedWeight.rawText || geminiExtracted.evidence?.weight || `${candidateWeight} kg`,
            detector: 'number_normalizer',
            timestamp: new Date().toLocaleTimeString(),
            previousValues: prevHist,
          };
        }

        // Blood pressure
        const finalSys = bpSys ?? geminiExtracted?.bpSystolic;
        const finalDia = bpDia ?? geminiExtracted?.bpDiastolic;
        if (finalSys && finalDia) {
          updatedStates.bp = bpUncertain ? 'uncertain' : 'confirmed';
          updatedEvidence.bp = {
            value: `${finalSys}/${finalDia}`,
            sourceText: geminiExtracted.evidence?.bloodPressure || `${finalSys}/${finalDia}`,
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
            sourceText: geminiExtracted.evidence?.ifaStatus || `${finalIfa} IFA`,
            detector: 'number_normalizer',
            timestamp: new Date().toLocaleTimeString(),
          };
        } else if (geminiExtracted.ifaStatus) {
          updatedStates.ifa = geminiExtracted.confidence.ifa === 'uncertain' ? 'uncertain' : 'confirmed';
          updatedEvidence.ifa = {
            value: geminiExtracted.ifaStatus,
            sourceText: geminiExtracted.evidence?.ifaStatus || geminiExtracted.ifaStatus,
            detector: 'LLM',
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
          ifaStatus: geminiExtracted.ifaStatus || prev.ifaStatus,
          gestationalWeeks: geminiExtracted.gestationalWeeks ?? prev.gestationalWeeks,
          childAgeDays: geminiExtracted.babyAgeDays ?? prev.childAgeDays,
          lastAncDate: geminiExtracted.lastAncDate || prev.lastAncDate,
          vaccinationsGiven: vaccs.length > 0 ? vaccs : (geminiExtracted?.vaccinationsGiven || prev.vaccinationsGiven),
          fieldStates: updatedStates,
          evidenceTrail: updatedEvidence,
        };
      });

      const elapsed = Math.round(performance.now() - startTime);
      setTurnLatencyMs(elapsed);

      // Voice Response & Read-Back Strategy
      if (dResult.decision === 'FLAG') {
        speak(`${beneficiaryAnnouncement}Please refer to the PHC now.`, 'en-IN', voice);
        setStepState('confirm');
      } else if (isDisambiguate) {
        // Disambiguation prompt already spoken above
        setStepState('confirm');
      } else if (parsedWeight.isConfusable && parsedWeight.confusablePrompt) {
        // Confusable sound-alike guard (e.g. saat vs saath)
        speak(`${beneficiaryAnnouncement}${parsedWeight.confusablePrompt}`, utteranceLanguage, voice, () => {
          void startRecordingRef.current(utteranceLanguage);
        });
        setActiveQuestion(parsedWeight.confusablePrompt);
        setStepState('confirm');
      } else if (dResult.decision === 'ASK' && dResult.clarificationQuestions.length > 0) {
        // Targeted clarification for hedged / unknown symptom
        const q = dResult.clarificationQuestions[0];
        speak(`${beneficiaryAnnouncement}${q}`, utteranceLanguage, voice, () => {
          void startRecordingRef.current(utteranceLanguage);
        });
        setActiveQuestion(q);
        setStepState('confirm');
      } else if (!matchedName && !geminiExtracted.beneficiaryName && !formData.beneficiaryName) {
        const prompt = currentLang.spoken.ask_beneficiary_id;
        speak(`${beneficiaryAnnouncement}${prompt}`, utteranceLanguage, voice, () => {
          void startRecordingRef.current(utteranceLanguage);
        });
        setActiveQuestion(prompt);
        setStepState('confirm');
      } else if (
        (parsedWeight.value === null && geminiExtracted.weight === null && !formData.weight) ||
        parsedWeight.state === 'uncertain' ||
        geminiExtracted.confidence.weight === 'uncertain'
      ) {
        const prompt = currentLang.spoken.ask_weight;
        speak(`${beneficiaryAnnouncement}${prompt}`, utteranceLanguage, voice, () => {
          void startRecordingRef.current(utteranceLanguage);
        });
        setActiveQuestion(prompt);
        setStepState('confirm');
      } else if (
        ((!bpSys || !bpDia) && (!formData.bpSystolic || !formData.bpDiastolic)) ||
        bpUncertain
      ) {
        const prompt = currentLang.spoken.ask_bp;
        speak(`${beneficiaryAnnouncement}${prompt}`, utteranceLanguage, voice, () => {
          void startRecordingRef.current(utteranceLanguage);
        });
        setActiveQuestion(prompt);
        setStepState('confirm');
      } else if (!geminiExtracted.ifaStatus && ifaCount === null && !formData.ifaTablets) {
        const prompt = currentLang.spoken.ask_ifa;
        speak(`${beneficiaryAnnouncement}${prompt}`, utteranceLanguage, voice, () => {
          void startRecordingRef.current(utteranceLanguage);
        });
        setActiveQuestion(prompt);
        setStepState('confirm');
      } else {
        // Read-back numbers, then short "baaki sab theek, save karun?"
        let readback = '';
        const readbackWeight = parsedWeight.value ?? geminiExtracted.weight ?? formData.weight;
        const readbackSys = bpSys ?? formData.bpSystolic;
        const readbackDia = bpDia ?? formData.bpDiastolic;
        if (readbackWeight) {
          readback += `Weight ${readbackWeight} kilo. `;
        }
        if (readbackSys && readbackDia) {
          readback += `BP ${readbackSys} by ${readbackDia}. `;
        }
        readback += currentLang.spoken.save_confirm;
        setActiveQuestion(currentLang.spoken.save_confirm);
        awaitingSaveConfirmationRef.current = true;
        void startRecordingRef.current(utteranceLanguage);
        speak(`${beneficiaryAnnouncement}${readback}`, utteranceLanguage, voice, () => {
          void startRecordingRef.current(utteranceLanguage);
        });
        setStepState('confirm');
      }
    },
    [
      language,
      voice,
      disambiguationState,
      newBeneficiaries,
      formData,
      stepState,
      activeQuestion,
      speak,
      isPlaying,
      stopAudio,
      addJudgeLog,
      createSyntheticBeneficiary,
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
  } = useAudioRecorder(handleTranscriptChunk, testModeEnabled);
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
    stopAudio();
    awaitingSaveConfirmationRef.current = false;
    const currentLang = LANGUAGE_CATALOG[language] || LANGUAGE_CATALOG['en-IN'];
    const followups = generateFollowups(
      formData.visitType || 'ANC',
      formData.gestationalWeeks,
      formData.childAgeDays,
      formData.ifaTablets
    );

    if (!formData.beneficiaryName || !formData.beneficiaryId) {
      setWorkflowError({
        message: 'A beneficiary must be identified before this visit can be saved.',
        canRetry: true,
      });
      return;
    }

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const recordId = `REC-${Date.now()}`;
    const recordPayload = {
      id: recordId,
      timestamp,
      beneficiaryName: formData.beneficiaryName,
      beneficiaryId: formData.beneficiaryId,
      village: formData.village || 'Rampur',
      houseNo: formData.houseNo || 'Unknown',
      visitType: formData.visitType || 'ANC',
      weight: formData.weight,
      clinicalDetails: extractedJson,
      bp: formData.bpSystolic && formData.bpDiastolic ? `${formData.bpSystolic}/${formData.bpDiastolic}` : null,
      isFlagged: dangerResult?.decision === 'FLAG',
      flaggedSigns: dangerResult?.flaggedSigns || [],
      referralSlip: dangerResult?.referralSlip || undefined,
      transcript: transcript || 'Recorded via ASHA Vaani',
      followups,
    };

    // Encrypt record with ENCRYPTION_KEY via backend
    try {
      const encRes = await fetch('/api/records/encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recordPayload),
      });
      const encData = await encRes.json();
      if (!encRes.ok || typeof encData.encryptedToken !== 'string') {
        throw new Error(encData.error || 'Encrypted record storage failed.');
      }

      const newRecord: SavedVisitRecord = {
        ...recordPayload,
        id: recordId,
        timestamp,
        isFlagged: recordPayload.isFlagged,
        flaggedSigns: recordPayload.flaggedSigns,
        referralSlip: recordPayload.referralSlip,
        encryptedToken: encData.encryptedToken,
        transcript: recordPayload.transcript,
        followups,
      };

      const updated = [newRecord, ...savedRecords];
      const stored = JSON.parse(localStorage.getItem('asha_saved_records') || '[]');
      localStorage.setItem('asha_saved_records', JSON.stringify([
        { id: recordId, timestamp, encryptedToken: encData.encryptedToken },
        ...(Array.isArray(stored) ? stored : []),
      ]));
      setSavedRecords(updated);

      setSavedFollowups(followups);
      setStepState('saved');
      setWorkflowError(null);

      const spokenFollowups = followups.map((item) => `${item.item}, due ${item.dueDate}`).join('. ');
      speak(`${currentLang.spoken.record_saved} ${spokenFollowups}`, language, voice);
      addJudgeLog('RECORD_SAVED_ENCRYPTED', `Saved encrypted record for ${newRecord.beneficiaryName}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Encrypted record storage failed.';
      setWorkflowError({ message, canRetry: true });
    }
  };
  saveRecordRef.current = handleSaveRecord;

  // Next Beneficiary
  const handleNextBeneficiary = () => {
    stopAudio();
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
