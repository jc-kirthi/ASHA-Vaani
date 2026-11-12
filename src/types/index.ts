export type LanguageCode =
  | 'hi-IN'
  | 'kn-IN'
  | 'en-IN'
  | 'bn-IN'
  | 'mr-IN'
  | 'gu-IN'
  | 'pa-IN'
  | 'te-IN'
  | 'ta-IN'
  | 'ml-IN'
  | 'indic-auto';

export type StepState = 'listening' | 'checking' | 'confirm' | 'saved';

export type MicState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

export type FieldState = 'confirmed' | 'uncertain' | 'missing';

export type NoiseMode = 'quiet' | 'normal' | 'noisy';

export interface FieldEvidence {
  value: any;
  sourceText: string;
  detector: 'LLM' | 'rule_engine' | 'number_normalizer' | 'manual_edit';
  timestamp: string;
  offsets?: [number, number];
  previousValues?: Array<{ value: any; timestamp: string; reason?: string }>;
}

export interface BeneficiaryRecord {
  id: string;
  name: string;
  house_no: string;
  village: string;
  category: 'ANC' | 'PNC';
  trimester?: number;
  child_age_days?: number;
  age: number;
  hb?: number;
}

export interface VisitFormData {
  beneficiaryName: string | null;
  beneficiaryId: string | null;
  houseNo: string | null;
  village: string | null;
  visitType: 'ANC' | 'PNC' | 'immunisation' | null;
  gestationalWeeks: number | null;
  childAgeDays: number | null;
  weight: number | null;
  weightRaw: string | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  ifaTablets: number | null;
  vaccinationsGiven: string[];
  vaccinationsDue: string[];
  lastAncDate: string | null;
  fieldStates: {
    beneficiary: FieldState;
    visitType: FieldState;
    weight: FieldState;
    bp: FieldState;
    ifa: FieldState;
    vaccinations: FieldState;
  };
  evidenceTrail: {
    beneficiary?: FieldEvidence;
    visitType?: FieldEvidence;
    weight?: FieldEvidence;
    bp?: FieldEvidence;
    ifa?: FieldEvidence;
    vaccinations?: FieldEvidence;
  };
}

export interface DangerEngineResult {
  decision: 'FLAG' | 'CLEAR' | 'ASK';
  flaggedSigns: DangerSignAlert[];
  clarificationQuestions: string[];
  referralSlip: string | null;
  ruleFired: string;
  lexiconMode: string;
  evidence: Array<{ signId: string; name: string; state: string; reason: string }>;
}

export interface DangerSignAlert {
  id: string;
  name: string;
  severity: string;
  source: {
    document_title: string;
    version: string;
    section_or_page: string;
  };
  reason: string;
}

export interface FollowupItem {
  item: string;
  dueDate: string;
  focus: string;
  source: string;
  completed?: boolean;
}

export interface SavedVisitRecord {
  id: string;
  timestamp: string;
  beneficiaryName: string;
  beneficiaryId: string;
  village: string;
  houseNo: string;
  visitType: string;
  weight: number | null;
  bp: string | null;
  isFlagged: boolean;
  flaggedSigns: DangerSignAlert[];
  referralSlip?: string;
  encryptedToken?: string;
  transcript: string;
  followups: FollowupItem[];
}

export interface JudgeLogEvent {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  latencyMs?: number;
  data?: any;
}
