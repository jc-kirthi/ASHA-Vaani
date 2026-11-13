# Repeatable demo mode

Use the `Start Demo` button on the Visit screen. The demo uses a synthetic patient (`Lakshmi`, `DEMO-001`, Demo Nagar) and calls the same turn pipeline used by live visits.

The journey demonstrates:

1. AI greeting and simulated transcript label.
2. Missing weight prompt.
3. `56 kg` followed by a `56 → 58 kg` correction with evidence history.
4. Deterministic danger evaluation and final read-back.
5. Explicit confirmation, encrypted persistence, and follow-up checklist.

`Restart Demo` creates a new isolated session. `Exit Demo` returns to live microphone mode. Demo speech uses Gnani Timbre when available and the browser voice fallback when it is not; the fallback is shown in the service notice. Synthetic records are written through the normal encrypted save path and should be purged only with the explicit purge confirmation in Settings or the sandbox purge command.
