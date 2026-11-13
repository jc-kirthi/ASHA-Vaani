# Voice interaction loop

```mermaid
sequenceDiagram
  participant W as ASHA worker
  participant P as PWA
  participant S as Prisma STT
  participant X as Extraction + validation
  participant T as Timbre TTS
  participant Store as Encrypted visit store
  W->>P: Start visit
  P->>T: Language-specific greeting
  T-->>P: Greeting finished
  P->>W: Automatically open microphone
  W->>P: Natural multilingual speech
  P->>S: Stream audio with noise adaptation
  S-->>P: Live transcript chunks
  P->>X: Complete turn + original evidence
  X-->>P: Fields, confidence, evidence, FLAG/ASK/CLEAR
  alt Missing or uncertain field
    P->>T: One short question
    T-->>W: Prompt
    W->>P: Answer; automatic resume
  else Barge-in or correction
    W->>P: Interrupt and correct
    P->>X: Preserve previous value and append correction
  end
  P->>T: Digit-safe read-back
  T-->>W: Full visit summary
  W->>P: Explicit confirmation
  P->>Store: Encrypt and save once
  Store-->>P: Persistence result
  P-->>W: Visit saved + follow-up dashboard
```

The UI labels simulated transcript text in demo mode; it never presents demo text as real STT.
