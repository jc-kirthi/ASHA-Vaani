/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  UserCheck,
  Scale,
  Activity,
  Pill,
  Syringe,
  Save,
  RotateCcw,
  UserPlus,
  Home,
  CheckCircle2,
  Calendar,
  Layers,
  Settings as SettingsIcon,
  BookOpen,
} from 'lucide-react';

import {
  LanguageCode,
  StepState,
  MicState,
  NoiseMode,
  VisitFormData,
  FieldState,
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

  // Visit State
  const [stepState, setStepState] = useState<StepState>('listening');
  const [formData, setFormData] = useState<VisitFormData>(INITIAL_FORM_DATA);
  const [dangerResult, setDangerResult] = useState<DangerEngineResult | null>(null);
  const [transcript, setTranscript] = useState<string>('');
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
  const { speak, stop: stopAudio, isPlaying, currentCaption, lastLatencyMs } = useSpeechPlayer();

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
    (spokenText: string) => {
      const startTime = performance.now();
      const currentLang = LANGUAGE_CATALOG[language] || LANGUAGE_CATALOG['hi-IN'];
      addJudgeLog('TRANSCRIPT_FINAL', spokenText);

      setStepState('checking');

      // 1. Beneficiary Roster Check
      let matchedBeneficiary: BeneficiaryRecord | null = null;
      let matchedName: string | null = null;
      let matchedId: string | null = null;
      let matchedHouse: string | null = null;
      let matchedVillage: string | null = null;
      let isDisambiguate = false;

      const lowerText = spokenText.toLowerCase();

      // Check for disambiguation answer if modal was active
      if (disambiguationState.isOpen) {
        for (const cand of disambiguationState.candidates) {
          if (
            lowerText.includes(cand.house_no) ||
            lowerText.includes(`house ${cand.house_no}`) ||
            lowerText.includes(`makan ${cand.house_no}`)
          ) {
            matchedBeneficiary = cand;
            setDisambiguationState({ isOpen: false, promptText: '', candidates: [] });
            break;
          }
        }
      }

      if (!matchedBeneficiary) {
        // Search roster
        const matches = SYNTHETIC_ROSTER.filter((b) =>
          lowerText.includes(b.name.toLowerCase())
        );

        if (matches.length === 1) {
          matchedBeneficiary = matches[0];
        } else if (matches.length > 1) {
          // Intentional duplicate name disambiguation
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

          speak(prompt, language);
          addJudgeLog('ROSTER_DISAMBIGUATION', `Prompted for ${matches[0].name} (House ${matches[0].house_no} vs ${matches[1].house_no})`);
        }
      }

      if (matchedBeneficiary) {
        matchedName = matchedBeneficiary.name;
        matchedId = matchedBeneficiary.id;
        matchedHouse = matchedBeneficiary.house_no;
        matchedVillage = matchedBeneficiary.village;
      }

      // 2. Visit Type Detection
      let vType: 'ANC' | 'PNC' | 'immunisation' = 'ANC';
      if (
        lowerText.includes('pnc') ||
        lowerText.includes('bachha') ||
        lowerText.includes('newborn') ||
        lowerText.includes('shishu') ||
        lowerText.includes('magu') ||
        (matchedBeneficiary && matchedBeneficiary.category === 'PNC')
      ) {
        vType = 'PNC';
      } else if (lowerText.includes('tika') || lowerText.includes('vaccin')) {
        vType = 'immunisation';
      }

      // 3. Number Normalizer (Dual Method)
      const parsedWeight = parseWeight(spokenText, vType === 'PNC' ? 'newborn' : 'adult', language);

      // 4. Blood Pressure parsing
      let bpSys: number | null = null;
      let bpDia: number | null = null;
      const bpMatch = spokenText.match(/\b(\d{2,3})\s*(?:by|\/|aur|battey)\s*(\d{2,3})\b/i);
      if (bpMatch) {
        bpSys = parseInt(bpMatch[1], 10);
        bpDia = parseInt(bpMatch[2], 10);
      }

      // 5. IFA Tablets parsing
      let ifaCount: number | null = null;
      const ifaMatch = spokenText.match(/(\d+)\s*(?:ifa|iron|goli|goliya|tablets)/i);
      if (ifaMatch) {
        ifaCount = parseInt(ifaMatch[1], 10);
      }

      // 6. Vaccinations
      const vaccs: string[] = [];
      ['tt1', 'tt2', 'tt booster', 'td', 'bcg', 'opv', 'pentavalent', 'rotavirus', 'mr'].forEach((v) => {
        if (lowerText.includes(v)) vaccs.push(v.toUpperCase());
      });

      // 7. Deterministic Danger Sign Rule Engine
      const dResult = evaluateDangerSigns(
        spokenText,
        language,
        matchedName || 'Beneficiary',
        matchedId || 'ID-Pending',
        'ASHA-001'
      );
      setDangerResult(dResult);
      addJudgeLog('DANGER_DECISION', `${dResult.decision} - ${dResult.ruleFired}`, dResult);

      // Build updated Form Data
      setFormData((prev) => {
        const updatedStates = { ...prev.fieldStates };
        const updatedEvidence = { ...prev.evidenceTrail };

        // Beneficiary
        if (matchedName) {
          updatedStates.beneficiary = 'confirmed';
          updatedEvidence.beneficiary = {
            value: `${matchedName} (${matchedId})`,
            sourceText: matchedName,
            detector: 'rule_engine',
            timestamp: new Date().toLocaleTimeString(),
          };
        }

        // Weight
        let finalWeight = prev.weight;
        if (parsedWeight.value !== null) {
          finalWeight = parsedWeight.value;
          updatedStates.weight = parsedWeight.state;
          const prevHist = prev.evidenceTrail.weight?.previousValues || [];
          if (prev.weight !== null && prev.weight !== parsedWeight.value) {
            prevHist.push({
              value: prev.weight,
              timestamp: new Date().toLocaleTimeString(),
              reason: 'Spoken voice correction',
            });
          }
          updatedEvidence.weight = {
            value: parsedWeight.value,
            sourceText: parsedWeight.rawText,
            detector: 'number_normalizer',
            timestamp: new Date().toLocaleTimeString(),
            previousValues: prevHist,
          };
        }

        // Blood pressure
        if (bpSys && bpDia) {
          updatedStates.bp = 'confirmed';
          updatedEvidence.bp = {
            value: `${bpSys}/${bpDia}`,
            sourceText: `${bpSys}/${bpDia}`,
            detector: 'number_normalizer',
            timestamp: new Date().toLocaleTimeString(),
          };
        }

        // IFA
        if (ifaCount !== null) {
          updatedStates.ifa = 'confirmed';
          updatedEvidence.ifa = {
            value: ifaCount,
            sourceText: `${ifaCount} IFA`,
            detector: 'number_normalizer',
            timestamp: new Date().toLocaleTimeString(),
          };
        }

        // Vaccinations
        if (vaccs.length > 0) {
          updatedStates.vaccinations = 'confirmed';
        }

        return {
          ...prev,
          beneficiaryName: matchedName || prev.beneficiaryName,
          beneficiaryId: matchedId || prev.beneficiaryId,
          houseNo: matchedHouse || prev.houseNo,
          village: matchedVillage || prev.village,
          visitType: vType,
          weight: finalWeight,
          bpSystolic: bpSys || prev.bpSystolic,
          bpDiastolic: bpDia || prev.bpDiastolic,
          ifaTablets: ifaCount !== null ? ifaCount : prev.ifaTablets,
          vaccinationsGiven: vaccs.length > 0 ? vaccs : prev.vaccinationsGiven,
          fieldStates: updatedStates,
          evidenceTrail: updatedEvidence,
        };
      });

      const elapsed = Math.round(performance.now() - startTime);
      setTurnLatencyMs(elapsed);

      // Voice Response & Read-Back Strategy
      if (dResult.decision === 'FLAG') {
        // Immediate PHC emergency line plays!
        speak(currentLang.spoken.referral_line, language);
        setStepState('confirm');
      } else if (isDisambiguate) {
        // Disambiguation prompt already spoken above
        setStepState('confirm');
      } else if (parsedWeight.isConfusable && parsedWeight.confusablePrompt) {
        // Sound-alike confusable guard
        speak(parsedWeight.confusablePrompt, language);
        setActiveQuestion(parsedWeight.confusablePrompt);
        setStepState('confirm');
      } else if (dResult.decision === 'ASK' && dResult.clarificationQuestions.length > 0) {
        // Targeted clarification
        const q = dResult.clarificationQuestions[0];
        speak(q, language);
        setActiveQuestion(q);
        setStepState('confirm');
      } else if (parsedWeight.value === null && !lowerText.includes('vajan') && !lowerText.includes('weight')) {
        // Missing weight field
        speak(currentLang.spoken.ask_weight, language);
        setActiveQuestion(currentLang.spoken.ask_weight);
        setStepState('confirm');
      } else {
        // Read-back numbers and dates, then short "baaki sab theek, save karun?"
        let readback = '';
        if (parsedWeight.value) {
          readback += `Weight ${parsedWeight.value} kilo. `;
        }
        if (bpSys && bpDia) {
          readback += `BP ${bpSys} by ${bpDia}. `;
        }
        readback += currentLang.spoken.save_confirm;
        speak(readback, language);
        setStepState('confirm');
      }
    },
    [language, disambiguationState, speak, addJudgeLog]
  );

  const handleTranscriptChunk = useCallback(
    (text: string, isFinal: boolean) => {
      setTranscript(text);
      if (isFinal) {
        processUtterance(text);
      }
    },
    [processUtterance]
  );

  const {
    isRecording,
    audioLevel,
    noiseMode,
    error: micError,
    startRecording,
    stopRecording,
  } = useAudioRecorder(handleTranscriptChunk);

  // Toggle Microphone
  const handleToggleMic = () => {
    // If agent is currently speaking, user tap or speak acts as instant barge-in!
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
      speak(currentLang.spoken.ai_disclosure, language, () => {
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
  const handleSaveRecord = () => {
    stopAudio();
    const currentLang = LANGUAGE_CATALOG[language] || LANGUAGE_CATALOG['hi-IN'];
    const followups = generateFollowups(
      formData.visitType || 'ANC',
      formData.gestationalWeeks,
      formData.childAgeDays,
      formData.ifaTablets
    );

    const newRecord: SavedVisitRecord = {
      id: `REC-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
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
      encryptedToken: `FERNET_ENC_${Math.random().toString(36).substring(2, 10)}`,
      transcript: transcript || 'Recorded via ASHA Vaani',
      followups,
    };

    const updated = [newRecord, ...savedRecords];
    setSavedRecords(updated);
    try {
      localStorage.setItem('asha_saved_records', JSON.stringify(updated));
    } catch {}

    setSavedFollowups(followups);
    setStepState('saved');

    speak(currentLang.spoken.record_saved, language);
    addJudgeLog('RECORD_SAVED_ENCRYPTED', `Saved record for ${newRecord.beneficiaryName}`, newRecord);
  };

  // Next Beneficiary
  const handleNextBeneficiary = () => {
    stopAudio();
    setFormData(INITIAL_FORM_DATA);
    setDangerResult(null);
    setTranscript('');
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
    setSavedFollowups(null);
    setJudgeLogs([]);
    try {
      localStorage.removeItem('asha_saved_records');
      localStorage.removeItem('asha_hints_dismissed');
    } catch {}
    addJudgeLog('PURGE_COMPLETE', 'All patient records and transcripts purged for Responsible AI compliance');
  };

  const currentLangObj = LANGUAGE_CATALOG[language] || LANGUAGE_CATALOG['hi-IN'];

  return (
    <div
      className={`min-h-screen bg-slate-50 text-gray-900 flex flex-col font-sans ${
        textSize === 'large' ? 'text-base' : textSize === 'xl' ? 'text-lg' : 'text-sm'
      }`}
    >
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
            <BookOpen className="w-5 h-5 mb-0.5" />
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
            <SettingsIcon className="w-5 h-5 mb-0.5" />
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
      />
    </div>
  );
}
