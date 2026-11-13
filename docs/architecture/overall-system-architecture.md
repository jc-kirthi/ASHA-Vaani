# Overall system architecture

```mermaid
flowchart TD
  A[ASHA worker] --> B[Mobile-first React PWA]
  B --> C[Microphone + AudioWorklet / safe fallback]
  C --> D[Express WebSocket proxy]
  D --> E[Gnani Prisma v3.0 STT]
  E --> F[Gemini extraction]
  F --> G[Groq fallback]
  G --> H[Deterministic extraction fallback]
  H --> I{Independent validation}
  I --> I1[Number normalizer]
  I --> I2[Sound-alike number guard]
  I --> I3[Evidence trail]
  I1 --> J[Deterministic danger engine]
  I2 --> J
  I3 --> J
  J -->|FLAG| K[Persistent red banner + verified referral slip]
  J -->|ASK| L[One yes/no clarification]
  L --> E
  J -->|CLEAR| M[Missing-field conversation]
  M --> E
  M --> N[Read-back + explicit confirmation]
  N --> O[Gnani Timbre v3.0 TTS / local fallback]
  O --> P[Encrypted JSON AES-256-GCM persistence]
  P --> Q[Follow-up engine]
  P --> R[Patient register + visit history]
  Q --> S[ASHA dashboard]
  R --> S
  N -. correction loop .-> I
```

The deployed repository uses TypeScript/React/Vite, an Express/WS server, JSON persistence encrypted with AES-256-GCM, Gnani Prisma/Timbre, Gemini/Groq fallback extraction, and deterministic safety rules.
