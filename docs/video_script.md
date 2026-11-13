# ASHA Vaani - 2.5 Minute Demonstration Video Script

**Target Duration**: 2 minutes 30 seconds  
**Speaker**: Team Lead / Demonstrator  
**Visual Setting**: Mobile screen capture of ASHA Vaani PWA on Android browser + audio capture.

---

### [0:00 - 0:25] Introduction & Motivation
- **[Visual]**: ASHA Vaani mobile landing screen. Clean healthcare teal interface, large round mic button, language selector set to Hindi.
- **[Speaker]**: *"Welcome to ASHA Vaani, an intelligent, voice-first field register designed for over one million ASHA workers across India. Community health workers spend hours manually filling paper registers after exhausting home visits. With ASHA Vaani, the worker simply speaks naturally in her local language with English code-mix, and the system creates a verified, encrypted clinical register with zero typing. Our core philosophy is simple: the agent knows when it has not understood, and asks instead of guessing."*

---

### [0:25 - 0:55] Turn 1: Spoken Note & AI Disclosure
- **[Visual]**: Demonstrator taps the big round microphone button.
- **[Audio (ASHA Vaani)]**: *"नमस्ते दीदी, मैं एक एआई सहायक हूँ। कृपया अपनी गृह भेंट के नोट्स बताएं।"* (Clear AI disclosure in Hindi).
- **[Speaker]**: *"Notice our Responsible AI guarantee: the agent explicitly declares it is an AI in its very first sentence. Now, let's dictate a visit note with background noise."*
- **[Demonstrator speaks]**: *"Sita Devi se mile Rampur mein, unka weight saade teen kilo nahi, bachhe ka vajan do aath kilo hai aur BP 120 by 80 hai."*
- **[Visual]**: Noise meter shows ambient level; live transcript appears with word highlighting; cards populate with green/amber chips.

---

### [0:55 - 1:30] Turn 2: Disambiguation & Spoken Corrections
- **[Visual]**: Roster check identifies multiple Sita Devis in Rampur village.
- **[Audio (ASHA Vaani)]**: *"सीता देवी नाम की दो लाभार्थी हैं - मकान नंबर 12 या मकान नंबर 40?"*
- **[Demonstrator speaks]**: *"Makan number 12."*
- **[Visual]**: Patient confirmed: Sita Devi (House 12, ANC Trimester 2).
- **[Speaker]**: *"Notice the weight field: our dual-method normalizer re-parsed 'do aath' as exactly 2.80 kg. If I tap the weight card, the full Evidence Trail appears, showing verbatim transcript offsets and detector origin. Nothing is ever overwritten without verification."*

---

### [1:30 - 2:05] Turn 3: Danger Sign Safety & Immediate Referral
- **[Speaker]**: *"Now let's demonstrate our most critical feature: deterministic obstetric safety. Danger signs are decided strictly by rules derived from MoHFW guidelines, never by LLMs."*
- **[Demonstrator speaks]**: *"Lekin didi, unko bleeding pehle nahi thi, ab subah se bleeding ho rahi hai."*
- **[Visual]**: Instant transition! A full-width red banner flashes on screen: **"खतरे का लक्षण! तुरंत PHC रेफर करें"**.
- **[Audio (ASHA Vaani)]**: *"कृपया तुरंत प्राथमिक स्वास्थ्य केंद्र (PHC) रेफर करें।"*
- **[Visual]**: A concise, factual PHC Referral Slip appears with a "Copy Slip" button containing patient details, danger sign, and guideline reference. No unvetted medical advice is ever given.

---

### [2:05 - 2:30] Wrap-up & Judge View
- **[Visual]**: Demonstrator toggles the **Judge View** panel.
- **[Speaker]**: *"In our Judge View, you can inspect live latency metrics—under 350ms time-to-first-audio—extracted JSON payloads, active rule citations, and noise-adaptive modes. Across 55 synthetic evaluation tests in 10 Indian languages, ASHA Vaani achieved zero missed danger signs and 100% number accuracy. With Gnani Prisma v3.0 streaming STT and Timbre v3.0 TTS, ASHA Vaani is ready to empower frontline healthcare across India. Thank you!"*
