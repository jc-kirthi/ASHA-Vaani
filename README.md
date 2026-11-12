# ASHA Vaani (आशा वाणी)
Healthcare Voice Field Register for ASHA Workers — Gnani Voice Hackathon (PS1)

ASHA Vaani is a voice-register prototype. Finalized transcripts are sent through one backend extraction flow; the deterministic danger-sign engine remains separate from language-model extraction.

---

## 1. How to Run (One Command)

```bash
npm run dev
```

Starts the unified backend and frontend on port 3000 (`http://0.0.0.0:3000`), serving both the responsive web application and live WebSocket proxies for Gnani Prisma STT and Timbre TTS.

To check the configured backend health:
```bash
npm run check
```

To make one live extraction probe against each configured LLM provider:
```bash
npm run check:llm
```

To run the application tests and clinical evaluation:
```bash
npm run lint
npm run test:llm
npm run test:turn
python3 tests/test_all.py
python3 scripts/eval.py
```

---

## 2. Environment Variables

Keep one local `.env` file in the project root and set values there. Never commit `.env`.

- `GNANI_API_KEY`: Subscription key for Gnani Prisma v3.0 STT and Timbre v3.0 TTS (`https://api.vachana.ai`). Kept strictly on the backend.
- `LLM_API_KEY`: Google Gemini API key. Gemini is the primary structured extractor.
- `LLM_MODEL`: Gemini model identifier available to your API key. Set this explicitly; the application does not assume a model name.
- `FALLBACK_API_KEY`: Groq API key. Optional, but required to use the Groq fallback.
- `FALLBACK_BASE_URL`: Groq-compatible API base URL, typically `https://api.groq.com/openai/v1`.
- `FALLBACK_MODEL`: Active Groq chat model identifier. Set it explicitly; `npm run check:llm` can check the model against the provider account.
- `ENCRYPTION_KEY`: 32-byte secret key used for AES-256-GCM authenticated encryption of sensitive beneficiary health records at rest.

Example local provider settings (put real keys only in the ignored `.env` file):

```env
LLM_MODEL=gemini-3.8-flash
FALLBACK_BASE_URL=https://api.groq.com/openai/v1
FALLBACK_MODEL=llama-3.3-70b-versatile
```

`/api/health` reports key-presence booleans, service-check results, and the port; it never returns key values. `npm run check:llm` sends a small synthetic extraction request and prints provider status, model, and latency. It does not modify visit data.

---

## 3. Architecture

```
Browser Mic (16kHz PCM) 
  --> Backend WebSocket Proxy (`/ws/stt`) 
  --> Gnani Prisma v3.0 STT (`wss://api.vachana.ai/stt/v3/stream`)
  --> Final transcript --> POST /api/turn
  --> Gemini structured extraction
  --> Groq fallback if Gemini is unavailable
  --> Existing deterministic rule-based extractor if both providers fail
  --> Separate deterministic danger-sign engine (FLAG / CLEAR / ASK)
  --> Gnani Timbre v3.0 speech response and encrypted visit storage
```

The LLM providers receive only the current transcript, selected language, and the shared extraction schema. They extract fields only; danger decisions are made by the deterministic engine. HTTP 429/503 responses open that provider's circuit for at least 60 seconds; invalid structured output is retried once before switching providers. Other errors are not retried, and provider attempts are time-limited to keep the live turn responsive. Extracted values are validated before they reach the turn pipeline.

When `FALLBACK_MODEL` is set, the provider adapter verifies that it is available from the configured provider's `/models` response before using it. If it is unset, automatic selection looks for a model identifier containing `instant` and excludes reasoning-model identifiers (and models explicitly marked inactive). The provider model-list API does not expose a measured latency guarantee.

---

## 4. Languages Supported

- **Text-tested by the repository's current test suite**: Hindi (`hi-IN`), Kannada (`kn-IN`), and Indian English (`en-IN`).
- Other language options may be present in the UI, but their complete extraction, speech, and safety behavior has not been verified by this project’s current tests.

---

## 5. Danger-Sign MoHFW Citation TODOs

The following citation entries are draft TODOs, not verified references. Verify each against current official Ministry of Health and Family Welfare (MoHFW) / National Health Mission (NHM) documents before operational use:

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
3. **LLM availability**: Live extraction requires an available Gemini model. Groq fallback requires its own key, base URL, and an available model. When both providers fail, the existing rule-based extractor is used; if it extracts no fields, the transcript is retained and the user is asked to repeat it.
4. **Provider verification**: The current `.env` does not specify `LLM_MODEL`, and no Groq key/model is configured. The last `npm run check:llm` therefore reported both providers as `NOT_CONFIGURED`; configure the models and keys locally, then rerun the check. No live Groq extraction or exact Groq model is claimed.
5. **Medical disclaimer**: This prototype does not replace clinical judgment or emergency medical services. Danger-sign source references above remain draft items for human verification.
