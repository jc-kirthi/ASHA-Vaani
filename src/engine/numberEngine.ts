import { FieldState } from '../types';

export interface NumberParseResult {
  value: number | null;
  rawText: string;
  method1Value: number | null;
  method2Value: number | null;
  isPlausible: boolean;
  isConfusable: boolean;
  confusablePrompt: string | null;
  state: FieldState;
  explanation: string;
}

const HINDI_WORD_MAP: Record<string, number> = {
  ek: 1, do: 2, teen: 3, chaar: 4, paanch: 5, cheh: 6, saat: 7, aath: 8, nau: 9, das: 10,
  gyarah: 11, baarah: 12, pandrah: 15, bees: 20, tees: 30, chaalis: 40, pachaas: 50,
  saath: 60, sattar: 70, assi: 80, navve: 90, sau: 100
};

const ENGLISH_WORD_MAP: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

export function parseWeight(
  text: string,
  category: 'newborn' | 'adult' = 'newborn',
  lang: string = 'hi'
): NumberParseResult {
  if (!text || !text.trim()) {
    return {
      value: null,
      rawText: '',
      method1Value: null,
      method2Value: null,
      isPlausible: false,
      isConfusable: false,
      confusablePrompt: null,
      state: 'missing',
      explanation: 'No weight provided in speech',
    };
  }

  const clean = text.toLowerCase().trim();

  // Method 1: Colloquial spoken fractions & words
  let m1: number | null = null;
  if (/\b(dhai|dhaai|dhayi)\b/i.test(clean)) {
    m1 = 2.5;
  } else if (/\b(dedh|deadh)\b/i.test(clean)) {
    m1 = 1.5;
  } else {
    // saade <num> -> num + 0.5
    const saadeMatch = clean.match(/\b(saade|saadhe|sade)\s+([a-z0-9]+)\b/i);
    if (saadeMatch) {
      const w = saadeMatch[2];
      const base = HINDI_WORD_MAP[w] || (parseInt(w, 10) || null);
      if (base !== null) m1 = base + 0.5;
    }

    // sawa <num> -> num + 0.25
    const sawaMatch = clean.match(/\b(sawa|sawwa)\s+([a-z0-9]+)\b/i);
    if (sawaMatch) {
      const w = sawaMatch[2];
      const base = HINDI_WORD_MAP[w] || (parseInt(w, 10) || null);
      if (base !== null) m1 = base + 0.25;
    }

    // paune <num> -> num - 0.25
    const pauneMatch = clean.match(/\b(paune)\s+([a-z0-9]+)\b/i);
    if (pauneMatch) {
      const w = pauneMatch[2];
      const base = HINDI_WORD_MAP[w] || (parseInt(w, 10) || null);
      if (base !== null) m1 = base - 0.25;
    }

    // do aath -> 2.8
    const pairMatch = clean.match(/\b(ek|do|teen|chaar|paanch)\s+(ek|do|teen|chaar|paanch|cheh|saat|aath|nau)\b/i);
    if (pairMatch) {
      const d1 = HINDI_WORD_MAP[pairMatch[1]];
      const d2 = HINDI_WORD_MAP[pairMatch[2]];
      if (d1 && d2 && d1 <= 5) {
        m1 = parseFloat(`${d1}.${d2}`);
      }
    }

    // two point eight
    const enPoint = clean.match(/\b(one|two|three|four|five)\s+point\s+([a-z0-9]+)\b/i);
    if (enPoint) {
      const d1 = ENGLISH_WORD_MAP[enPoint[1]];
      const d2 = ENGLISH_WORD_MAP[enPoint[2]] || parseInt(enPoint[2], 10);
      if (d1 !== undefined && d2 !== undefined) {
        m1 = parseFloat(`${d1}.${d2}`);
      }
    }

    // Single spoken word e.g. "saath" -> 60, "saat" -> 7
    if (m1 === null) {
      const words = clean.split(/\s+/);
      for (const w of words) {
        if (HINDI_WORD_MAP[w] !== undefined) {
          m1 = HINDI_WORD_MAP[w];
          break;
        }
        if (ENGLISH_WORD_MAP[w] !== undefined) {
          m1 = ENGLISH_WORD_MAP[w];
          break;
        }
      }
    }
  }

  // Method 2: Standard digits / compound grams
  let m2: number | null = null;
  // 2 kilo 800 gram
  const compMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilogram)s?\s*(?:and\s*)?(\d+)\s*(?:gram|gm|g)s?/i);
  if (compMatch) {
    m2 = parseFloat(compMatch[1]) + parseFloat(compMatch[2]) / 1000.0;
  } else {
    // 2.8 or 2.80
    const decMatch = clean.match(/\b(\d+\.\d+)\b/);
    if (decMatch) {
      m2 = parseFloat(decMatch[1]);
    } else {
      const intMatch = clean.match(/\b(\d+)\s*(?:kg|kilo|kilogram)?\b/i);
      if (intMatch) {
        m2 = parseFloat(intMatch[1]);
      }
    }
  }

  const chosenVal = m1 !== null ? m1 : m2;
  const minVal = category === 'newborn' ? 0.8 : 30.0;
  const maxVal = category === 'newborn' ? 6.0 : 130.0;
  const isPlausible = chosenVal !== null && chosenVal >= minVal && chosenVal <= maxVal;

  // Confusable sound-alike check
  let isConfusable = false;
  let confusablePrompt: string | null = null;

  // Check confusable words
  if (!/\b(saade|sade|sawa|paune)\b/i.test(clean)) {
    if (/\b(saat|saath)\b/i.test(clean)) {
      isConfusable = true;
      confusablePrompt = 'क्या आपने सात (7) या साठ (60) कहा? कृपया स्पष्ट करें।';
    } else if (/\b(chaalis)\b/i.test(clean)) {
      isConfusable = true;
      confusablePrompt = 'क्या आपने चार (4) या चालीस (40) कहा?';
    } else if (/\b(tees)\b/i.test(clean)) {
      isConfusable = true;
      confusablePrompt = 'क्या आपने तीन (3) या तीस (30) कहा?';
    } else if (/\b(fifteen|fifty)\b/i.test(clean)) {
      isConfusable = true;
      confusablePrompt = 'Did you say fifteen (15) or fifty (50)?';
    }
  }

  let state: FieldState = 'confirmed';
  let explanation = 'Validated and confirmed';

  if (chosenVal === null) {
    state = 'missing';
    explanation = 'Could not parse weight from speech';
  } else if (!isPlausible) {
    state = 'uncertain';
    explanation = `Implausible weight ${chosenVal} kg (expected range ${minVal}-${maxVal} kg)`;
  } else if (m1 !== null && m2 !== null && Math.abs(m1 - m2) > 0.05) {
    state = 'uncertain';
    explanation = `Dual method mismatch: rule parser (${m1}) vs digit parser (${m2})`;
  } else if (isConfusable) {
    state = 'uncertain';
    explanation = 'Sound-alike confusable detected';
  }

  return {
    value: chosenVal !== null ? Math.round(chosenVal * 100) / 100 : null,
    rawText: text,
    method1Value: m1,
    method2Value: m2,
    isPlausible,
    isConfusable,
    confusablePrompt,
    state,
    explanation,
  };
}
