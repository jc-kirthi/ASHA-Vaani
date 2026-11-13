# ASHA Vaani (आशा वाणी)
Healthcare Voice Field Register for ASHA Workers — Gnani Voice Hackathon (PS1)

ASHA Vaani is a voice-register prototype. Finalized transcripts are sent through one backend extraction flow; the deterministic danger-sign engine remains separate from language-model extraction.

---

## 1. How to Run (One Command)

```bash
npm run dev
```

This is the standard application mode. It starts the unified backend and frontend on port 3000 (`http://localhost:3000`) and uses the normal beneficiary and visit registers. Gnani Prisma STT and Timbre TTS use backend WebSocket proxies. Timbre audio chunks are played as they arrive when the browser can decode each chunk; if not, the client combines the received chunks and decodes the completed audio.

### Optional isolated sandbox

Use the sandbox only for local demos or testing; it is not a replacement for the standard application mode and must not be used as the project's normal register:

```bash
npm run dev:sandbox
```

It runs on port 3001 by default and uses `data/sandbox/` instead of the normal beneficiary and visit files. The sandbox is isolated: it does not replace, copy over, or write to the standard registers or a normal port-3000 instance. Use only synthetic, de-identified visit details. Sandbox files are ignored by Git. Set `PORT` to override the sandbox port.

The sandbox disables Vite hot-module replacement. After changing source files, refresh the browser or restart the sandbox server to see the latest interface.

The **Start Demo** control is for the sandbox's repeatable synthetic visit only. Use `npm run dev` for the standard application workflow.

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
npm run test:workflow
python tests/test_all.py
python scripts/eval.py
```

### Interface overview

- **Home Visit** is the voice-entry workspace. Search for a patient, then use the microphone to capture visit notes; the step tracker shows the visit progressing through extraction, validation, safety checks, confirmation, and saving.
- The transcript and spoken response are shown alongside the verified field register. Select a field card to inspect its evidence or correct a value before saving.
- After saving, the follow-up checklist appears below the visit workspace across the page. The page scrolls as one view so the checklist does not overlap pinned visit controls.
- **Register** shows saved visits and follow-up tasks. **Settings** contains the available language and voice preferences.

---

## 2. Environment Variables

Keep one local `.env` file in the project root and set values there. Never commit `.env`.

- `GNANI_API_KEY`: Subscription key for Gnani Prisma v3.0 STT and Timbre v3.0 TTS (`https://api.vachana.ai`). Kept strictly on the backend.
- `LLM_API_KEY`: Google Gemini API key. Gemini is the primary structured extractor.
- `LLM_MODEL`: Gemini model identifier available to your API key. Set this explicitly; the application does not assume a model name.
- `FALLBACK_API_KEY`: Groq API key. Optional, but required to use the Groq fallback.
- `FALLBACK_BASE_URL`: Groq-compatible API base URL, typically `https://api.groq.com/openai/v1`.
- `FALLBACK_MODEL`: Active Groq chat model identifier. Set it explicitly; `npm run check:llm` can check the model against the provider account.
- `ENCRYPTION_KEY`: High-entropy secret used to derive the AES-256-GCM key for saved visit records. Keep it stable and backed up; losing or changing it makes existing records unreadable.
- `GNANI_MIN_SILENCE_MS`: Gnani endpointing silence interval in milliseconds (300–5000; defaults to 1500).
- `VITE_SPEECH_SILENCE_MS`: Browser RMS endpointing silence interval in milliseconds (defaults to 1500). Keep it aligned with `GNANI_MIN_SILENCE_MS`.

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
  --> Read-back and worker confirmation
  --> Encrypted server-side visit register and follow-up tasks
```

The LLM providers receive only the current transcript, selected language, and the shared extraction schema. They extract fields only; danger decisions are made by the deterministic engine. HTTP 429/503 responses open that provider's circuit for at least 60 seconds; invalid structured output is retried once before switching providers. Other errors are not retried, and provider attempts are time-limited to keep the live turn responsive. Extracted values are validated before they reach the turn pipeline.

The active visit session is kept by the backend and all field edits go through `/api/turn`. Saved visits are encrypted with AES-256-GCM and stored in the ignored `data/visit_records.json`; beneficiaries are stored in the server-side JSON register, which starts without a seeded/demo roster. The beneficiary JSON is not encrypted, so protect the server disk and do not treat this prototype as a production shared database. The browser does not act as a shared visit-record database. Follow-up dates are calculated from the saved visit date and available age/week data; each generated task records the local rule version (`draft-v1`). A date is marked pending verification if the required information is absent. Current follow-up rules and draft clinical-reference metadata are unverified and must not be treated as official guidance.

The microphone automatically ends a speech turn after the configured silence interval (1.5 seconds by default); short pauses do not submit a turn. A manual stop remains available. Beneficiary success notices are shown only after the backend returns the persisted beneficiary record and generated ID.

When `FALLBACK_MODEL` is set, the provider adapter verifies that it is available from the configured provider's `/models` response before using it. If it is unset, automatic selection looks for a model identifier containing `instant` and excludes reasoning-model identifiers (and models explicitly marked inactive). The provider model-list API does not expose a measured latency guarantee.

---

## 4. Languages Supported

- **Text-tested by the repository's current test suite**: Hindi (`hi-IN`), Kannada (`kn-IN`), and Indian English (`en-IN`).
- Other language options may be present in the UI, but their complete extraction, speech, and safety behavior has not been verified by this project’s current tests.

---

## 5. Unverified Danger-Sign Reference Metadata

The following citation entries are draft TODOs, not verified references. The UI explicitly labels them as unverified and does not present them as citations. Verify each against current official Ministry of Health and Family Welfare (MoHFW) / National Health Mission (NHM) documents before operational use:

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
4. **Storage deployment scope**: JSON files are persistent on one server instance but are not a concurrent multi-instance database. The current prototype also has no worker sign-in/authorization layer; deploy only in a controlled environment until those are added.
5. **Encryption key continuity**: Saved visit records cannot be decrypted if `ENCRYPTION_KEY` is lost or changed. Restore the original key from a secure backup; the application rejects unreadable records rather than silently discarding them.
6. **Clinical verification**: Follow-up timing rules and draft danger-sign references are not verified official guidance. This application does not replace clinical judgment or emergency medical services.
