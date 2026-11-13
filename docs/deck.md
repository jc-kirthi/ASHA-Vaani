# ASHA Vaani - 6-Slide Hackathon Pitch Deck

---

## Slide 1: Title & Purpose
- **Title**: ASHA Vaani (आशा वाणी)
- **Subtitle**: Zero-Typing Voice Field Register with Deterministic Clinical Safety
- **Category**: Gnani Voice Hackathon 2026 - Problem Statement 1: Healthcare Voice Field Register for ASHA Workers
- **Team**: Team of 4 Engineers (24-Hour Hackathon Build)
- **Tagline**: *"The voice agent that knows when it has not understood, and asks instead of guessing."*

---

## Slide 2: Problem & Clinical Gap
- **1 Million+ ASHA Workers**: Spend 30-40% of their workday filling complex paper registers and navigating unwieldy mobile forms after home visits.
- **The Voice Dilemma**: Generic voice bots hallucinate medical advice, misinterpret Indian spoken numbers ("dhai kilo", "do aath", "saat" vs "saath"), and silently miss maternal/newborn danger signs.
- **Critical Risk**: A missed obstetric danger sign (e.g. vaginal bleeding or newborn hypothermia) is fatal. Voice systems in healthcare cannot guess.

---

## Slide 3: Our Solution - ASHA Vaani
- **Mobile-First PWA**: Runs on low-end Android smartphones via web browser; zero typing required.
- **Triple-Guard Architecture**:
  1. **Strict Deterministic Rule Engine**: Danger signs evaluated ONLY by rules from MoHFW/NHM training modules (3-state output: FLAG, CLEAR, ASK). Zero LLM medical decisions.
  2. **Dual-Method Number Normalizer**: Independent linguistic fraction parser + digital normalizer with implausibility checks and sound-alike confusable guards.
  3. **Noise-Adaptive Strictness**: Automatically detects household ambient noise and adjusts VAD and read-back thoroughness.

---

## Slide 4: Architecture & Gnani Stack
- **Streaming STT**: Powered by **Gnani Prisma v3.0** via WebSocket (`wss://api.vachana.ai/stt/v3/stream`) with real-time 16 kHz PCM streaming and VAD boundary detection.
- **Streaming TTS**: Powered by **Gnani Timbre v3.0** via WebSocket (`wss://api.vachana.ai/api/v1/tts`) with pre-synthesized audio caching and instant client/server barge-in.
- **Privacy & Security**: End-to-end encrypted storage at rest (Fernet AES-128); zero raw audio saved; one-command purge script for post-evaluation compliance.
- **10 Indian Languages**: Native support across Hindi, Kannada, English, Bengali, Marathi, Gujarati, Punjabi, Telugu, Tamil, and Malayalam.

---

## Slide 5: Key Novel Features
- **Sound-Alike Number Guard**: Disambiguates phonetically confusable numbers (e.g. saat/saath, chaar/chaalis, pandrah/pachaas) with forced digit-by-digit spoken confirmation.
- **Auditable Evidence Trail**: Every field stores verbatim source words, audio timestamps, detector origin, and complete revision histories.
- **Patient Roster & Disambiguation**: 30 synthetic patients; automatically prompts house number disambiguation when identical names occur (e.g., Sita Devi House 12 vs House 40).
- **One-Click PHC Referral Slip**: Instant factual handover slips (facts only, no drug/treatment advice) generated immediately upon obstetric danger detection.

---

## Slide 6: Clinical Impact, Feasibility & Demo Conclusion
- **Evaluation Benchmark**:
  - **55 Synthetic Test Cases**: Evaluated across 10 Indian languages.
  - **Danger Signs Missed**: **0 (Zero Misses)** - 100% safety compliance.
  - **Number Normalizer Accuracy**: **100%**.
  - **Time-to-First-Audio (TTFA)**: **<350ms** via pre-synthesized prompts and streaming.
- **Conclusion**: ASHA Vaani turns 30 minutes of tedious manual paperwork into a 60-second spoken conversation, empowering frontline health workers to save lives with certainty.
