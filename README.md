# ASHA Vaani (आशा वाणी)
Healthcare Voice Field Register for ASHA Workers — Gnani Voice Hackathon (PS1)

ASHA Vaani is a mobile-first voice register that converts spoken home-visit notes in Indian languages into verified clinical records with zero typing, combining live voice streaming with deterministic maternal/newborn danger-sign safety.

---

## 1. How to Run (One Command)

```bash
npm run dev
```

Starts the unified backend and frontend on port 3000 (`http://0.0.0.0:3000`), serving both the responsive web application and live WebSocket proxies for Gnani Prisma STT and Timbre TTS.

To verify your environment keys and live Gnani/Gemini connections:
```bash
python3 scripts/check_env.py
```

To run unit and clinical safety evaluation tests:
```bash
python3 tests/test_all.py
python3 scripts/eval.py
```

---

## 2. Environment Variables

Set these three variables in your environment or `.env` file (never commit them):

- `GNANI_API_KEY`: Subscription key for Gnani Prisma v3.0 STT and Timbre v3.0 TTS (`https://api.vachana.ai`). Kept strictly on the backend.
- `LLM_API_KEY`: Google Gemini API key used server-side for entity extraction into strict RFC 8259 JSON (`gemini-2.5-flash`).
- `ENCRYPTION_KEY`: 32-byte secret key used for AES-256-GCM authenticated encryption of sensitive beneficiary health records at rest.

---

## 3. Architecture

```
Browser Mic (16kHz PCM) 
  --> Backend WebSocket Proxy (`/ws/stt`) 
  --> Gnani Prisma v3.0 STT (`wss://api.vachana.ai/stt/v3/stream`)
  --> Spoken Transcript
  --> MoHFW Deterministic Rule Engine (FLAG / CLEAR / ASK) [Never decided by LLM]
  --> Gemini 2.5 Flash (`/api/extract`) for structured JSON entity mapping
  --> Gnani Timbre v3.0 Streaming TTS (`wss://api.vachana.ai/api/v1/tts`)
  --> Web Audio Instant Playback with <10ms Barge-in
  --> Encrypted Storage at Rest (AES-256-GCM)
```

---

## 4. Languages Supported

- **Fully Tested (Lexicon Active)**:
  - Hindi (`hi-IN`) — Full clinical lexicon, dual-method number normalizer, and transitional safety rules.
  - Kannada (`kn-IN`) — Full clinical lexicon, dual-method number normalizer, and dialect guards.
  - Indian English (`en-IN`) — Full clinical lexicon, code-mix parsing, and fractional normalizer.
- **Supported in Strict Safety Mode**:
  - Bengali (`bn-IN`), Marathi (`mr-IN`), Gujarati (`gu-IN`), Punjabi (`pa-IN`), Telugu (`te-IN`), Tamil (`ta-IN`), Malayalam (`ml-IN`).
  - Strict mode rule: Any unverified or ambiguous symptom automatically defaults to targeted clarification (`ASK`) to guarantee patient safety across regional dialects.
- **Auto-LID**: Automatic language identification routes incoming speech to the correct acoustic model.

---

## 5. Danger-Sign MoHFW Citation TODOs

All maternal and neonatal danger signs are strictly governed by deterministic rules requiring clinical citations to be verified against official Ministry of Health and Family Welfare (MoHFW) / National Health Mission (NHM) documents:

1. `vaginal_bleeding`: `[TODO: Verify MoHFW ASHA Training Module 6 - Maternal Health, Section 3.2, Page 28]`
2. `convulsions_fits`: `[TODO: Verify MoHFW ASHA Training Module 6 - High Risk Pregnancy, Section 4.1, Page 34]`
3. `severe_headache_blurred_vision`: `[TODO: Verify MoHFW ASHA Training Module 6 - High Risk Pregnancy, Section 4.2, Page 36]`
4. `high_fever_pregnancy`: `[TODO: Verify MoHFW Guidelines on Obstetric Emergencies 2019, Chapter 5, Page 52]`
5. `severe_abdominal_pain`: `[TODO: Verify MoHFW ASHA Training Module 6 - Complications, Section 3.5, Page 31]`
6. `reduced_fetal_movement`: `[TODO: Verify MoHFW MCP Card Antenatal Danger Signs 2021, Page 8]`
7. `newborn_fever`: `[TODO: Verify MoHFW HBNC Operational Guidelines 2021, Card 3, Page 19]`
8. `newborn_hypothermia`: `[TODO: Verify MoHFW HBNC Training Guidelines 2021, Chapter 4, Page 22]`
9. `newborn_not_feeding`: `[TODO: Verify MoHFW HBNC Protocol - Sepsis and Feeding 2021, Page 25, Table 2]`
10. `fast_breathing_chest_indrawing`: `[TODO: Verify MoHFW HBNC Protocol - Respiratory Count >60/min, Page 27]`
11. `yellow_palms_soles`: `[TODO: Verify MoHFW HBNC Protocol - Neonatal Jaundice, Page 31]`
12. `unresponsive_lethargic`: `[TODO: Verify MoHFW HBNC Protocol - Sepsis and Encephalopathy, Page 33]`

---

## 6. Known Limits

1. **Active Connectivity for Live Voice**: Real-time streaming via Gnani Prisma v3.0 and Timbre v3.0 requires an active internet connection (broadband or 4G).
2. **Audio Hardware**: Browser microphone access requires HTTPS or `localhost` context with user permission.
3. **Medical Disclaimer**: ASHA Vaani assists community health workers with register bookkeeping and emergency escalation; it does not replace physician diagnosis, clinical judgment, or emergency medical dispatch.
