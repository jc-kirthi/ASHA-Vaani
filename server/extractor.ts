import { GoogleGenAI } from '@google/genai';

export interface ExtractedVisitData {
  beneficiaryName: string | null;
  beneficiaryId: string | null;
  houseNo: string | null;
  village: string | null;
  visitType: 'ANC' | 'PNC' | 'immunisation';
  gestationalWeeks: number | null;
  childAgeDays: number | null;
  weight: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  ifaTablets: number | null;
  vaccinationsGiven: string[];
  confidence: {
    beneficiary: 'high' | 'uncertain' | 'missing';
    weight: 'high' | 'uncertain' | 'missing';
    bp: 'high' | 'uncertain' | 'missing';
    ifa: 'high' | 'uncertain' | 'missing';
  };
  modelUsed: string;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a clinical entity extractor for India's ASHA maternal and child health visits.
Extract information from spoken visit notes (in Hindi, Kannada, Indian English, or code-mixed speech) into strict JSON.

Rules:
1. ONLY extract explicitly spoken facts. Do NOT hallucinate or guess.
2. If a field was not mentioned, return null.
3. visitType must be "ANC" (antenatal), "PNC" (postnatal/newborn), or "immunisation".
4. Weight must be a clean numeric float in kilograms (e.g. 52.4 or 2.8).
5. bpSystolic and bpDiastolic must be integers (e.g. 120 and 80 for "120 by 80").
6. ifaTablets is the count of iron-folic acid pills given or checked.
7. Return JSON ONLY with keys: beneficiaryName, houseNo, village, visitType, weight, bpSystolic, bpDiastolic, ifaTablets, vaccinationsGiven.
8. NEVER include danger signs or clinical recommendations.`;

export async function extractWithGemini(
  transcript: string,
  lang: string = 'hi-IN'
): Promise<ExtractedVisitData> {
  const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.length < 10) {
    return deterministicFallbackExtraction(transcript);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Attempt 1
    const result = await attemptGeminiCall(ai, transcript, lang);
    return result;
  } catch (err: any) {
    console.warn('Gemini extraction attempt 1 failed, retrying once:', err.message);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const retryResult = await attemptGeminiCall(ai, `${transcript}\n\nIMPORTANT: Output valid RFC 8259 JSON only.`, lang);
      return retryResult;
    } catch (retryErr: any) {
      console.warn('Gemini retry failed, using deterministic extractor:', retryErr.message);
      return deterministicFallbackExtraction(transcript);
    }
  }
}

async function attemptGeminiCall(
  ai: GoogleGenAI,
  transcript: string,
  lang: string
): Promise<ExtractedVisitData> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `[Language: ${lang}]\nSpoken Visit Note:\n"${transcript}"\n\nExtract the JSON according to schema:`,
    config: {
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const text = response.text?.trim() || '{}';
  const parsed = JSON.parse(text);

  return {
    beneficiaryName: parsed.beneficiaryName || null,
    beneficiaryId: null, // matched against synthetic roster separately
    houseNo: parsed.houseNo ? String(parsed.houseNo) : null,
    village: parsed.village || null,
    visitType: (['ANC', 'PNC', 'immunisation'].includes(parsed.visitType) ? parsed.visitType : 'ANC'),
    gestationalWeeks: parsed.gestationalWeeks ? Number(parsed.gestationalWeeks) : null,
    childAgeDays: parsed.childAgeDays ? Number(parsed.childAgeDays) : null,
    weight: typeof parsed.weight === 'number' ? parsed.weight : parsed.weight ? parseFloat(parsed.weight) : null,
    bpSystolic: parsed.bpSystolic ? parseInt(parsed.bpSystolic, 10) : null,
    bpDiastolic: parsed.bpDiastolic ? parseInt(parsed.bpDiastolic, 10) : null,
    ifaTablets: parsed.ifaTablets ? parseInt(parsed.ifaTablets, 10) : null,
    vaccinationsGiven: Array.isArray(parsed.vaccinationsGiven) ? parsed.vaccinationsGiven : [],
    confidence: {
      beneficiary: parsed.beneficiaryName ? 'high' : 'missing',
      weight: parsed.weight ? 'high' : 'missing',
      bp: parsed.bpSystolic ? 'high' : 'missing',
      ifa: parsed.ifaTablets ? 'high' : 'missing',
    },
    modelUsed: 'gemini-2.5-flash',
  };
}

/**
 * Deterministic fallback extractor using robust regex parsing for offline/test mode.
 */
export function deterministicFallbackExtraction(transcript: string): ExtractedVisitData {
  const t = transcript.toLowerCase();

  // Visit type
  let visitType: 'ANC' | 'PNC' | 'immunisation' = 'ANC';
  if (t.includes('pnc') || t.includes('bachha') || t.includes('shishu') || t.includes('magu') || t.includes('newborn')) {
    visitType = 'PNC';
  } else if (t.includes('tika') || t.includes('vaccin') || t.includes('doses')) {
    visitType = 'immunisation';
  }

  // BP (e.g. 120/80, 120 by 80, 120 battey 80)
  let bpSys: number | null = null;
  let bpDia: number | null = null;
  const bpMatch = transcript.match(/\b(\d{2,3})\s*(?:\/|by|aur|battey|me)\s*(\d{2,3})\b/i);
  if (bpMatch) {
    bpSys = parseInt(bpMatch[1], 10);
    bpDia = parseInt(bpMatch[2], 10);
  }

  // Weight (e.g. 52.4 kilo, 2.8 kg, vajan 52)
  let weight: number | null = null;
  const weightMatch = transcript.match(/(?:vajan|weight|bhaar)?\s*(\d{1,3}(?:\.\d+)?)\s*(?:kilo|kg|k\.g|grams)?/i);
  if (weightMatch && weightMatch[1]) {
    const val = parseFloat(weightMatch[1]);
    if (val >= 1 && val <= 150) {
      weight = val;
    }
  }

  // IFA tablets (e.g. 30 ifa, 30 goli, 100 iron tablets)
  let ifa: number | null = null;
  const ifaMatch = transcript.match(/(\d+)\s*(?:ifa|iron|goli|tablets?)/i);
  if (ifaMatch) {
    ifa = parseInt(ifaMatch[1], 10);
  }

  // Beneficiary names from known words
  let name: string | null = null;
  const knownNames = ['Sita Devi', 'Radha Devi', 'Sunita Bai', 'Lakshmi Gowda', 'Anjali Patil', 'Pooja Sharma', 'Fatima Begum'];
  for (const n of knownNames) {
    if (t.includes(n.toLowerCase()) || t.includes(n.split(' ')[0].toLowerCase())) {
      name = n;
      break;
    }
  }

  return {
    beneficiaryName: name,
    beneficiaryId: null,
    houseNo: null,
    village: null,
    visitType,
    gestationalWeeks: null,
    childAgeDays: null,
    weight,
    bpSystolic: bpSys,
    bpDiastolic: bpDia,
    ifaTablets: ifa,
    vaccinationsGiven: [],
    confidence: {
      beneficiary: name ? 'high' : 'missing',
      weight: weight ? 'high' : 'missing',
      bp: bpSys ? 'high' : 'missing',
      ifa: ifa ? 'high' : 'missing',
    },
    modelUsed: 'deterministic_normalizer',
  };
}
