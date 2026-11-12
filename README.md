# ASHA Vaani (आशा वाणी)
### Healthcare Voice Field Register for ASHA Workers
**Gnani Voice Hackathon 2026 — Problem Statement 1**  
*Built by Team of 4 Engineers (24-Hour Hackathon Build)*

> **Core Philosophy**: *"The agent knows when it has not understood, and asks instead of guessing."*

---

## 1. Executive Summary

ASHA Vaani is an installable, mobile-first Progressive Web App (PWA) that converts an ASHA (Accredited Social Health Activist) worker's spoken home-visit notes into verified, structured clinical records and deterministic follow-up checklists with **zero typing**.

It is purpose-built for the reality of Indian community healthcare:
- **Vernacular with English Code-Mix**: Accurately interprets natural phrasing such as *"TT injection"*, *"ANC checkup"*, *"dhai kilo"*, *"do aath"*, and *"IFA goli"*.
- **Household & Street Noise Immunity**: Browser-side RMS background noise meter with adaptive VAD thresholds and noise-adaptive read-back strictness.
- **Strict Clinical Safety Guarantee**: Maternal and newborn danger signs are evaluated **exclusively by a deterministic rule engine** derived from MoHFW/NHM protocols — **never by an LLM**.
- **Dual-Method Number Normalizer**: Independent linguistic fraction parser + digit normalizer with implausibility filters and sound-alike confusable number guards.
- **Privacy & Security**: Zero raw audio stored; clinical records encrypted at rest with AES-128 (Fernet); one-command compliance purge script.

---

## 2. Architecture Diagram

```mermaid
flowchart TD
    subgraph Client [Mobile PWA (Android / iOS)]
        Mic[Microphone Input] --> AW[AudioWorklet / Web Audio API]
        AW --> RMS[Background Noise Meter<br/>Quiet / Normal / Noisy]
        AW --> PCM[16 kHz Mono PCM 1024-byte chunks]
        UI[Touch Card UI & Evidence Trail]
        AudioOut[Web Audio / Timbre Player<br/>Instant <50ms Barge-in]
    end

    subgraph BackendProxy [Backend & Voice Gateway]
        Proxy[FastAPI / Node Proxy<br/>Port 3000 / HTTPS]
        KeyStore[Secure .env<br/>GNANI_API_KEY]
    end

    subgraph GnaniCloud [Gnani Voice Cloud APIs]
        Prisma[Gnani Prisma v3.0 STT<br/>wss://api.vachana.ai/stt/v3/stream]
        Timbre[Gnani Timbre v3.0 TTS<br/>wss://api.vachana.ai/api/v1/tts]
    end

    subgraph SafetyPipeline [Deterministic Core Pipeline]
        Ext[Clinical JSON Extractor<br/>LLM + Heuristic Fallback]
        Norm[Dual-Method Number Normalizer<br/>Fractions + Plausibility Bounds]
        ConfGuard[Sound-Alike Confusable Guard<br/>saat vs saath / chaar vs chaalis]
        DangerRule[Deterministic Danger Rule Engine<br/>MoHFW / HBNC 10+ Emergency Signs<br/>3-State: FLAG / CLEAR / ASK]
        Roster[Beneficiary Roster Engine<br/>30 Records + Disambiguation]
        Followups[Deterministic Follow-up Engine<br/>ANC, HBNC & UIP Schedule Dates]
        Crypto[Fernet AES-128 Encryption<br/>Encrypted Storage at Rest]
    end

    PCM --> Proxy
    Proxy -->|WebSocket Upgrade Headers| Prisma
    Prisma -->|Live Text Segments| Proxy
    Proxy --> Ext
    Ext --> Norm
    Ext --> ConfGuard
    Ext --> DangerRule
    Ext --> Roster
    DangerRule -->|On FLAG| Banner[PHC Referral Banner & Slip]
    DangerRule -->|Follow-ups| Followups
    Followups --> Crypto
    Crypto --> SQLite[(Encrypted Storage)]
    Proxy -->|Synthesis Requests| Timbre
    Timbre -->|Streaming Audio Chunks| AudioOut
```

---

## 3. Gnani Voice Services Used

