# ASHA Vaani - Live Judging Demonstration Guide

This guide details the step-by-step presentation script for the live 3-minute hackathon demo, proving all core features, safety guarantees, and novel add-ons under real-world noise.

---

## Demo Script & Scenarios

### (a) Noisy Visit Note (Household/Street Ambient Noise)
- **Action**: Tap **Microphone** button while simulated or real background chatter/street noise is active.
- **Spoken Input**: *"Sita Devi ka ANC visit hai, BP 120 by 80 aur weight 55 kilo hai, koi bleeding nahi hai."*
- **Observed Behavior**:
  - The live noise meter detects ambient sound level and displays **Normal / Noisy** mode.
  - Live transcript renders with word highlighting in real time.
  - The system filters background noise via VAD thresholds and processes the note.

---

### (b) Negated Symptom (No False Alarm)
- **Action**: Speak an utterance containing past or explicit negation.
- **Spoken Input**: *"Pooja Singh ko pehle bleeding thi, ab nahi hai. Sab kuch normal hai."*
- **Observed Behavior**:
  - The deterministic engine evaluates temporal transition (`past_positive_present_negative`).
  - Result: **CLEAR** (Status chip green, no PHC alert triggered).
  - Demonstrates that former episodes do not cause false emergency alerts.

---

### (c) Real Danger Sign (Referral Banner + Flagged Record + Slip)
- **Action**: Speak an utterance containing an active obstetric emergency.
- **Spoken Input**: *"Sunita Sharma ko subah se tez bukhar hai aur bleeding ho rahi hai."*
- **Observed Behavior**:
  - Immediate red full-width **DANGER ALERT BANNER**: *"खतरे का लक्षण! तुरंत PHC रेफर करें"*.
  - Fixed pre-synthesized audio line plays immediately: *"कृपया तुरंत प्राथमिक स्वास्थ्य केंद्र (PHC) रेफर करें।"*
  - Generated factual **PHC Referral Slip** displayed with patient ID, timestamp, worker ID, danger sign name, and MoHFW guideline reference.
  - One-click **"Copy Referral Slip"** button copies the text to clipboard for SMS/WhatsApp handover.

---

### (d) Weight Correction by Spoken Voice During Read-Back
- **Action**: While agent is reading back summary, say a correction.
- **Spoken Input**: *"Nahi, vajan 2.5 nahi do aath kilo hai."*
- **Observed Behavior**:
  - Agent immediately updates the weight card to **2.80 kg** (State: Confirmed).
  - Tapping the card opens the **Evidence Trail**, displaying:
    - Initial value: `2.50 kg`
    - Revised value: `2.80 kg`
    - Source offset and timestamp recorded.

---

### (e) Interruption During Read-Back (Instant Barge-in)
- **Action**: Interrupt the agent mid-sentence while audio is playing.
- **Observed Behavior**:
  - Client-side Web Audio playback cuts out within **<50ms**.
  - Server cancels pending synthesis chunks.
  - UI state shifts immediately from "Speaking" to "Listening", awaiting worker input.

---

### (f) Missing Field (Agent Asks Short Single Question)
- **Action**: Speak a visit note omitting patient weight.
- **Spoken Input**: *"Sita Devi ka visit kiya, BP 120 by 80 hai aur bleeding bilkul nahi hai."*
- **Observed Behavior**:
  - Weight card turns amber/red (State: Missing).
  - Agent asks a short, targeted question: *"कृपया लाभार्थी का वजन बताइए।"*
  - Missing field is never defaulted to `0` or `"none"`.

---

### (g) Sound-Alike Number Guard (Confusable Digit-by-Digit Read-back)
- **Action**: Speak a confusable number word like *saat* (7) vs *saath* (60).
- **Spoken Input**: *"Vajan saat kilo bataya."*
- **Observed Behavior**:
  - Sound-alike number guard triggers.
  - Weight card marked **Uncertain** with alert icon.
  - Agent reads back with disambiguation prompt: *"क्या आपने सात (7) या साठ (60) कहा? कृपया पुष्टि करें।"*
  - Requires spoken or keypad confirmation before allowing save.

---

### (h) Patient Roster Disambiguation (Duplicate Names)
- **Action**: Speak a name shared by multiple villagers.
- **Spoken Input**: *"Sita Devi se mile."*
- **Observed Behavior**:
  - Roster matches two entries in Rampur village:
    - Sita Devi (House 12, ANC Trimester 2)
    - Sita Devi (House 40, PNC Day 14)
  - Agent asks: *"इस नाम की दो लाभार्थी हैं - सीता देवी, मकान नंबर 12 या मकान नंबर 40?"*
  - Worker speaks *"Makan number 12"*, resolving the correct patient ID `BEN-001`.

---

### (i) Switching Language Mid-Demo
- **Action**: Switch language selector from **हिंदी (Hindi)** to **ಕನ್ನಡ (Kannada)** or **English**.
- **Spoken Input**: *"Maguvige tumba jwara ide mathu haalu kudiyuttilla."*
- **Observed Behavior**:
  - Full UI and voice agent seamlessly switch languages.
  - Pre-synthesized audio prompts play in Kannada/English.
  - Danger engine identifies `newborn_not_feeding` and triggers immediate referral in the chosen language.