ASHA Vaani strictly utilizes the official Gnani Prisma v3.0 and Timbre v3.0 WebSocket interfaces as documented in [docs.gnani.ai](https://docs.gnani.ai):

### Speech-to-Text (STT)
- **Model**: `prisma-v3.0`
- **WebSocket Endpoint**: `wss://api.vachana.ai/stt/v3/stream`
- **Upgrade Headers**:
  - `x-api-key-id`: Server-side secret from environment (`GNANI_API_KEY`)
  - `language_code`: `hi-IN`, `kn-IN`, `en-IN`, or `indic-auto`
  - `model`: `prisma-v3.0`
  - `format`: `verbatim`
  - `x-sample-rate`: `16000` (16 kHz mono)
  - `x-vad-threshold`: `0.7`
  - `x-min-silence-ms`: `500`
  - `x-min-speech-ms`: `100`
  - `x-min-segment-ms`: `120`
- **Streaming Format**: Raw PCM signed 16-bit little-endian, exactly 1,024 bytes (512 samples) every 32ms real-time cadence.

### Text-to-Speech (TTS)
- **Model**: `timbre-v3.0`
- **WebSocket Endpoint**: `wss://api.vachana.ai/api/v1/tts`
- **Connection Header**: `X-API-Key-ID`
- **Synthesis Payload**:
  ```json
  {
    "text": "नमस्ते दीदी, मैं एक एआई सहायक हूँ। कृपया अपनी गृह भेंट के नोट्स बताएं।",
    "voice": "Chetana",
    "model": "timbre-v3.0",
    "language": "hi-IN",
    "speed": 1.0,
    "audio_config": {
      "sample_rate": 16000,
      "num_channels": 1,
      "sample_width": 2,
      "encoding": "linear_pcm",
      "container": "wav"
    }
  }
  ```
- **Voice Catalog**: `Chetana` (empathetic healthcare), `Shivani` (warm/patient), `Lakshmi` (expressive), `Kalpana` (composed), `Avinash` (professional). Every Timbre v3.0 voice natively speaks all 10 supported languages.
- **Barge-in Support**: Instant audio interruption (<50ms cutoff) upon user voice detection or screen tap.

---

## 4. Languages Tested vs Supported

| Language | Code | Status | Lexicon Mode | Test Utterances in Benchmark |
| :--- | :--- | :--- | :--- | :---: |
| **Hindi** | `hi-IN` | **Fully Tested** | Lexicon Active | 25 |
| **Kannada** | `kn-IN` | **Fully Tested** | Lexicon Active | 7 |
| **English (India)** | `en-IN` | **Fully Tested** | Lexicon Active | 9 |
| **Bengali** | `bn-IN` | Supported (Strict Mode) | Strict Rule Mode | 2 |
| **Marathi** | `mr-IN` | Supported (Strict Mode) | Strict Rule Mode | 2 |
| **Gujarati** | `gu-IN` | Supported (Strict Mode) | Strict Rule Mode | 2 |
| **Punjabi** | `pa-IN` | Supported (Strict Mode) | Strict Rule Mode | 2 |
| **Telugu** | `te-IN` | Supported (Strict Mode) | Strict Rule Mode | 2 |
| **Tamil** | `ta-IN` | Supported (Strict Mode) | Strict Rule Mode | 2 |
| **Malayalam** | `ml-IN` | Supported (Strict Mode) | Strict Rule Mode | 2 |
| **Auto-Detect** | `indic-auto` | Supported | Auto-routing | — |

> **Strict Mode Note**: For languages outside the primary tier, strict safety thresholds apply. Any ambiguous or low-certainty symptom triggers **ASK** instead of CLEAR, ensuring safety cannot fail due to dialect differences.

---

## 5. Danger Signs & MoHFW Guideline Citation TODOs

All danger signs are treated as **DRAFT configurations** pending manual medical verification by health authorities:

| Sign ID | Clinical Condition | Applies To | MoHFW / NHM Source Citation | Status |
| :--- | :--- | :--- | :--- | :--- |
| `vaginal_bleeding` | Antepartum / Postpartum Bleeding | Pregnancy | `[TODO: Verify MoHFW ASHA Training Module 6, Section 3.2, Page 28]` | Pending Human Review |
| `convulsions_fits` | Eclampsia / Seizures | Pregnancy | `[TODO: Verify MoHFW ASHA Module 6 High Risk, Section 4.1, Page 34]` | Pending Human Review |
| `severe_headache_blurred_vision` | Severe Pre-eclampsia | Pregnancy | `[TODO: Verify MoHFW ASHA Module 6 High Risk, Section 4.2, Page 36]` | Pending Human Review |
| `high_fever_pregnancy` | Maternal Sepsis / High Fever | Pregnancy | `[TODO: Verify MoHFW Obstetric Emergencies Guidelines 2019, Ch 5, Page 52]` | Pending Human Review |
| `severe_abdominal_pain` | Placental Abruption / Uterine Rupture | Pregnancy | `[TODO: Verify MoHFW ASHA Training Module 6, Section 3.5, Page 31]` | Pending Human Review |
| `reduced_fetal_movement` | Fetal Distress | Pregnancy | `[TODO: Verify MoHFW MCP Card Antenatal Signs 2021, Page 8]` | Pending Human Review |
| `newborn_fever` | Neonatal Sepsis / High Fever | Newborn | `[TODO: Verify MoHFW HBNC Guidelines 2021, Card 3, Page 19]` | Pending Human Review |
| `newborn_hypothermia` | Neonatal Cold Injury (<36.5°C) | Newborn | `[TODO: Verify MoHFW HBNC Guidelines 2021, Chapter 4, Page 22]` | Pending Human Review |
| `newborn_not_feeding` | Inability to Suckle / Septicemia | Newborn | `[TODO: Verify MoHFW HBNC Operational Protocol, Table 2, Page 25]` | Pending Human Review |
| `fast_breathing_chest_indrawing` | Severe Acute Respiratory Infection | Newborn | `[TODO: Verify MoHFW HBNC Protocol Respiratory Count >60/min, Page 27]` | Pending Human Review |
| `yellow_palms_soles` | Severe Jaundice (Kramer Zone 5) | Newborn | `[TODO: Verify MoHFW HBNC Protocol Neonatal Jaundice, Page 31]` | Pending Human Review |
| `unresponsive_lethargic` | Neonatal Encephalopathy / Sepsis | Newborn | `[TODO: Verify MoHFW HBNC Protocol Activity Check, Page 33]` | Pending Human Review |

---

## 6. Clinical Safety Benchmark Evaluation Results

Run via `python3 scripts/eval.py` over 55 labelled synthetic utterances in `tests/utterances.csv`:

```
================================================================================
                    ASHA VAANI CLINICAL SAFETY & PIPELINE EVALUATION            
================================================================================
Total Test Utterances:           55
Danger Signs Missed (TARGET 0):  0  [PASSED - ZERO MISSES]
False Alarms:                    0
Danger Decision Accuracy:        100.0%
Number Normalizer Accuracy:      100.0% (16/16)
Confusable Guard Accuracy:       100.0% (2/2)
--------------------------------------------------------------------------------
| Language | Tier         | Total | Accuracy | Missed | False Alarms | Mode           |
|:---------|:-------------|:-----:|:--------:|:------:|:------------:|:---------------|
| hi       | Fully Tested |    25 |   100.0% |      0 |            0 | Lexicon Active  |
| kn       | Fully Tested |     7 |   100.0% |      0 |            0 | Lexicon Active  |
| en       | Fully Tested |     9 |   100.0% |      0 |            0 | Lexicon Active  |
| bn       | Supported    |     2 |   100.0% |      0 |            0 | Strict Mode     |
| mr       | Supported    |     2 |   100.0% |      0 |            0 | Strict Mode     |
| gu       | Supported    |     2 |   100.0% |      0 |            0 | Strict Mode     |
| pa       | Supported    |     2 |   100.0% |      0 |            0 | Strict Mode     |
| te       | Supported    |     2 |   100.0% |      0 |            0 | Strict Mode     |
| ta       | Supported    |     2 |   100.0% |      0 |            0 | Strict Mode     |
| ml       | Supported    |     2 |   100.0% |      0 |            0 | Strict Mode     |
================================================================================
```

---

## 7. Responsible AI Compliance Mapping

| Hard Rule Requirement | Code Enforcement Location | Verification Mechanism |
| :--- | :--- | :--- |
| **First-Turn AI Disclosure** | `src/App.tsx:handleToggleMic`, `app/gnani_tts.py` | Plays pre-synthesized AI declaration in user's native language before opening microphone. |
| **Synthetic Beneficiaries Only** | `data/roster.json`, `src/data/rosterData.ts` | 30 synthetic identities; no real patient data or call audio ever accessed or stored. |
| **Zero Diagnosis or Drug Advice** | `app/danger.py:generate_referral_slip`, `src/engine/dangerEngine.ts` | Code strictly outputs only the fixed referral line *"Please refer to the PHC now"*. No dosages or prescriptions. |
| **Encrypted at Rest** | `app/crypto.py`, `src/types/index.ts` | Encrypted using Fernet (AES-128-CBC + HMAC-SHA256). |
| **Secure Data Purge** | `scripts/purge.py`, `src/components/SettingsScreen.tsx` | Permanent deletion of all stored transcripts, databases, and audio caches. |
| **API Key Kept Server-Side** | `.env.example`, `.gitignore`, `app/gnani_stt.py` | API key never rendered to browser client; `.env` excluded from repository and ZIP. |
| **No Real Voice Cloning** | `app/gnani_tts.py`, `src/components/SettingsScreen.tsx` | Restricted exclusively to Timbre v3.0 standard catalog voices (Chetana, Shivani, etc.). |
| **Polite Follow-ups** | `data/followups.yaml`, `app/followups.py` | Professional protocol milestones; zero pressuring or punitive language. |

---

## 8. TO CONFIRM (Deployment Verification List)

1. **Gnani Live Production Key**: Insert valid production key into `.env` as `GNANI_API_KEY`.
2. **MoHFW Citation Verification**: Have a medical officer cross-reference document titles and page numbers in `data/danger_signs.yaml`.
3. **Native Speaker Audio Review**: Have native healthcare workers review the 10 spoken string files in `data/strings.*.yaml`.
4. **Hardware Microphone Check**: Ensure microphone permission is granted in browser on HTTPS deployment.

---

## 9. Known Limits

1. **Internet Dependency**: Gnani Prisma v3.0 and Timbre v3.0 streaming require an active internet connection (broadband or 4G).
2. **Local Queueing**: If offline, home visit records are encrypted and queued in the browser storage until connectivity is restored.

---

## 10. Quick Start & Execution

### One-Command Start:
```bash
./run.sh
# OR
make run
```

### Running Test Suite:
```bash
make test
# OR
python3 tests/test_all.py
```

### Running Safety Evaluation Benchmark:
```bash
make eval
# OR
python3 scripts/eval.py
```

### Post-Judging Privacy Purge:
```bash
make purge
# OR
python3 scripts/purge.py
```
