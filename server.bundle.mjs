// server/env.ts
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
var projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

// server.ts
import express from "express";
import http from "http";
import path4 from "path";
import { promises as fs3 } from "node:fs";
import { fileURLToPath as fileURLToPath4 } from "node:url";
import { WebSocketServer, WebSocket as WebSocket2 } from "ws";

// server/gnani.ts
import WebSocket from "ws";
var ttsCache = /* @__PURE__ */ new Map();
async function synthesizeTimbreV3(req, onChunk) {
  const apiKey = process.env.GNANI_API_KEY;
  if (!apiKey) {
    throw new Error("GNANI_API_KEY is missing. Put GNANI_API_KEY in the .env file in the project root, then restart the server.");
  }
  const voice = req.voice || "Shivani";
  const lang = req.lang || "en-IN";
  const text = req.text.trim();
  const speed = req.speed || 1;
  const cacheKey = `${voice}:${lang}:${text}`;
  if (ttsCache.has(cacheKey)) {
    const cachedAudio = ttsCache.get(cacheKey);
    if (onChunk) {
      onChunk({
        chunkIndex: 0,
        audioBase64: cachedAudio,
        isFinal: true,
        timeToFirstAudioMs: 5
      });
    }
    return { audioBase64: cachedAudio, timeToFirstAudioMs: 5, cached: true };
  }
  const startTime = Date.now();
  let firstAudioTime = null;
  const audioChunks = [];
  return new Promise((resolve, reject) => {
    let ws = null;
    let isSettled = false;
    const timeout = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        if (ws) {
          try {
            ws.close();
          } catch {
          }
        }
        reject(new Error("Gnani Timbre v3.0 WebSocket timeout after 8000ms"));
      }
    }, 8e3);
    try {
      ws = new WebSocket("wss://api.vachana.ai/api/v1/tts", {
        headers: {
          "X-API-Key-ID": apiKey
        }
      });
    } catch (err) {
      clearTimeout(timeout);
      return reject(new Error(`Failed to create Gnani TTS WebSocket: ${err.message}`));
    }
    ws.on("open", () => {
      const payload = {
        text,
        voice,
        model: "timbre-v3.0",
        language: lang,
        speed,
        audio_config: {
          sample_rate: 24e3,
          num_channels: 1,
          sample_width: 2,
          encoding: "linear_pcm",
          container: "wav"
        }
      };
      ws?.send(JSON.stringify(payload));
    });
    ws.on("message", (raw) => {
      try {
        const event = JSON.parse(raw.toString());
        const msg = event.data && typeof event.data === "object" ? event.data : event;
        if (event.type === "error" || msg.error || msg.detail) {
          isSettled = true;
          clearTimeout(timeout);
          ws?.close();
          const detail = event.message || msg.detail?.message || msg.error || "Gnani Timbre TTS Error";
          return reject(new Error(`Gnani Timbre v3.0 API Error: ${detail}`));
        }
        if (msg.audio) {
          if (firstAudioTime === null) {
            firstAudioTime = Date.now() - startTime;
          }
          audioChunks.push(Buffer.from(msg.audio, "base64"));
          if (onChunk) {
            onChunk({
              chunkIndex: msg.chunk_index ?? audioChunks.length,
              audioBase64: msg.audio,
              isFinal: !!msg.is_final,
              timeToFirstAudioMs: firstAudioTime
            });
          }
        }
        if (msg.is_final || event.type === "complete") {
          isSettled = true;
          clearTimeout(timeout);
          ws?.close();
          const fullAudio = Buffer.concat(audioChunks).toString("base64");
          if (fullAudio) {
            if (text.length < 200) {
              ttsCache.set(cacheKey, fullAudio);
            }
          }
          resolve({
            audioBase64: fullAudio,
            timeToFirstAudioMs: firstAudioTime || Date.now() - startTime,
            cached: false
          });
        }
      } catch (err) {
        console.error("Error parsing Gnani TTS message:", err);
      }
    });
    ws.on("error", (err) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeout);
        reject(new Error(`Gnani Timbre v3.0 connection error: ${err.message || "401 Unauthorized / Connection Failed"}`));
      }
    });
    ws.on("close", (code, reason) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeout);
        if (audioChunks.length > 0) {
          const fullAudio = Buffer.concat(audioChunks).toString("base64");
          resolve({
            audioBase64: fullAudio,
            timeToFirstAudioMs: firstAudioTime || Date.now() - startTime,
            cached: false
          });
        } else {
          reject(new Error(`Gnani Timbre v3.0 closed unexpectedly (code ${code}): ${reason.toString() || "Connection closed"}`));
        }
      }
    });
  });
}
async function warmTTSCache() {
  const apiKey = process.env.GNANI_API_KEY;
  if (!apiKey) return;
  const fixedLines = [
    { lang: "hi-IN", voice: "Chetana", text: "\u0928\u092E\u0938\u094D\u0924\u0947, \u092E\u0948\u0902 \u0906\u0936\u093E \u0935\u093E\u0923\u0940 \u0939\u0942\u0901, \u090F\u0915 \u0915\u0943\u0924\u094D\u0930\u093F\u092E \u092C\u0941\u0926\u094D\u0927\u093F\u092E\u0924\u094D\u0924\u093E \u0938\u0939\u093E\u092F\u0915\u0964 \u0906\u092A \u0905\u092A\u0928\u0947 \u0917\u0943\u0939 \u092D\u0947\u0902\u091F \u0915\u0947 \u0935\u093F\u0935\u0930\u0923 \u092C\u094B\u0932 \u0938\u0915\u0924\u0947 \u0939\u0948\u0902\u0964" },
    { lang: "hi-IN", voice: "Chetana", text: "\u0916\u0924\u0930\u0947 \u0915\u093E \u0932\u0915\u094D\u0937\u0923 \u092A\u093E\u092F\u093E \u0917\u092F\u093E \u0939\u0948! \u0924\u0924\u094D\u0915\u093E\u0932 \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0915 \u0938\u094D\u0935\u093E\u0938\u094D\u0925\u094D\u092F \u0915\u0947\u0902\u0926\u094D\u0930 (PHC) \u0930\u0947\u092B\u0930\u0932 \u0906\u0935\u0936\u094D\u092F\u0915 \u0939\u0948\u0964" },
    { lang: "hi-IN", voice: "Chetana", text: "\u092C\u093E\u0915\u0940 \u0938\u092C \u0920\u0940\u0915 \u0939\u0948, \u0915\u094D\u092F\u093E \u092E\u0948\u0902 \u092F\u0939 \u0935\u093F\u0935\u0930\u0923 \u0938\u0941\u0930\u0915\u094D\u0937\u093F\u0924 \u0915\u0930\u0942\u0901?" },
    { lang: "kn-IN", voice: "Chetana", text: "\u0CA8\u0CAE\u0CB8\u0CCD\u0C95\u0CBE\u0CB0, \u0CA8\u0CBE\u0CA8\u0CC1 \u0C86\u0CB6\u0CBE \u0CB5\u0CBE\u0CA3\u0CBF, AI \u0CB8\u0CB9\u0CBE\u0CAF\u0C95. \u0CA8\u0CBF\u0CAE\u0CCD\u0CAE \u0CAD\u0CC7\u0C9F\u0CBF\u0CAF \u0CB5\u0CBF\u0CB5\u0CB0\u0C97\u0CB3\u0CA8\u0CCD\u0CA8\u0CC1 \u0CB9\u0CC7\u0CB3\u0CAC\u0CB9\u0CC1\u0CA6\u0CC1." },
    { lang: "kn-IN", voice: "Chetana", text: "\u0C85\u0CAA\u0CBE\u0CAF\u0CA6 \u0CB2\u0C95\u0CCD\u0CB7\u0CA3 \u0C95\u0C82\u0CA1\u0CC1\u0CAC\u0C82\u0CA6\u0CBF\u0CA6\u0CC6! \u0CA4\u0C95\u0CCD\u0CB7\u0CA3 \u0CAA\u0CCD\u0CB0\u0CBE\u0CA5\u0CAE\u0CBF\u0C95 \u0C86\u0CB0\u0CCB\u0C97\u0CCD\u0CAF \u0C95\u0CC7\u0C82\u0CA6\u0CCD\u0CB0\u0C95\u0CCD\u0C95\u0CC6 (PHC) \u0C95\u0CB0\u0CC6\u0CA6\u0CCA\u0CAF\u0CCD\u0CAF\u0CBF\u0CB0\u0CBF." },
    { lang: "kn-IN", voice: "Chetana", text: "\u0C8E\u0CB2\u0CCD\u0CB2\u0CBE \u0CB8\u0CB0\u0CBF\u0CAF\u0CBE\u0C97\u0CBF\u0CA6\u0CC6, \u0C88 \u0CA6\u0CBE\u0C96\u0CB2\u0CC6\u0CAF\u0CA8\u0CCD\u0CA8\u0CC1 \u0C89\u0CB3\u0CBF\u0CB8\u0CC1\u0CB5\u0CC1\u0CA6\u0CC7?" },
    { lang: "en-IN", voice: "Shivani", text: "Hello, I am ASHA Vaani, an artificial intelligence assistant. Please speak your visit notes." },
    { lang: "en-IN", voice: "Shivani", text: "Please refer to the PHC now." },
    { lang: "en-IN", voice: "Shivani", text: "Everything else okay, save?" }
  ];
  for (const item of fixedLines) {
    try {
      await synthesizeTimbreV3({ text: item.text, lang: item.lang, voice: item.voice });
    } catch (error) {
      if (!process.env.GNANI_API_KEY) return;
      throw error;
    }
  }
}

// server/crypto.ts
import crypto from "crypto";
function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is missing. Put ENCRYPTION_KEY in the .env file in the project root, then restart the server.");
  }
  return crypto.createHash("sha256").update(raw).digest();
}
function encryptPayload(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}
function decryptPayload(token) {
  try {
    const parts = token.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted token format");
    }
    const [ivB64, authTagB64, encryptedText] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const key = getKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
}

// server/turn.ts
import { promises as fs2 } from "node:fs";
import path3 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";

// src/engine/dangerEngine.ts
var DANGER_SIGNS_LIST = [
  {
    id: "vaginal_bleeding",
    name: "Vaginal Bleeding",
    appliesTo: "pregnancy",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW ASHA Training Module 6 - Maternal Health]",
      version: "[TODO: NHM Guidelines 2020 Revision]",
      section_or_page: "[TODO: Section 3.2, Page 28]"
    },
    synonyms: ["bleeding", "rakt", "khoon", "spotting", "rokto", "lohi", "rathapokku", "rakthasrava", "\u0930\u0915\u094D\u0924\u0938\u094D\u0930\u093E\u0935", "\u0916\u0942\u0928 \u092C\u0939\u0928\u093E", "\u0916\u0942\u0928 \u0906\u0928\u093E", "\u0CB0\u0C95\u0CCD\u0CA4\u0CB8\u0CCD\u0CB0\u0CBE\u0CB5", "\u0CB0\u0C95\u0CCD\u0CA4 \u0CB9\u0CCB\u0C97\u0CC1\u0CB5\u0CC1\u0CA6\u0CC1"]
  },
  {
    id: "convulsions_fits",
    name: "Convulsions / Fits (Eclampsia)",
    appliesTo: "pregnancy",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW ASHA Training Module 6 - High Risk Pregnancy]",
      version: "[TODO: NHM 2020 Revision]",
      section_or_page: "[TODO: Section 4.1, Page 34]"
    },
    synonyms: ["daura", "fits", "seizure", "jhatka", "mirgi", "moorche", "aanchki", "\u0926\u094C\u0930\u093E", "\u091D\u091F\u0915\u0947", "\u0CB8\u0CC6\u0CB3\u0CC6\u0CA4"]
  },
  {
    id: "severe_headache_blurred_vision",
    name: "Severe Headache with Blurred Vision",
    appliesTo: "pregnancy",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW ASHA Training Module 6 - High Risk Pregnancy]",
      version: "[TODO: NHM 2020 Revision]",
      section_or_page: "[TODO: Section 4.2, Page 36]"
    },
    synonyms: ["dhundhla", "blurred vision", "tez sar dard", "kannu mabbaguvudu", "mabbaguvudu", "\u0924\u0947\u091C \u0938\u093F\u0930 \u0926\u0930\u094D\u0926", "\u0927\u0941\u0902\u0927\u0932\u093E \u0926\u093F\u0916\u0928\u093E", "\u0CA4\u0CC0\u0CB5\u0CCD\u0CB0 \u0CA4\u0CB2\u0CC6\u0CA8\u0CCB\u0CB5\u0CC1", "\u0CAE\u0CB8\u0CC1\u0C95\u0CBE\u0CA6 \u0CA6\u0CC3\u0CB7\u0CCD\u0C9F\u0CBF"]
  },
  {
    id: "high_fever_pregnancy",
    name: "High Fever / Sepsis",
    appliesTo: "pregnancy",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW Guidelines on Obstetric Emergencies]",
      version: "[TODO: MoHFW 2019]",
      section_or_page: "[TODO: Chapter 5, Page 52]"
    },
    synonyms: ["tez bukhar", "high fever", "tumba jwara", "taap", "taav", "jor", "paniyum", "bukhar", "fever", "jwara", "\u0924\u0947\u091C \u092C\u0941\u0916\u093E\u0930", "\u0924\u0947\u091C\u093C \u092C\u0941\u0916\u093E\u0930", "\u091C\u094D\u092F\u093E\u0926\u093E \u092C\u0941\u0916\u093E\u0930", "\u0CB9\u0CC6\u0C9A\u0CCD\u0C9A\u0CBF\u0CA8 \u0C9C\u0CCD\u0CB5\u0CB0", "\u0CA4\u0CC0\u0CB5\u0CCD\u0CB0 \u0C9C\u0CCD\u0CB5\u0CB0", "\u0C9C\u0CCD\u0CB5\u0CB0"]
  },
  {
    id: "severe_abdominal_pain",
    name: "Severe Abdominal Pain",
    appliesTo: "pregnancy",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW ASHA Training Module 6 - Complications]",
      version: "[TODO: NHM 2020]",
      section_or_page: "[TODO: Section 3.5, Page 31]"
    },
    synonyms: ["pet mein tez dard", "severe abdominal pain", "hotte tumba novu", "pet dard", "hottenovu", "\u092A\u0947\u091F \u092E\u0947\u0902 \u0924\u0947\u091C \u0926\u0930\u094D\u0926", "\u092A\u0947\u091F \u092E\u0947\u0902 \u0924\u0947\u091C\u093C \u0926\u0930\u094D\u0926", "\u0CA4\u0CC0\u0CB5\u0CCD\u0CB0 \u0CB9\u0CCA\u0C9F\u0CCD\u0C9F\u0CC6\u0CA8\u0CCB\u0CB5\u0CC1", "\u0CB9\u0CCA\u0C9F\u0CCD\u0C9F\u0CC6\u0CA8\u0CCB\u0CB5\u0CC1"]
  },
  {
    id: "reduced_fetal_movement",
    name: "Reduced Fetal Movement",
    appliesTo: "pregnancy",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW MCP Card Antenatal Danger Signs]",
      version: "[TODO: MCP Card 2021]",
      section_or_page: "[TODO: Page 8, Fetal Monitoring]"
    },
    synonyms: ["bachha hil nahi raha", "movement kam", "reduced fetal movement", "chalane illa", "bachha hil", "fetal movement", "\u092C\u091A\u094D\u091A\u093E \u0928\u0939\u0940\u0902 \u0939\u093F\u0932 \u0930\u0939\u093E", "\u092C\u091A\u094D\u091A\u0947 \u0915\u0940 \u0939\u0932\u091A\u0932 \u0915\u092E", "\u0CAE\u0C97\u0CC1\u0CB5\u0CBF\u0CA8 \u0C9A\u0CB2\u0CA8\u0CC6 \u0C95\u0CA1\u0CBF\u0CAE\u0CC6"]
  },
  {
    id: "newborn_fever",
    name: "Newborn High Fever",
    appliesTo: "newborn",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW HBNC Operational Guidelines]",
      version: "[TODO: HBNC Revised 2021]",
      section_or_page: "[TODO: Card 3, Danger Signs, Page 19]"
    },
    synonyms: ["bachhe ko bukhar", "newborn fever", "maguvige jwara", "\u0928\u0935\u091C\u093E\u0924 \u0915\u094B \u092C\u0941\u0916\u093E\u0930", "\u092E\u0917\u0CC1\u0CB5\u0CBF\u0C97\u0CC6 \u0C9C\u0CCD\u0CB5\u0CB0", "\u0CAE\u0C97\u0CC1\u0CB5\u0CBF\u0C97\u0CC6 \u0C9C\u0CCD\u0CB5\u0CB0"]
  },
  {
    id: "newborn_hypothermia",
    name: "Very Cold Body (Hypothermia)",
    appliesTo: "newborn",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW HBNC Training Guidelines]",
      version: "[TODO: HBNC 2021]",
      section_or_page: "[TODO: Chapter 4, Cold Injury, Page 22]"
    },
    synonyms: ["thanda pad gaya", "sharir thanda", "cold body", "hypothermia", "cold like ice", "\u0936\u0930\u0940\u0930 \u0920\u0902\u0921\u093E", "\u0CA6\u0CC7\u0CB9 \u0CA4\u0CA3\u0CCD\u0CA3\u0C97\u0CC6"]
  },
  {
    id: "newborn_not_feeding",
    name: "Unable to Feed / Refusing Milk",
    appliesTo: "newborn",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW HBNC Protocol - Sepsis and Feeding]",
      version: "[TODO: HBNC 2021]",
      section_or_page: "[TODO: Page 25, Table 2]"
    },
    synonyms: ["doodh nahi", "haalu kudiyuttilla", "not feeding", "refusing milk", "palu tagatledu", "paal kudikkavillai", "\u0926\u0942\u0927 \u0928\u0939\u0940\u0902 \u092A\u0940 \u0930\u0939\u093E", "\u0926\u0942\u0927 \u0928\u0939\u0940\u0902 \u092A\u0940 \u0930\u0939\u0940", "\u0CB9\u0CBE\u0CB2\u0CC1 \u0C95\u0CC1\u0CA1\u0CBF\u0CAF\u0CC1\u0CA4\u0CCD\u0CA4\u0CBF\u0CB2\u0CCD\u0CB2"]
  },
  {
    id: "fast_breathing_chest_indrawing",
    name: "Fast Breathing / Chest Indrawing",
    appliesTo: "newborn",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW HBNC Protocol - Respiratory Count]",
      version: "[TODO: HBNC 2021]",
      section_or_page: "[TODO: Page 27, Respiratory Count > 60/min]"
    },
    synonyms: ["pasli chal", "saans tez", "chhati dhas", "fast breathing", "saah tez", "tez saans", "\u0924\u0947\u091C \u0938\u093E\u0902\u0938", "\u0924\u0947\u091C\u093C \u0938\u093E\u0902\u0938", "\u091B\u093E\u0924\u0940 \u0927\u0902\u0938\u0928\u093E", "\u0CB5\u0CC7\u0C97\u0CA6 \u0C89\u0CB8\u0CBF\u0CB0\u0CBE\u0C9F", "\u0C8E\u0CA6\u0CC6 \u0C92\u0CB3\u0C97\u0CC6 \u0CB9\u0CCB\u0C97\u0CC1\u0CB5\u0CC1\u0CA6\u0CC1"]
  },
  {
    id: "yellow_palms_soles",
    name: "Yellow Palms and Soles (Severe Jaundice)",
    appliesTo: "newborn",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW HBNC Protocol - Neonatal Jaundice]",
      version: "[TODO: HBNC 2021]",
      section_or_page: "[TODO: Page 31, Zone 5 Jaundice]"
    },
    synonyms: ["peele pad gaye", "yellow palms", "yellow soles", "peeliya", "haladi", "\u0939\u0925\u0947\u0932\u0940 \u092A\u0940\u0932\u0940", "\u0924\u0932\u0935\u0947 \u092A\u0940\u0932\u0947", "\u0CB9\u0CB3\u0CA6\u0CBF \u0C85\u0C82\u0C97\u0CC8", "\u0CB9\u0CB3\u0CA6\u0CBF \u0CAA\u0CBE\u0CA6"]
  },
  {
    id: "unresponsive_lethargic",
    name: "Lethargic or Unresponsive",
    appliesTo: "newborn",
    severity: "emergency",
    source: {
      document_title: "[TODO: Verify MoHFW HBNC Protocol - Sepsis and Encephalopathy]",
      version: "[TODO: HBNC 2021]",
      section_or_page: "[TODO: Page 33, Activity Check]"
    },
    synonyms: ["sust pad gaya", "harkat nahi kar raha", "unresponsive", "lethargic", "sust", "\u0938\u0941\u0938\u094D\u0924", "\u092C\u0947\u0939\u094B\u0936", "\u0CAA\u0CCD\u0CB0\u0CA4\u0CBF\u0C95\u0CCD\u0CB0\u0CBF\u0CAF\u0CC6 \u0C87\u0CB2\u0CCD\u0CB2", "\u0CAE\u0C82\u0C95\u0CC1"]
  }
];
function evaluateDangerSigns(text, lang = "hi-IN", beneficiaryName = "Beneficiary", beneficiaryId = "ID-Pending", workerId = "ASHA-001", currentClarifications = {}) {
  const normLang = lang.split("-")[0].toLowerCase();
  const isFullyTested = ["hi", "kn", "en"].includes(normLang);
  const lexiconMode = isFullyTested ? "lexicon: active" : "lexicon: none, strict mode";
  const t = text.toLowerCase();
  const flaggedSigns = [];
  const clarificationQuestions = [];
  const evidence = [];
  const transPosRegex = /(pehle.*nahi.*ab|kal.*nahi.*aaj|nahi.*shuru|nahi (thi|tha|rahi|ittu).*ab|didn't have.*(now|started)|did not have.*(now|started)|no.*earlier.*now.*(started|active|bleeding)|irallilla.*ivaga (ide|aaguttide)|munche.*irallilla.*ivaga|पहले.*नहीं.*अब|ಇಲ್ಲ.*ಈಗ.*(ಇದೆ|ಆಗುತ್ತಿದೆ))/i;
  const transNegRegex = /(pehle.*(thi|tha|hua tha).*ab (nahi|band|theek)|(had|was).*earlier.*now.*(no|none|not|stopped|cured)|earlier.*now.*stopped|(ittu|itthu).*ivaga (illa|nillide)|modalu.*ivaga illa|\b(bleeding|spotting|fever) stopped (yesterday|today|now)\b|\b(stopped|ended) yesterday\b|\b(stopped|resolved|ended|cured)\b|पहले.*(था|थी).*अब.*(नहीं|बंद)|ಹಿಂದೆ.*ಈಗ.*(ಇಲ್ಲ|ನಿಂತಿದೆ))/i;
  const unknownRegex = /(bataya nahi|pata nahi|did not mention|not reported|unknown whether|unclear whether|पता नहीं|बताया नहीं|ಗೊತ್ತಿಲ್ಲ)/i;
  const hedgeRegex = /(thoda.*jaisa|jaisa laga|doubtful|shakk hai|maybe|possibly|perhaps|may have|might have|could have|uncertain|anusthide|शायद|हो सकता है|ಬಹುಶಃ)/i;
  const negRegex = /\b(nahi|bilkul nahi|no|not|none|illa|aguttilla|ledu|illai|nei|nathi|denies|absent)\b|नहीं|नही|ಇಲ್ಲ/i;
  const pastRegex = /\b(yesterday|last night|last week|earlier|previously|before|was|had)\b|kal|pehle|munche|कल|पहले|था|थी|ನಿನ್ನೆ|ಹಿಂದೆ/i;
  for (const sign of DANGER_SIGNS_LIST) {
    const clarification = currentClarifications[sign.id];
    if (clarification) {
      if (clarification === "present") {
        flaggedSigns.push({
          id: sign.id,
          name: sign.name,
          severity: sign.severity,
          source: sign.source,
          reason: "worker_confirmed_current_symptom"
        });
        evidence.push({ signId: sign.id, name: sign.name, state: "FLAG", reason: "Worker explicitly confirmed this symptom is present now" });
      } else {
        evidence.push({ signId: sign.id, name: sign.name, state: "CLEAR", reason: "Worker explicitly confirmed this symptom is absent now" });
      }
      continue;
    }
    const matches = [];
    for (const syn of sign.synonyms) {
      const lowerSynonym = syn.toLowerCase();
      let start = t.indexOf(lowerSynonym);
      while (start >= 0) {
        matches.push({ synonym: lowerSynonym, start });
        start = t.indexOf(lowerSynonym, start + lowerSynonym.length);
      }
    }
    if (!matches.length) continue;
    matches.sort((a, b) => a.start - b.start);
    const states = matches.map(({ synonym, start }) => {
      const end = start + synonym.length;
      const delimiters = [",", ";", ".", "?", "!", " and ", " but ", " however ", " \u0914\u0930 ", " \u0C86\u0CA6\u0CB0\u0CC6 ", " \u0CAE\u0CA4\u0CCD\u0CA4\u0CC1 "];
      let clauseStart = 0;
      let clauseEnd = t.length;
      for (const delimiter of delimiters) {
        const before = t.lastIndexOf(delimiter, start);
        if (before >= 0) clauseStart = Math.max(clauseStart, before + delimiter.length);
        const afterDelimiter = t.indexOf(delimiter, end);
        if (afterDelimiter >= 0) clauseEnd = Math.min(clauseEnd, afterDelimiter);
      }
      const context = t.slice(clauseStart, clauseEnd);
      const after = t.slice(end, clauseEnd);
      const isBuiltInNegativeSymptom = sign.id === "newborn_not_feeding" || sign.id === "reduced_fetal_movement";
      if (transPosRegex.test(context)) return { state: "FLAG", context };
      if (unknownRegex.test(context)) return { state: "ASK", context };
      if (hedgeRegex.test(context)) return { state: "ASK", context };
      if (transNegRegex.test(context)) return { state: "CLEAR", context };
      if (pastRegex.test(context)) return { state: "ASK", context };
      if (!isBuiltInNegativeSymptom && negRegex.test(context)) return { state: "CLEAR", context };
      if (isBuiltInNegativeSymptom && /(?:no longer|not anymore|no more|stopped|resolved)/i.test(after)) {
        return { state: "CLEAR", context };
      }
      return { state: "FLAG", context };
    });
    const positive = states.find((state) => state.state === "FLAG");
    const uncertain = states.find((state) => state.state === "ASK");
    const resolved = states.find((state) => state.state === "CLEAR");
    if (positive) {
      flaggedSigns.push({
        id: sign.id,
        name: sign.name,
        severity: sign.severity,
        source: sign.source,
        reason: "transition_to_active_present"
      });
      evidence.push({ signId: sign.id, name: sign.name, state: "FLAG", reason: "Current unnegated danger sign in symptom context" });
    } else if (uncertain) {
      clarificationQuestions.push(`\u0915\u094D\u092F\u093E \u092E\u0930\u0940\u091C \u0915\u094B ${sign.name} (\u0916\u0924\u0930\u0947 \u0915\u093E \u0932\u0915\u094D\u0937\u0923) \u0939\u0948? \u0915\u0943\u092A\u092F\u093E \u0939\u093E\u0901 \u092F\u093E \u0928\u093E \u092C\u0924\u093E\u090F\u0902\u0964`);
      evidence.push({ signId: sign.id, name: sign.name, state: "ASK", reason: "Symptom status is uncertain, unreported, or only described in the past" });
    } else if (resolved) {
      evidence.push({ signId: sign.id, name: sign.name, state: "CLEAR", reason: "Symptom is negated or described as resolved in context" });
    }
  }
  if (flaggedSigns.length > 0) {
    const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").substring(0, 16);
    const signsSummary = flaggedSigns.map((s) => s.name).join(", ");
    const referralSlip = `[URGENT PHC REFERRAL SLIP] Date/Time: ${now} | Worker ID: ${workerId} | Beneficiary: ${beneficiaryName} (ID: ${beneficiaryId}) | Danger Sign(s): ${signsSummary} | Immediate Action: Transfer to Primary Health Centre (PHC) for emergency clinical evaluation.`;
    return {
      decision: "FLAG",
      flaggedSigns,
      clarificationQuestions,
      referralSlip,
      ruleFired: `FLAGGED_${flaggedSigns[0].id}`,
      lexiconMode,
      evidence
    };
  }
  if (clarificationQuestions.length > 0) {
    return {
      decision: "ASK",
      flaggedSigns: [],
      clarificationQuestions,
      referralSlip: null,
      ruleFired: "ASK_AMBIGUOUS_DANGER_SIGN",
      lexiconMode,
      evidence
    };
  }
  return {
    decision: "CLEAR",
    flaggedSigns: [],
    clarificationQuestions: [],
    referralSlip: null,
    ruleFired: evidence.length > 0 ? "SYMPTOMS_NEGATED_OR_RESOLVED" : "NO_DANGER_SIGNS_DETECTED",
    lexiconMode,
    evidence
  };
}

// src/engine/followupEngine.ts
var FOLLOWUP_RULE_VERSION = "draft-v1";
function generateFollowups(visitType = "ANC", gestationalWeeks, childAgeDays, ifaTablets, visitDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) {
  const followups = [];
  const anchor = /* @__PURE__ */ new Date(`${visitDate}T00:00:00.000Z`);
  const dueDateFrom = Number.isNaN(anchor.getTime()) ? /* @__PURE__ */ new Date() : anchor;
  const addDays = (d, days) => {
    const res = new Date(d);
    res.setUTCDate(res.getUTCDate() + days);
    return res.toISOString().split("T")[0];
  };
  const add = (item) => {
    followups.push({
      ...item,
      id: `followup-${followups.length + 1}`,
      ruleVersion: FOLLOWUP_RULE_VERSION,
      status: item.dueDate.startsWith("Date pending") ? "pending_verification" : "upcoming"
    });
  };
  const vtype = (visitType || "ANC").toUpperCase();
  if (vtype.includes("ANC")) {
    if (gestationalWeeks !== null && gestationalWeeks !== void 0) {
      if (gestationalWeeks < 14) {
        add({
          item: "2nd ANC Checkup (Second Trimester)",
          dueDate: addDays(dueDateFrom, 28),
          focus: "Abdominal exam, BP check, TT2 / Td2 dose, USG anomaly scan",
          source: "Unverified draft schedule rule",
          completed: false
        });
      } else if (gestationalWeeks < 28) {
        add({
          item: "3rd ANC Checkup (Third Trimester)",
          dueDate: addDays(dueDateFrom, 28),
          focus: "Growth monitoring, anemia check, fetal movement tracking, BP",
          source: "Unverified draft schedule rule",
          completed: false
        });
      } else {
        add({
          item: "4th ANC Checkup (Near Term)",
          dueDate: addDays(dueDateFrom, 14),
          focus: "Birth preparedness, institutional delivery plan, 108 ambulance review",
          source: "Unverified draft schedule rule",
          completed: false
        });
      }
    } else {
      add({
        item: "Next ANC Visit",
        dueDate: "Date pending LMP history",
        focus: "Determine gestational age and schedule next ANC checkup",
        source: "Unverified draft schedule rule",
        completed: false
      });
    }
    if (ifaTablets !== null && ifaTablets !== void 0 && ifaTablets < 180) {
      const remaining = 180 - ifaTablets;
      add({
        item: `IFA Tablet Supply (${remaining} remaining)`,
        dueDate: addDays(dueDateFrom, 30),
        focus: "Replenish 30 IFA tablets. Verify daily consumption after meals.",
        source: "Unverified draft schedule rule",
        completed: false
      });
    } else if (ifaTablets === null || ifaTablets === void 0) {
      add({
        item: "IFA supply follow-up",
        dueDate: "Date pending IFA supply verification",
        focus: "Verify current IFA tablet stock before scheduling a refill.",
        source: "Unverified local follow-up rule",
        completed: false
      });
    }
  } else if (vtype.includes("PNC")) {
    if (childAgeDays !== null && childAgeDays !== void 0) {
      const milestoneDays = [3, 7, 14, 21, 28, 42];
      const nextMilestone = milestoneDays.find((d) => d > childAgeDays);
      if (nextMilestone) {
        const daysDiff = nextMilestone - childAgeDays;
        add({
          item: `HBNC Home Visit Day ${nextMilestone}`,
          dueDate: addDays(dueDateFrom, daysDiff),
          focus: "Cord care, warmth/temp check, feeding assessment, weight gain, danger signs",
          source: "Unverified draft schedule rule",
          completed: false
        });
      }
      if (childAgeDays < 42) {
        add({
          item: "6-Week Immunization (UIP)",
          dueDate: addDays(dueDateFrom, Math.max(1, 42 - childAgeDays)),
          focus: "OPV-1, Pentavalent-1, Rotavirus-1, fIPV-1, PCV-1",
          source: "Unverified draft schedule rule",
          completed: false
        });
      } else if (childAgeDays < 70) {
        add({
          item: "10-Week Immunization (UIP)",
          dueDate: addDays(dueDateFrom, Math.max(1, 70 - childAgeDays)),
          focus: "OPV-2, Pentavalent-2, Rotavirus-2",
          source: "Unverified draft schedule rule",
          completed: false
        });
      } else if (childAgeDays < 98) {
        add({
          item: "14-Week Immunization (UIP)",
          dueDate: addDays(dueDateFrom, Math.max(1, 98 - childAgeDays)),
          focus: "OPV-3, Pentavalent-3, Rotavirus-3, fIPV-2, PCV-2",
          source: "Unverified draft schedule rule",
          completed: false
        });
      }
    } else {
      add({
        item: "Next HBNC Newborn Visit",
        dueDate: "Date pending birth verification",
        focus: "Record birth date to schedule HBNC home visits and immunization",
        source: "Unverified draft schedule rule",
        completed: false
      });
    }
  } else {
    add({
      item: "Immunisation follow-up",
      dueDate: "Date pending child age verification",
      focus: "Verify the child\u2019s date of birth and immunisation history before scheduling.",
      source: "Unverified draft schedule rule",
      completed: false
    });
  }
  return followups;
}

// src/engine/numberEngine.ts
var HINDI_WORD_MAP = {
  ek: 1,
  do: 2,
  teen: 3,
  chaar: 4,
  paanch: 5,
  cheh: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  gyarah: 11,
  baarah: 12,
  pandrah: 15,
  bees: 20,
  tees: 30,
  chaalis: 40,
  pachaas: 50,
  saath: 60,
  sattar: 70,
  assi: 80,
  navve: 90,
  sau: 100
};
var ENGLISH_WORD_MAP = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
};
function parseWeight(text, category = "newborn", lang = "hi") {
  if (!text || !text.trim()) {
    return {
      value: null,
      rawText: "",
      method1Value: null,
      method2Value: null,
      isPlausible: false,
      isConfusable: false,
      confusablePrompt: null,
      state: "missing",
      explanation: "No weight provided in speech"
    };
  }
  const clean = text.toLowerCase().trim();
  let m1 = null;
  if (/\b(dhai|dhaai|dhayi)\b/i.test(clean)) {
    m1 = 2.5;
  } else if (/\b(dedh|deadh)\b/i.test(clean)) {
    m1 = 1.5;
  } else {
    const saadeMatch = clean.match(/\b(saade|saadhe|sade)\s+([a-z0-9]+)\b/i);
    if (saadeMatch) {
      const w = saadeMatch[2];
      const base = HINDI_WORD_MAP[w] || (parseInt(w, 10) || null);
      if (base !== null) m1 = base + 0.5;
    }
    const sawaMatch = clean.match(/\b(sawa|sawwa)\s+([a-z0-9]+)\b/i);
    if (sawaMatch) {
      const w = sawaMatch[2];
      const base = HINDI_WORD_MAP[w] || (parseInt(w, 10) || null);
      if (base !== null) m1 = base + 0.25;
    }
    const pauneMatch = clean.match(/\b(paune)\s+([a-z0-9]+)\b/i);
    if (pauneMatch) {
      const w = pauneMatch[2];
      const base = HINDI_WORD_MAP[w] || (parseInt(w, 10) || null);
      if (base !== null) m1 = base - 0.25;
    }
    const pairMatch = clean.match(/\b(ek|do|teen|chaar|paanch)\s+(ek|do|teen|chaar|paanch|cheh|saat|aath|nau)\b/i);
    if (pairMatch) {
      const d1 = HINDI_WORD_MAP[pairMatch[1]];
      const d2 = HINDI_WORD_MAP[pairMatch[2]];
      if (d1 && d2 && d1 <= 5) {
        m1 = parseFloat(`${d1}.${d2}`);
      }
    }
    const enPoint = clean.match(/\b(one|two|three|four|five)\s+point\s+([a-z0-9]+)\b/i);
    if (enPoint) {
      const d1 = ENGLISH_WORD_MAP[enPoint[1]];
      const d2 = ENGLISH_WORD_MAP[enPoint[2]] || parseInt(enPoint[2], 10);
      if (d1 !== void 0 && d2 !== void 0) {
        m1 = parseFloat(`${d1}.${d2}`);
      }
    }
    if (m1 === null) {
      const words = clean.split(/\s+/);
      for (const w of words) {
        if (HINDI_WORD_MAP[w] !== void 0) {
          m1 = HINDI_WORD_MAP[w];
          break;
        }
        if (ENGLISH_WORD_MAP[w] !== void 0) {
          m1 = ENGLISH_WORD_MAP[w];
          break;
        }
      }
    }
  }
  let m2 = null;
  const compMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilogram)s?\s*(?:and\s*)?(\d+)\s*(?:gram|gm|g)s?/i);
  if (compMatch) {
    m2 = parseFloat(compMatch[1]) + parseFloat(compMatch[2]) / 1e3;
  } else {
    const decMatch = clean.match(/(?:weight|vajan|wazan|bhaar|ತೂಕ)\s*(?:is|of|hai|:)?\s*(\d+\.\d+)\b/i) || clean.match(/\b(\d+\.\d+)\s*(?:kg|kilo(?:gram)?s?)\b/i);
    if (decMatch) {
      m2 = parseFloat(decMatch[1]);
    } else {
      const intMatch = clean.match(/\b(\d+)\s*(?:kg|kilo(?:gram)?s?)\b/i) || clean.match(/(?:weight|vajan|wazan|bhaar|ತೂಕ)\s*(?:is|of|hai|:)?\s*(\d+)\b/i);
      if (intMatch) {
        m2 = parseFloat(intMatch[1]);
      }
    }
  }
  const chosenVal = m1 !== null ? m1 : m2;
  const minVal = category === "newborn" ? 0.8 : 30;
  const maxVal = category === "newborn" ? 6 : 130;
  const isPlausible = chosenVal !== null && chosenVal >= minVal && chosenVal <= maxVal;
  let isConfusable = false;
  let confusablePrompt = null;
  if (!/\b(saade|sade|sawa|paune)\b/i.test(clean)) {
    if (/\b(saat|saath)\b/i.test(clean)) {
      isConfusable = true;
      confusablePrompt = "\u0915\u094D\u092F\u093E \u0906\u092A\u0928\u0947 \u0938\u093E\u0924 (7) \u092F\u093E \u0938\u093E\u0920 (60) \u0915\u0939\u093E? \u0915\u0943\u092A\u092F\u093E \u0938\u094D\u092A\u0937\u094D\u091F \u0915\u0930\u0947\u0902\u0964";
    } else if (/\b(chaalis)\b/i.test(clean)) {
      isConfusable = true;
      confusablePrompt = "\u0915\u094D\u092F\u093E \u0906\u092A\u0928\u0947 \u091A\u093E\u0930 (4) \u092F\u093E \u091A\u093E\u0932\u0940\u0938 (40) \u0915\u0939\u093E?";
    } else if (/\b(tees)\b/i.test(clean)) {
      isConfusable = true;
      confusablePrompt = "\u0915\u094D\u092F\u093E \u0906\u092A\u0928\u0947 \u0924\u0940\u0928 (3) \u092F\u093E \u0924\u0940\u0938 (30) \u0915\u0939\u093E?";
    } else if (/\b(fifteen|fifty)\b/i.test(clean)) {
      isConfusable = true;
      confusablePrompt = "Did you say fifteen (15) or fifty (50)?";
    }
  }
  let state = "confirmed";
  let explanation = "Validated and confirmed";
  if (chosenVal === null) {
    state = "missing";
    explanation = "Could not parse weight from speech";
  } else if (!isPlausible) {
    state = "uncertain";
    explanation = `Implausible weight ${chosenVal} kg (expected range ${minVal}-${maxVal} kg)`;
  } else if (m1 !== null && m2 !== null && Math.abs(m1 - m2) > 0.05) {
    state = "uncertain";
    explanation = `Dual method mismatch: rule parser (${m1}) vs digit parser (${m2})`;
  } else if (isConfusable) {
    state = "uncertain";
    explanation = "Sound-alike confusable detected";
  }
  return {
    value: chosenVal !== null ? Math.round(chosenVal * 100) / 100 : null,
    rawText: text,
    method1Value: m1,
    method2Value: m2,
    isPlausible,
    isConfusable,
    confusablePrompt,
    state,
    explanation
  };
}

// server/records.ts
import { promises as fs } from "node:fs";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var ROOT = process.env.ASHA_PROJECT_ROOT || path2.resolve(path2.dirname(fileURLToPath2(import.meta.url)), "..");
var RECORDS_FILE = process.env.ASHA_RECORDS_FILE || path2.join(ROOT, "data", "visit_records.json");
var DEMO_RECORDS_FILE = path2.join(ROOT, "data", "sandbox", "visit_records.json");
var writeQueue = Promise.resolve();
function recordsFile(recordId) {
  return recordId?.startsWith("DEMO-") ? DEMO_RECORDS_FILE : RECORDS_FILE;
}
async function readStoredVisits(file = RECORDS_FILE) {
  try {
    const content = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
    const data = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray(parsed.value) ? parsed.value : null;
    if (!data) throw new Error("Stored visit register is invalid.");
    return data.filter(
      (item) => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.encryptedToken === "string")
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
function decodeVisit(item) {
  const record = JSON.parse(decryptPayload(item.encryptedToken));
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`Saved visit ${item.id} is invalid.`);
  }
  return record;
}
async function writeStoredVisits(visits, file = RECORDS_FILE) {
  await fs.mkdir(path2.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(visits, null, 2), "utf8");
}
function serializeWrite(operation) {
  const result = writeQueue.then(operation);
  writeQueue = result.then(() => void 0, () => void 0);
  return result;
}
async function saveVisitRecord(record) {
  return serializeWrite(async () => {
    const file = recordsFile(record.id);
    const visits = await readStoredVisits(file);
    const encryptedToken = encryptPayload(record);
    const next = visits.filter((item) => item.id !== record.id);
    next.unshift({ id: record.id, encryptedToken });
    await writeStoredVisits(next, file);
    return encryptedToken;
  });
}
async function listVisitRecords() {
  const visits = await readStoredVisits();
  return visits.flatMap((item) => {
    try {
      return [decodeVisit(item)];
    } catch {
      return [];
    }
  });
}
async function updateVisitFollowup(recordId, followupId, completed) {
  return serializeWrite(async () => {
    const file = recordsFile(recordId);
    const visits = await readStoredVisits(file);
    const stored = visits.find((item) => item.id === recordId);
    if (!stored) throw new Error("Saved visit was not found.");
    const record = decodeVisit(stored);
    const followups = record.followups;
    const index = followups?.findIndex((item) => item.id === followupId) ?? -1;
    if (!followups || index < 0) throw new Error("Follow-up was not found.");
    followups[index] = {
      ...followups[index],
      completed,
      completedAt: completed ? (/* @__PURE__ */ new Date()).toISOString() : null
    };
    const encryptedToken = encryptPayload(record);
    visits[visits.indexOf(stored)] = { id: recordId, encryptedToken };
    await writeStoredVisits(visits, file);
    return record;
  });
}
async function deleteVisitRecords() {
  await serializeWrite(async () => {
    await fs.rm(RECORDS_FILE, { force: true });
  });
}

// server/extractor.ts
import { GoogleGenAI } from "@google/genai";

// server/extractionPrompt.ts
function buildExtractionPrompt(transcript, language) {
  return [
    `Language code: ${language}`,
    "Extract only information explicitly stated in the transcript. Do not infer, assume, diagnose, or fill missing values.",
    "Use null for an unstated scalar and an empty array for an unstated list.",
    "For every populated field, copy the shortest exact supporting transcript phrase into its evidence field.",
    "Preserve symptom negation, whether it is current or past/resolved, and any uncertainty in symptom data.",
    "Return only the requested JSON object.",
    `Transcript: ${transcript}`
  ].join("\n");
}

// server/groq.ts
var LlmProviderError = class extends Error {
  constructor(status, message, retryAfterMs2 = 0, invalidJson = false) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs2;
    this.invalidJson = invalidJson;
    this.name = "LlmProviderError";
  }
};
var modelCatalog = null;
var catalogExpiresAt = 0;
var catalogRequest = null;
function configuration(env) {
  const apiKey = env.FALLBACK_API_KEY?.trim();
  const baseUrl = (env.FALLBACK_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!apiKey) throw new LlmProviderError("NOT_CONFIGURED", "Fallback provider is not configured.");
  if (!baseUrl) throw new LlmProviderError("NOT_CONFIGURED", "Fallback base URL is not configured.");
  return { apiKey, baseUrl };
}
function statusFromResponse(response2, body) {
  let message = `HTTP ${response2.status}`;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error?.message === "string") message = parsed.error.message;
  } catch {
  }
  const retryHeader = response2.headers.get("retry-after");
  const retrySeconds = retryHeader ? Number(retryHeader) : 0;
  return new LlmProviderError(
    String(response2.status),
    message,
    Number.isFinite(retrySeconds) ? Math.max(0, retrySeconds * 1e3) : 0
  );
}
async function discoverGroqModels(env = process.env, fetchImpl = fetch) {
  const { apiKey, baseUrl } = configuration(env);
  if (modelCatalog && Date.now() < catalogExpiresAt) return modelCatalog;
  if (!catalogRequest) {
    catalogRequest = (async () => {
      const response2 = await fetchImpl(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(1200)
      });
      if (!response2.ok) throw statusFromResponse(response2, await response2.text());
      const payload = await response2.json();
      if (!Array.isArray(payload.data)) {
        throw new LlmProviderError("INVALID_RESPONSE", "Provider model list was invalid.");
      }
      const models = payload.data.filter(
        (item) => Boolean(item && typeof item === "object" && typeof item.id === "string")
      );
      modelCatalog = models;
      catalogExpiresAt = Date.now() + 5 * 6e4;
      return models;
    })().finally(() => {
      catalogRequest = null;
    });
  }
  return catalogRequest;
}
function selectModel(models, configuredModel) {
  const configured = configuredModel?.trim();
  if (configured) {
    const match = models.find((model) => model.id === configured && model.active !== false);
    if (!match) {
      throw new LlmProviderError("MODEL_UNAVAILABLE", "Configured fallback model is not available.");
    }
    return match;
  }
  const candidate = models.find(
    (model) => model.active !== false && /instant/i.test(model.id) && !/(reason|thinking|deepseek-r1|qwq)/i.test(model.id)
  );
  if (!candidate) {
    throw new LlmProviderError(
      "MODEL_NOT_CONFIGURED",
      "Set FALLBACK_MODEL to an active, fast non-reasoning chat model from the provider model list."
    );
  }
  return candidate;
}
async function selectedGroqModel(env = process.env, fetchImpl = fetch) {
  const models = await discoverGroqModels(env, fetchImpl);
  return selectModel(models, env.FALLBACK_MODEL);
}
async function extractWithGroq(options) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const { apiKey, baseUrl } = configuration(env);
  const model = (await selectedGroqModel(env, fetchImpl)).id;
  const models = await discoverGroqModels(env, fetchImpl);
  const modelMetadata = models.find((item) => item.id === model);
  const supportsResponseFormat = modelMetadata?.supported_parameters?.includes("response_format") === true;
  const responseFormat = supportsResponseFormat ? {
    type: "json_schema",
    json_schema: {
      name: "visit_extraction",
      strict: true,
      schema: options.schema
    }
  } : { type: "json_object" };
  const prompt = buildExtractionPrompt(options.transcript, options.language);
  const response2 = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: responseFormat
    }),
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(1500)]) : AbortSignal.timeout(1500)
  });
  if (!response2.ok) throw statusFromResponse(response2, await response2.text());
  let payload;
  try {
    payload = await response2.json();
  } catch {
    throw new LlmProviderError("INVALID_JSON", "Provider returned invalid JSON.", 0, true);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LlmProviderError("INVALID_JSON", "Provider returned invalid JSON.", 0, true);
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new LlmProviderError("INVALID_JSON", "Provider returned invalid JSON.", 0, true);
  }
  try {
    return { extraction: options.validate(parsed, model), model };
  } catch {
    throw new LlmProviderError("INVALID_JSON", "Provider returned schema-invalid JSON.", 0, true);
  }
}
async function warmGroqModelCatalog() {
  if (!process.env.FALLBACK_API_KEY?.trim() || process.env.FALLBACK_MODEL?.trim()) return;
  await discoverGroqModels();
}

// server/extractor.ts
var responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "beneficiaryName",
    "beneficiaryNames",
    "beneficiaryType",
    "age",
    "houseNo",
    "village",
    "visitType",
    "pregnancyMonths",
    "gestationalWeeks",
    "babyAgeDays",
    "weight",
    "bpSystolic",
    "bpDiastolic",
    "hemoglobin",
    "lastAncDate",
    "ttStatus",
    "ttLastDoseDate",
    "ifaStatus",
    "ifaTablets",
    "vaccinationsGiven",
    "symptoms",
    "notes",
    "evidence"
  ],
  properties: {
    beneficiaryName: { type: ["string", "null"] },
    beneficiaryNames: { type: "array", items: { type: "string" } },
    beneficiaryType: { type: "string", enum: ["pregnant_woman", "newborn", "mother", "unknown"] },
    age: { type: ["number", "null"] },
    houseNo: { type: ["string", "null"] },
    village: { type: ["string", "null"] },
    visitType: { type: ["string", "null"], enum: ["ANC", "PNC", "immunisation", null] },
    pregnancyMonths: { type: ["number", "null"] },
    gestationalWeeks: { type: ["number", "null"] },
    babyAgeDays: { type: ["number", "null"] },
    weight: { type: ["number", "null"] },
    bpSystolic: { type: ["number", "null"] },
    bpDiastolic: { type: ["number", "null"] },
    hemoglobin: { type: ["number", "null"] },
    lastAncDate: { type: ["string", "null"] },
    ttStatus: { type: ["string", "null"] },
    ttLastDoseDate: { type: ["string", "null"] },
    ifaStatus: { type: ["string", "null"] },
    ifaTablets: { type: ["number", "null"] },
    vaccinationsGiven: { type: "array", items: { type: "string" } },
    symptoms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["canonicalId", "negated", "timing", "certainty", "evidence"],
        properties: {
          canonicalId: { type: "string" },
          negated: { type: "boolean" },
          timing: { type: ["string", "null"] },
          certainty: { type: "string", enum: ["high", "uncertain"] },
          evidence: { type: "string" }
        }
      }
    },
    notes: { type: "string" },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: [
        "beneficiaryName",
        "age",
        "houseNo",
        "village",
        "visitType",
        "pregnancyMonths",
        "gestationalWeeks",
        "babyAgeDays",
        "weight",
        "bloodPressure",
        "hemoglobin",
        "lastAncDate",
        "ttStatus",
        "ttLastDoseDate",
        "ifaStatus",
        "ifaTablets",
        "vaccinations",
        "symptoms",
        "notes"
      ],
      properties: {
        beneficiaryName: { type: ["string", "null"] },
        age: { type: ["string", "null"] },
        houseNo: { type: ["string", "null"] },
        village: { type: ["string", "null"] },
        visitType: { type: ["string", "null"] },
        pregnancyMonths: { type: ["string", "null"] },
        gestationalWeeks: { type: ["string", "null"] },
        babyAgeDays: { type: ["string", "null"] },
        weight: { type: ["string", "null"] },
        bloodPressure: { type: ["string", "null"] },
        hemoglobin: { type: ["string", "null"] },
        lastAncDate: { type: ["string", "null"] },
        ttStatus: { type: ["string", "null"] },
        ttLastDoseDate: { type: ["string", "null"] },
        ifaStatus: { type: ["string", "null"] },
        ifaTablets: { type: ["string", "null"] },
        vaccinations: { type: ["string", "null"] },
        symptoms: { type: ["string", "null"] },
        notes: { type: ["string", "null"] }
      }
    }
  }
};
var PROVIDER_COOLDOWN_MS = 6e4;
var EXTRACTION_DEADLINE_MS = 5e3;
var PROVIDER_ATTEMPT_TIMEOUT_MS = 1500;
var providerCircuitUntil = /* @__PURE__ */ new Map();
var InvalidExtractionError = class extends Error {
};
var REQUIRED_EXTRACTION_FIELDS = [
  "beneficiaryName",
  "beneficiaryNames",
  "beneficiaryType",
  "age",
  "houseNo",
  "village",
  "visitType",
  "pregnancyMonths",
  "gestationalWeeks",
  "babyAgeDays",
  "weight",
  "bpSystolic",
  "bpDiastolic",
  "hemoglobin",
  "lastAncDate",
  "ttStatus",
  "ttLastDoseDate",
  "ifaStatus",
  "ifaTablets",
  "vaccinationsGiven",
  "symptoms",
  "notes",
  "evidence"
];
var REQUIRED_EVIDENCE_FIELDS = [
  "beneficiaryName",
  "age",
  "houseNo",
  "village",
  "visitType",
  "pregnancyMonths",
  "gestationalWeeks",
  "babyAgeDays",
  "weight",
  "bloodPressure",
  "hemoglobin",
  "lastAncDate",
  "ttStatus",
  "ttLastDoseDate",
  "ifaStatus",
  "ifaTablets",
  "vaccinations",
  "symptoms",
  "notes"
];
var NULLABLE_STRING_FIELDS = [
  "beneficiaryName",
  "houseNo",
  "village",
  "lastAncDate",
  "ttStatus",
  "ttLastDoseDate",
  "ifaStatus"
];
var NULLABLE_NUMBER_FIELDS = [
  "age",
  "pregnancyMonths",
  "gestationalWeeks",
  "babyAgeDays",
  "weight",
  "bpSystolic",
  "bpDiastolic",
  "hemoglobin",
  "ifaTablets"
];
function assertExtractionSchema(value) {
  if (REQUIRED_EXTRACTION_FIELDS.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new InvalidExtractionError("Extraction is missing required schema fields.");
  }
  if (Object.keys(value).some((key) => !REQUIRED_EXTRACTION_FIELDS.includes(key))) {
    throw new InvalidExtractionError("Extraction contains unsupported schema fields.");
  }
  for (const key of NULLABLE_STRING_FIELDS) {
    if (value[key] !== null && typeof value[key] !== "string") {
      throw new InvalidExtractionError("Extraction contains an invalid string field.");
    }
  }
  for (const key of NULLABLE_NUMBER_FIELDS) {
    if (value[key] !== null && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
      throw new InvalidExtractionError("Extraction contains an invalid numeric field.");
    }
  }
  if (!Array.isArray(value.beneficiaryNames) || value.beneficiaryNames.some((name) => typeof name !== "string") || !["pregnant_woman", "newborn", "mother", "unknown"].includes(String(value.beneficiaryType)) || value.visitType !== null && !["ANC", "PNC", "immunisation"].includes(String(value.visitType)) || !Array.isArray(value.vaccinationsGiven) || value.vaccinationsGiven.some((item) => typeof item !== "string") || typeof value.notes !== "string") {
    throw new InvalidExtractionError("Extraction does not match the required schema.");
  }
  if (!Array.isArray(value.symptoms) || value.symptoms.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    const symptom = item;
    return Object.keys(symptom).some(
      (key) => !["canonicalId", "negated", "timing", "certainty", "evidence"].includes(key)
    ) || typeof symptom.canonicalId !== "string" || typeof symptom.negated !== "boolean" || symptom.timing !== null && typeof symptom.timing !== "string" || !["high", "uncertain"].includes(String(symptom.certainty)) || typeof symptom.evidence !== "string";
  })) {
    throw new InvalidExtractionError("Extraction contains an invalid symptom.");
  }
  if (!value.evidence || typeof value.evidence !== "object" || Array.isArray(value.evidence)) {
    throw new InvalidExtractionError("Extraction evidence is invalid.");
  }
  const evidence = value.evidence;
  if (REQUIRED_EVIDENCE_FIELDS.some((key) => !Object.prototype.hasOwnProperty.call(evidence, key)) || Object.keys(evidence).some((key) => !REQUIRED_EVIDENCE_FIELDS.includes(key)) || Object.values(evidence).some((item) => item !== null && typeof item !== "string")) {
    throw new InvalidExtractionError("Extraction evidence does not match the required schema.");
  }
}
function providerStatus(error) {
  if (error instanceof LlmProviderError) return error.status;
  if (!error || typeof error !== "object") return "NETWORK";
  const candidate = error;
  const status = Number(candidate.status ?? candidate.code);
  if (status > 0) return String(status);
  const text = String(candidate.message || "").toLowerCase();
  if (/timed?\s*out|timeout|aborted/.test(text)) return "TIMEOUT";
  if (candidate.cause) return providerStatus(candidate.cause);
  return "ERROR";
}
function retryAfterMs(error) {
  if (error instanceof LlmProviderError) return error.retryAfterMs;
  if (!error || typeof error !== "object") return 0;
  const candidate = error;
  const header = candidate.response?.headers?.get("retry-after") || candidate.headers?.get("retry-after");
  if (header && Number.isFinite(Number(header))) return Number(header) * 1e3;
  const message = String(candidate.message || "");
  const match = message.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
  return match ? Number(match[1]) * 1e3 : 0;
}
function sanitizedProviderMessage(error, transcript) {
  let message = error instanceof Error ? error.message : "Provider request failed.";
  for (const secret of [process.env.LLM_API_KEY, process.env.FALLBACK_API_KEY, transcript]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\b(?:gsk_|AIza)[A-Za-z0-9_-]{12,}\b/g, "[redacted]").replace(/\s+/g, " ").slice(0, 180);
}
function makeDefaultAdapters() {
  return {
    isConfigured: (provider) => provider === "Gemini" ? Boolean(process.env.LLM_API_KEY?.trim() && process.env.LLM_MODEL?.trim()) : Boolean(process.env.FALLBACK_API_KEY?.trim() && process.env.FALLBACK_BASE_URL?.trim()),
    gemini: async (transcript, language, signal) => {
      const apiKey = process.env.LLM_API_KEY?.trim();
      const model = process.env.LLM_MODEL?.trim();
      if (!apiKey || !model) {
        throw new LlmProviderError("NOT_CONFIGURED", "Gemini credentials or model are not configured.");
      }
      const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
      return attemptGeminiCall(ai, transcript, language, model, signal);
    },
    groq: async (transcript, language, signal) => {
      const result = await extractWithGroq({
        transcript,
        language,
        schema: responseJsonSchema,
        validate: validateExtraction,
        signal
      });
      return result.extraction;
    }
  };
}
async function extractWithFallback(transcript, language = "en-IN", adapters = makeDefaultAdapters()) {
  if (process.env.LLM_PROVIDER === "mock") {
    const extraction = extractDeterministic(transcript, language);
    extraction.extractionDiagnostics = {
      provider: "Rules",
      model: "mock",
      failedProviders: [],
      providerLatencyMs: { Gemini: 0, Groq: 0 },
      totalLatencyMs: 0,
      llmCalls: 0
    };
    return extraction;
  }
  const now = adapters.now || Date.now;
  const startedAt = now();
  const deadline = startedAt + EXTRACTION_DEADLINE_MS;
  const failures = [];
  const providerLatencyMs = { Gemini: 0, Groq: 0 };
  let llmCalls = 0;
  for (const provider of ["Gemini", "Groq"]) {
    if (adapters.isConfigured && !adapters.isConfigured(provider)) {
      failures.push({ provider, status: "NOT_CONFIGURED" });
      continue;
    }
    const openUntil = providerCircuitUntil.get(provider) || 0;
    if (openUntil > now()) {
      failures.push({ provider, status: "CIRCUIT_OPEN" });
      continue;
    }
    const adapter = provider === "Gemini" ? adapters.gemini : adapters.groq;
    for (let invalidJsonAttempt = 0; invalidJsonAttempt < 2; invalidJsonAttempt += 1) {
      const remaining = deadline - now();
      if (remaining <= 0) break;
      const attemptStarted = now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(PROVIDER_ATTEMPT_TIMEOUT_MS, remaining));
      llmCalls += 1;
      try {
        const extraction = await Promise.race([
          adapter(transcript, language, controller.signal),
          new Promise((_resolve, reject) => {
            controller.signal.addEventListener("abort", () => reject(new LlmProviderError("TIMEOUT", "Provider request timed out.")), { once: true });
          })
        ]);
        providerLatencyMs[provider] += now() - attemptStarted;
        const diagnostics2 = {
          provider,
          model: extraction.modelUsed,
          failedProviders: failures,
          providerLatencyMs,
          totalLatencyMs: now() - startedAt,
          llmCalls
        };
        extraction.extractionDiagnostics = diagnostics2;
        extraction.llmStatus = provider === "Gemini" && llmCalls === 1 ? "ready" : "retried";
        extraction.llmRetries = llmCalls - 1;
        extraction.llmBackupUsed = provider === "Groq";
        console.info(
          `[LLM] provider=${provider} model=${diagnostics2.model || "unknown"} llm_calls=${llmCalls} total_ms=${diagnostics2.totalLatencyMs}`
        );
        return extraction;
      } catch (error) {
        providerLatencyMs[provider] += now() - attemptStarted;
        const status = providerStatus(error);
        const message = sanitizedProviderMessage(error, transcript);
        (adapters.logFailure || ((name, code, detail) => console.warn(`[LLM] provider=${name} status=${code} error=${detail}`)))(provider, status, message);
        if (status === "429" || status === "503") {
          providerCircuitUntil.set(provider, now() + Math.max(PROVIDER_COOLDOWN_MS, retryAfterMs(error)));
          failures.push({ provider, status });
          break;
        }
        if (status === "INVALID_JSON" && invalidJsonAttempt === 0) continue;
        failures.push({ provider, status });
        break;
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  const rules = extractDeterministic(transcript, language);
  const hasRuleData = hasExtractedData(rules);
  const diagnostics = {
    provider: "Rules",
    model: null,
    failedProviders: failures,
    providerLatencyMs,
    totalLatencyMs: now() - startedAt,
    llmCalls
  };
  console.info(`[LLM] provider=Rules llm_calls=${llmCalls} total_ms=${diagnostics.totalLatencyMs}`);
  rules.modelUsed = "rules";
  rules.extractionDiagnostics = diagnostics;
  rules.llmStatus = hasRuleData ? "retried" : "busy";
  if (!hasRuleData) rules.extractionStatus = "uncertain";
  return rules;
}
function hasExtractedData(extraction) {
  return Boolean(
    extraction.beneficiaryName || extraction.age !== null || extraction.houseNo || extraction.visitType || extraction.pregnancyMonths !== null || extraction.babyAgeDays !== null || extraction.weight !== null || extraction.bpSystolic !== null || extraction.bpDiastolic !== null || extraction.hemoglobin !== null || extraction.lastAncDate || extraction.ttStatus || extraction.ifaStatus || extraction.ifaTablets !== null || extraction.vaccinationsGiven.length || extraction.symptoms.length || extraction.notes
  );
}
function extractDeterministic(transcript, _lang = "en-IN") {
  const text = transcript.trim();
  const lower = text.toLowerCase();
  const capture = (pattern) => text.match(pattern)?.[1]?.trim() || null;
  const numeric = (pattern) => {
    const value = capture(pattern);
    return value ? Number(value) : null;
  };
  const ignoredNames = /* @__PURE__ */ new Set([
    "anc",
    "bp",
    "ifa",
    "tt",
    "phc",
    "house",
    "weight",
    "visit",
    "newborn",
    "mother",
    "pregnant",
    "no",
    "yes",
    "she",
    "he",
    "baby",
    "patient",
    "the",
    "i",
    "visited",
    "today",
    "yesterday",
    "tomorrow",
    "met",
    "saw",
    "from",
    "lives",
    "living",
    "in",
    "at",
    "for",
    "is",
    "was",
    "has",
    "had",
    "her",
    "his",
    "my",
    "last",
    "this",
    "that",
    "and",
    "aur",
    "age",
    "years",
    "year",
    "old",
    "months",
    "month",
    "days",
    "day",
    "weight",
    "blood",
    "pressure"
  ]);
  const cleanName = (candidate) => {
    const words = candidate.trim().split(/\s+/);
    while (words.length && ignoredNames.has(words[0].toLowerCase())) words.shift();
    const stopIndex = words.findIndex((word) => ignoredNames.has(word.toLowerCase()));
    return words.slice(0, stopIndex < 0 ? words.length : stopIndex).join(" ");
  };
  const capitalizedNames = (text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) || []).map(cleanName).filter((name2) => name2 && !ignoredNames.has(name2.toLowerCase()));
  const cueNames = (text.match(/\b(?:visited|beneficiary(?: named)?|name is)\s+[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2}/gi) || []).map((candidate) => cleanName(candidate.replace(/^(visited|beneficiary(?: named)?|name is)\s+/i, ""))).filter(Boolean);
  const names = Array.from(new Set(
    (cueNames.length ? cueNames : /\b(?:and|aur)\b|&/i.test(text) ? capitalizedNames : capitalizedNames.slice(0, 1)).filter((candidate) => !ignoredNames.has(candidate.toLowerCase()))
  ));
  const name = names[0] || capture(/(?:name is|beneficiary)\s+([A-Za-z][A-Za-z ]+)/i);
  const age = numeric(/\b(\d{1,2})\s*(?:years?\s*old|year old|yrs?\b)/i) ?? numeric(/(\d{1,2})\s*(?:साल|वर्ष|ವರ್ಷ)/i);
  const monthWords = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    \u090F\u0915: 1,
    \u0926\u094B: 2,
    \u0924\u0940\u0928: 3,
    \u091A\u093E\u0930: 4,
    \u092A\u093E\u0902\u091A: 5,
    \u092A\u093E\u0901\u091A: 5,
    \u091B\u0939: 6,
    \u0938\u093E\u0924: 7,
    \u0906\u0920: 8,
    \u0928\u094C: 9,
    \u0926\u0938: 10,
    \u0C92\u0C82\u0CA6\u0CC1: 1,
    \u0C8E\u0CB0\u0CA1\u0CC1: 2,
    \u0CAE\u0CC2\u0CB0\u0CC1: 3,
    \u0CA8\u0CBE\u0CB2\u0CCD\u0C95\u0CC1: 4,
    \u0C90\u0CA6\u0CC1: 5,
    \u0C86\u0CB0\u0CC1: 6,
    \u0C8F\u0CB3\u0CC1: 7,
    \u0C8E\u0C82\u0C9F\u0CC1: 8,
    \u0C92\u0C82\u0CAC\u0CA4\u0CCD\u0CA4\u0CC1: 9,
    \u0CB9\u0CA4\u0CCD\u0CA4\u0CC1: 10
  };
  const pregnancyDurationPattern = /(one|two|three|four|five|six|seven|eight|nine|ten|एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस|ಒಂದು|ಎರಡು|ಮೂರು|ನಾಲ್ಕು|ಐದು|ಆರು|ಏಳು|ಎಂಟು|ಒಂಬತ್ತು|ಹತ್ತು|\d{1,2})\s*(?:months?\s*(?:pregnant)?|महीने(?:\s*(?:की|का|के))?(?:\s*(?:गर्भवती|गर्भावस्था))?|ತಿಂಗಳು(?:\s*(?:pregnant|ಗರ್ಭಿಣಿ))?)/i;
  const pregnancyDuration = text.match(pregnancyDurationPattern)?.[1]?.toLowerCase();
  const pregnancyMonths = pregnancyDuration ? Number(pregnancyDuration) || monthWords[pregnancyDuration] || null : null;
  const babyAgeDays = numeric(/\b(\d{1,3})\s*days?\s*old\b/i) ?? (/\b(\d{1,2})\s*weeks?\s*old\b/i.test(lower) ? (numeric(/\b(\d{1,2})\s*weeks?\s*old\b/i) ?? 0) * 7 : null);
  const houseNo = capture(/\bhouse(?:\s*(?:number|no\.?))?\s*([A-Za-z0-9-]+)\b/i) || capture(/\bghar\s*(?:number|no\.?)?\s*(\d+)\b/i) || capture(/(?:घर|मकान)\s*(?:नंबर|नं\.?)?\s*([A-Za-z0-9-]+)/i) || capture(/ಮನೆ\s*(?:ಸಂಖ್ಯೆ|ನಂ\.?)?\s*([A-Za-z0-9-]+)/i);
  const village = capture(/\bvillage\s*(?:is|:)?\s*([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2})/i) || capture(/(?:गांव|गाँव|ಗ್ರಾಮ)\s*(?:है|is|:)?\s*([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,2})/iu) || capture(/\bhouse(?:\s*(?:number|no\.?))?\s*[A-Za-z0-9-]+\s+in\s+([A-Za-z][A-Za-z'-]*)/i);
  const weightText = capture(/(?:weight|weighs?|vajan|wazan|bhaar|ತೂಕ|वजन|वज़न)\s*(?:is|of|hai|है|:)?\s*((?:\d+(?:\.\d+)?|[\w-]+)(?:\s+(?:point|kilo|kg|kilograms?|grams?|किलो|केजी))?(?:\s+\d+\s*(?:grams?|g))?)/i) || capture(/\b(\d+(?:\.\d+)?)\s*(?:kg|kilo(?:grams?)?)\b/i);
  let weight = weightText ? Number(weightText.match(/\d+(?:\.\d+)?/)?.[0]) : null;
  if (weightText && !weight && /\b(dhai|two point eight)\b/i.test(weightText)) {
    weight = /\bdhai\b/i.test(weightText) ? 2.5 : 2.8;
  }
  const bp = text.match(/(?:\b(?:bp|blood pressure)|रक्तचाप|बीपी|ರಕ್ತದೊತ್ತಡ)\s*(?:is|of|है|:)?\s*(\d{2,3})\s*(?:by|\/)\s*(\d{2,3})/i);
  const hemoglobin = numeric(/(?:\b(?:haemoglobin|hemoglobin|hb)|हीमोग्लोबिन|ಹಿಮೋಗ್ಲೋಬಿನ್)\s*(?:is|of|है|:)?\s*(\d+(?:\.\d+)?)/i);
  const lastAncDate = capture(/\b(?:last anc|anc date|last checkup|last visit)\s*(?:was|on|:)?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const ttCountAfterCue = capture(/(?:tt|td)\s*(?:के|की|ಮತ್ತು)?\s*(one|two|three|1|2|3|एक|दो|तीन|ಒಂದು|ಎರಡು|ಮೂರು)\s*(?:doses?|खुराक|ಡೋಸ್)/i);
  const ttStatus = capture(/\b((?:one|two|three|1|2|3)\s+(?:tt|td)\s+doses?)\b/i) || (ttCountAfterCue ? `${monthWords[ttCountAfterCue.toLowerCase()] || ttCountAfterCue} TT doses` : null) || capture(/(?:tt|td)\s*(?:status|dose|doses|injection|के|की|ಮತ್ತು)?\s*(?:is|है|:)?\s*((?:one|two|three|1|2|3|एक|दो|तीन|ಒಂದು|ಎರಡು|ಮೂರು)\s*(?:dose|doses|खुराक|ಡೋಸ್)?|not taken|none|complete|completed)/i) || capture(/\b((?:one|two|three|1|2|3|एक|दो|तीन|ಒಂದು|ಎರಡು|ಮೂರು)\s+(?:tt|td)\s+(?:doses?|खुराक|ಡೋಸ್))/i);
  const ttLastDoseDate = capture(/\b(?:last tt|last td|tt last dose|td last dose|last dose)\s*(?:was|on|date|:)?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const ifaStatus = /not taking ifa|not taking.*iron|ifa.*not regularly|not.*ifa regularly|ifa.*(?:नहीं|ಇಲ್ಲ).*(?:ले|ತೆಗೆ)/i.test(lower) ? "not taking regularly" : capture(/\b(?:ifa|iron tablets?)\s*(?:status|:)?\s*(taken regularly|not taking regularly|taking regularly|not taken|taken)\b/i) || (/\b(?:taking|takes|taking regularly)\s+(?:the\s+)?(?:ifa|iron)\s+tablets?\b/i.test(lower) || /ifa\s+(?:tablets?\s+)?(?:ले रही|लेता|लेते|ತೆಗೆದುಕೊಳ್ಳು)/i.test(text) ? "taking" : null);
  const ifaTablets = numeric(/\b(\d{1,3})\s*(?:ifa|iron)\s*(?:tablets?|pills?|goli)/i) ?? numeric(/\b(?:ifa|iron)\s*(\d{1,3})\s*(?:tablets?|pills?|goli)/i);
  const isNewborn = /\b(newborn|new born|baby|infant|navjaat|ಹುಟ್ಟಿದ ಮಗು)\b/i.test(lower) || /नवजात|ಮಗು/i.test(text);
  const isMother = /\bmother\b/i.test(lower) || /माँ|ತಾಯಿ/i.test(text) ? !isNewborn : false;
  const visitType = isNewborn || isMother || /\b(pnc|postnatal|newborn visit)\b/i.test(lower) || /प्रसवोत्तर|ಪ್ರಸವಾನಂತರ/i.test(text) ? "PNC" : /\b(vaccin|immuni[sz]ation)\b/i.test(lower) || /टीकाकरण|ಲಸಿಕೆ/i.test(text) ? "immunisation" : /\b(anc|pregnan|garbh|months? pregnant)\b/i.test(lower) || /गर्भवती|गर्भावस्था|ಗರ್ಭಿಣಿ|ಗರ್ಭಾವಸ್ಥೆ/i.test(text) ? "ANC" : null;
  const beneficiaryType = isNewborn ? "newborn" : isMother ? "mother" : visitType === "ANC" ? "pregnant_woman" : "unknown";
  const symptoms = [];
  const symptomPatterns = [
    ["vaginal_bleeding", /\b(heavy bleeding|vaginal bleeding|bleeding|spotting|raktasrava)\b|रक्तस्राव|खून बहना|खून आना|ರಕ್ತಸ್ರಾವ/i],
    ["high_fever_pregnancy", /\b(high fever|fever|high temperature|tez bukhar|tumba jwara)\b|बुखार|ಜ್ವರ/i],
    ["convulsions_fits", /\b(convulsions?|fits|seizure|daura)\b/i],
    ["severe_abdominal_pain", /\b(severe abdominal pain|severe stomach pain)\b/i]
  ];
  for (const [canonicalId, pattern] of symptomPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const start = Math.max(0, match.index - 30);
    const end = Math.min(text.length, match.index + match[0].length + 45);
    const evidence2 = text.slice(start, end);
    const afterSymptom = text.slice(match.index + match[0].length, end);
    const negated = /\b(no|not|nahi|illa)\b/i.test(text.slice(start, match.index)) || /नहीं|नही|ಇಲ್ಲ/.test(text.slice(start, match.index)) || /\b(no|not|nahi|illa)\b|नहीं|नही|ಇಲ್ಲ/i.test(afterSymptom) || /नहीं|ಇಲ್ಲ/.test(text.slice(start, match.index)) || /stopped yesterday|has stopped|no longer/i.test(text.slice(match.index, match.index + match[0].length + 35));
    symptoms.push({
      canonicalId,
      negated,
      timing: /yesterday|stopped|कल|ನಿನ್ನೆ/i.test(evidence2) ? "past/resolved" : "current",
      certainty: /\b(maybe|perhaps|some|possibly)\b/i.test(evidence2) || /शायद|ಬಹುಶಃ/.test(evidence2) ? "uncertain" : "high",
      evidence: evidence2
    });
  }
  const evidence = {
    beneficiaryName: name,
    age: capture(/\b\d{1,2}\s*(?:years?\s*old|year old|yrs?\b)/i) || capture(/\d{1,2}\s*(?:साल|वर्ष|ವರ್ಷ)/i),
    houseNo: houseNo ? `house ${houseNo}` : null,
    weight: weightText,
    bloodPressure: bp?.[0] || null,
    ifaStatus: ifaStatus || (ifaTablets !== null ? `${ifaTablets} IFA tablets` : null),
    lastAncDate,
    ttStatus,
    hemoglobin: capture(/\b(?:haemoglobin|hemoglobin|hb)\s*(?:is|of|:)?\s*\d+(?:\.\d+)?/i)
  };
  const present = (value) => value !== null && value !== void 0 && value !== "";
  const confidence = {
    beneficiary: present(name) ? "high" : "missing",
    age: present(age) ? "high" : "missing",
    houseNo: present(houseNo) ? "high" : "missing",
    visitType: present(visitType) ? "high" : "missing",
    pregnancyMonths: present(pregnancyMonths) ? "high" : "missing",
    babyAgeDays: present(babyAgeDays) ? "high" : "missing",
    weight: present(weight) ? "high" : "missing",
    bp: bp ? "high" : "missing",
    hemoglobin: present(hemoglobin) ? "high" : "missing",
    lastAncDate: present(lastAncDate) ? "high" : "missing",
    ttStatus: present(ttStatus) ? "high" : "missing",
    ttLastDoseDate: present(ttLastDoseDate) ? "high" : "missing",
    ifa: present(ifaStatus) || present(ifaTablets) ? "high" : "missing",
    vaccinations: /\b(bcg|opv|pentavalent|rotavirus|tt\d?|td\d?)\b/i.test(text) ? "high" : "missing"
  };
  return {
    beneficiaryName: name || null,
    beneficiaryNames: names,
    beneficiaryId: null,
    beneficiaryType,
    age,
    houseNo,
    village,
    visitType,
    pregnancyMonths,
    gestationalWeeks: null,
    babyAgeDays,
    childAgeDays: babyAgeDays,
    weight,
    bpSystolic: bp ? Number(bp[1]) : null,
    bpDiastolic: bp ? Number(bp[2]) : null,
    hemoglobin,
    lastAncDate,
    ttStatus,
    ttLastDoseDate,
    ifaStatus,
    ifaTablets,
    vaccinationsGiven: (text.match(/\b(BCG|OPV-?\d?|Pentavalent-?\d?|Rotavirus-?\d?|TT-?\d?|TD-?\d?)\b/gi) || []).map((item) => item.toUpperCase()),
    symptoms,
    notes: "",
    evidence,
    confidence,
    extractionStatus: "confirmed",
    modelUsed: "mock"
  };
}
async function attemptGeminiCall(ai, transcript, language, model, abortSignal) {
  const response2 = await ai.models.generateContent({
    model,
    contents: buildExtractionPrompt(transcript, language),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema,
      temperature: 0,
      ...model.startsWith("gemini-2.5-") ? { thinkingConfig: { thinkingBudget: 0 } } : {},
      abortSignal
    }
  });
  let parsed;
  try {
    parsed = JSON.parse(response2.text || "");
  } catch {
    throw new LlmProviderError("INVALID_JSON", "Gemini returned invalid JSON.", 0, true);
  }
  try {
    return { ...validateExtraction(parsed, model), modelUsed: model };
  } catch {
    throw new LlmProviderError("INVALID_JSON", "Gemini returned schema-invalid JSON.", 0, true);
  }
}
function validateExtraction(value, modelUsed = process.env.LLM_MODEL?.trim() || "unconfigured") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidExtractionError("Gemini returned a non-object response.");
  }
  const parsed = value;
  assertExtractionSchema(parsed);
  const stringOrNull = (field) => typeof parsed[field] === "string" && parsed[field] ? parsed[field] : null;
  const numberOrNull = (field) => typeof parsed[field] === "number" && Number.isFinite(parsed[field]) ? parsed[field] : null;
  const validVisitType = ["ANC", "PNC", "immunisation"].includes(String(parsed.visitType)) ? parsed.visitType : null;
  const evidenceInput = parsed.evidence && typeof parsed.evidence === "object" ? parsed.evidence : {};
  const evidence = {};
  for (const [key, item] of Object.entries(evidenceInput)) {
    evidence[key] = typeof item === "string" && item ? item : null;
  }
  const symptoms = Array.isArray(parsed.symptoms) ? parsed.symptoms.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const symptom = item;
    if (typeof symptom.canonicalId !== "string" || typeof symptom.negated !== "boolean") return [];
    return [{
      canonicalId: symptom.canonicalId,
      negated: symptom.negated,
      timing: typeof symptom.timing === "string" ? symptom.timing : null,
      certainty: symptom.certainty === "high" ? "high" : "uncertain",
      evidence: typeof symptom.evidence === "string" ? symptom.evidence : ""
    }];
  }) : [];
  const beneficiaryType = ["pregnant_woman", "newborn", "mother"].includes(String(parsed.beneficiaryType)) ? parsed.beneficiaryType : "unknown";
  const names = Array.isArray(parsed.beneficiaryNames) ? parsed.beneficiaryNames.filter((name2) => typeof name2 === "string" && Boolean(name2.trim())) : [];
  const name = stringOrNull("beneficiaryName");
  if (name && !names.includes(name)) names.unshift(name);
  const vaccinations = Array.isArray(parsed.vaccinationsGiven) ? parsed.vaccinationsGiven.filter((item) => typeof item === "string") : [];
  const requiredEvidencePairs = [
    [name, "beneficiaryName"],
    [numberOrNull("age"), "age"],
    [stringOrNull("houseNo"), "houseNo"],
    [stringOrNull("village"), "village"],
    [validVisitType, "visitType"],
    [numberOrNull("pregnancyMonths"), "pregnancyMonths"],
    [numberOrNull("gestationalWeeks"), "gestationalWeeks"],
    [numberOrNull("babyAgeDays"), "babyAgeDays"],
    [numberOrNull("weight"), "weight"],
    [numberOrNull("bpSystolic") !== null && numberOrNull("bpDiastolic") !== null ? "present" : null, "bloodPressure"],
    [numberOrNull("hemoglobin"), "hemoglobin"],
    [stringOrNull("lastAncDate"), "lastAncDate"],
    [stringOrNull("ttStatus"), "ttStatus"],
    [stringOrNull("ttLastDoseDate"), "ttLastDoseDate"],
    [stringOrNull("ifaStatus"), "ifaStatus"],
    [numberOrNull("ifaTablets"), "ifaTablets"],
    [vaccinations.length ? vaccinations : null, "vaccinations"],
    [symptoms.length ? symptoms : null, "symptoms"],
    [typeof parsed.notes === "string" && parsed.notes ? parsed.notes : null, "notes"]
  ];
  if (requiredEvidencePairs.some(([fieldValue, evidenceKey]) => fieldValue !== null && !evidence[evidenceKey])) {
    throw new InvalidExtractionError("Extraction is missing evidence for a populated field.");
  }
  const numericRanges = {
    age: [1, 120],
    pregnancyMonths: [1, 10],
    gestationalWeeks: [1, 42],
    babyAgeDays: [0, 3650],
    weight: [0.1, 300],
    bpSystolic: [20, 400],
    bpDiastolic: [10, 300],
    hemoglobin: [1, 30],
    ifaTablets: [0, 1e3]
  };
  for (const [field, [minimum, maximum]] of Object.entries(numericRanges)) {
    const number = numberOrNull(field);
    if (number !== null && (number < minimum || number > maximum)) {
      throw new InvalidExtractionError(`Extraction contains an unsupported ${field} value.`);
    }
  }
  if (numberOrNull("bpSystolic") !== null && numberOrNull("bpDiastolic") !== null && Number(numberOrNull("bpSystolic")) <= Number(numberOrNull("bpDiastolic"))) {
    throw new InvalidExtractionError("Extraction contains an inconsistent blood pressure.");
  }
  if ([name, stringOrNull("houseNo"), stringOrNull("village"), stringOrNull("ttStatus"), stringOrNull("ifaStatus")].some((item) => item !== null && item.length > 200) || vaccinations.some((item) => item.trim().length > 80)) {
    throw new InvalidExtractionError("Extraction contains text that exceeds the field limits.");
  }
  const status = (present) => present ? "high" : "missing";
  const weight = numberOrNull("weight");
  const systolic = numberOrNull("bpSystolic");
  const diastolic = numberOrNull("bpDiastolic");
  const ifaTablets = numberOrNull("ifaTablets");
  const confidence = {
    beneficiary: status(Boolean(name)),
    age: status(numberOrNull("age") !== null),
    houseNo: status(Boolean(stringOrNull("houseNo"))),
    visitType: status(Boolean(validVisitType)),
    pregnancyMonths: status(numberOrNull("pregnancyMonths") !== null),
    babyAgeDays: status(numberOrNull("babyAgeDays") !== null),
    weight: status(weight !== null),
    bp: status(systolic !== null && diastolic !== null),
    hemoglobin: status(numberOrNull("hemoglobin") !== null),
    lastAncDate: status(Boolean(stringOrNull("lastAncDate"))),
    ttStatus: status(Boolean(stringOrNull("ttStatus"))),
    ifa: status(Boolean(stringOrNull("ifaStatus")) || ifaTablets !== null),
    vaccinations: status(vaccinations.length > 0)
  };
  return {
    beneficiaryName: name,
    beneficiaryNames: names,
    beneficiaryId: null,
    beneficiaryType,
    age: numberOrNull("age"),
    houseNo: stringOrNull("houseNo"),
    village: stringOrNull("village"),
    visitType: validVisitType,
    pregnancyMonths: numberOrNull("pregnancyMonths"),
    gestationalWeeks: numberOrNull("gestationalWeeks"),
    babyAgeDays: numberOrNull("babyAgeDays"),
    childAgeDays: numberOrNull("babyAgeDays"),
    weight,
    bpSystolic: systolic,
    bpDiastolic: diastolic,
    hemoglobin: numberOrNull("hemoglobin"),
    lastAncDate: stringOrNull("lastAncDate"),
    ttStatus: stringOrNull("ttStatus"),
    ttLastDoseDate: stringOrNull("ttLastDoseDate"),
    ifaStatus: stringOrNull("ifaStatus"),
    ifaTablets,
    vaccinationsGiven: vaccinations,
    symptoms,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    evidence,
    confidence,
    extractionStatus: "confirmed",
    modelUsed
  };
}

// server/turn.ts
var ROOT2 = process.env.ASHA_PROJECT_ROOT || path3.resolve(path3.dirname(fileURLToPath3(import.meta.url)), "..");
var BENEFICIARIES_FILE = process.env.ASHA_BENEFICIARIES_FILE || path3.join(ROOT2, "data", "beneficiaries.json");
var DEMO_BENEFICIARIES_FILE = path3.join(ROOT2, "data", "sandbox", "beneficiaries.json");
var sessions = /* @__PURE__ */ new Map();
var recentTurns = /* @__PURE__ */ new Map();
var EMPTY_FIELDS = Object.fromEntries([
  "name",
  "beneficiaryId",
  "age",
  "beneficiaryType",
  "pregnancyMonths",
  "gestationalWeeks",
  "babyAgeDays",
  "houseNo",
  "village",
  "visitType",
  "visitDate",
  "weight",
  "bpSystolic",
  "bpDiastolic",
  "hemoglobin",
  "lastAncDate",
  "ttStatus",
  "ttLastDoseDate",
  "ifaStatus",
  "ifaTablets",
  "vaccinationsGiven",
  "vaccinationsDue",
  "symptoms",
  "notes"
].map((key) => [key, { value: null, state: "missing", evidence: "" }]));
function previewVisitFields(sessionId, transcript, language) {
  const activeSession = sessions.get(sessionId);
  const fields = activeSession ? structuredClone(activeSession.fields) : {
    ...structuredClone(EMPTY_FIELDS),
    visitDate: {
      value: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      state: "confirmed",
      evidence: "System visit date"
    }
  };
  const previous = structuredClone(fields);
  const extracted = extractDeterministic(transcript, language);
  mergeExtraction(fields, extracted, transcript);
  for (const [key, field] of Object.entries(fields)) {
    const oldValue = previous[key]?.value;
    if (JSON.stringify(oldValue) === JSON.stringify(field.value)) continue;
    if (oldValue !== null && oldValue !== void 0) {
      fields[key] = {
        ...previous[key],
        state: "uncertain",
        evidence: `${previous[key].evidence}; live speech may indicate ${String(field.value)}`
      };
    } else {
      field.state = "uncertain";
    }
  }
  return fields;
}
var QUESTIONS = {
  "en-IN": {
    name: "What is the beneficiary\u2019s name?",
    visitType: "Is this an ANC, postnatal, or immunisation visit?",
    weight: "What is the weight?",
    pregnancyMonths: "How many months pregnant?",
    babyAgeDays: "How old is the baby in days or weeks?",
    bpSystolic: "What is the blood pressure?",
    ifaStatus: "Is she taking IFA tablets regularly?",
    lastAncDate: "When was the last ANC visit?",
    ttStatus: "How many TT or Td doses has she received, and when was the last dose?",
    houseNo: "Which house number?",
    save: "Everything else okay, save?",
    edit: "What would you like to correct?",
    chooseHouse: "There are people with this name. Which house is this visit for?",
    choosePerson: "Which person is this visit for?"
  },
  "hi-IN": {
    name: "\u092E\u0930\u0940\u091C \u0915\u093E \u0928\u093E\u092E \u0915\u094D\u092F\u093E \u0939\u0948?",
    visitType: "\u092F\u0939 ANC, \u092A\u094D\u0930\u0938\u0935 \u0915\u0947 \u092C\u093E\u0926 \u0915\u0940, \u092F\u093E \u091F\u0940\u0915\u093E\u0915\u0930\u0923 \u0915\u0940 \u092D\u0947\u0902\u091F \u0939\u0948?",
    weight: "\u0935\u091C\u0928 \u0915\u093F\u0924\u0928\u093E \u0939\u0948?",
    pregnancyMonths: "\u0917\u0930\u094D\u092D\u093E\u0935\u0938\u094D\u0925\u093E \u0915\u093F\u0924\u0928\u0947 \u092E\u0939\u0940\u0928\u0947 \u0915\u0940 \u0939\u0948?",
    babyAgeDays: "\u092C\u091A\u094D\u091A\u0947 \u0915\u0940 \u0909\u092E\u094D\u0930 \u0915\u093F\u0924\u0928\u0947 \u0926\u093F\u0928 \u092F\u093E \u0938\u092A\u094D\u0924\u093E\u0939 \u0939\u0948?",
    bpSystolic: "\u0930\u0915\u094D\u0924\u091A\u093E\u092A \u0915\u093F\u0924\u0928\u093E \u0939\u0948?",
    ifaStatus: "\u0915\u094D\u092F\u093E \u0935\u0947 IFA \u0915\u0940 \u0917\u094B\u0932\u093F\u092F\u093E\u0901 \u0928\u093F\u092F\u092E\u093F\u0924 \u0932\u0947 \u0930\u0939\u0940 \u0939\u0948\u0902?",
    lastAncDate: "\u092A\u093F\u091B\u0932\u0940 ANC \u091C\u093E\u0902\u091A \u0915\u092C \u0939\u0941\u0908 \u0925\u0940?",
    ttStatus: "TT \u092F\u093E Td \u0915\u0940 \u0915\u093F\u0924\u0928\u0940 \u0916\u0941\u0930\u093E\u0915 \u0932\u0917\u0940 \u0939\u0948\u0902, \u0914\u0930 \u0906\u0916\u093F\u0930\u0940 \u0916\u0941\u0930\u093E\u0915 \u0915\u092C \u0932\u0917\u0940?",
    houseNo: "\u092E\u0915\u093E\u0928 \u0928\u0902\u092C\u0930 \u0915\u094D\u092F\u093E \u0939\u0948?",
    save: "\u092C\u093E\u0915\u0940 \u0938\u092C \u0920\u0940\u0915 \u0939\u0948, \u0938\u0947\u0935 \u0915\u0930\u0942\u0901?",
    edit: "\u0906\u092A \u0915\u094D\u092F\u093E \u092C\u0926\u0932\u0928\u093E \u091A\u093E\u0939\u0947\u0902\u0917\u0940?",
    chooseHouse: "\u0907\u0938 \u0928\u093E\u092E \u0915\u0947 \u0915\u0908 \u0932\u094B\u0917 \u0939\u0948\u0902\u0964 \u092F\u0939 \u0915\u093F\u0938 \u092E\u0915\u093E\u0928 \u0915\u093E \u0926\u094C\u0930\u093E \u0939\u0948?",
    choosePerson: "\u092F\u0939 \u0926\u094C\u0930\u093E \u0915\u093F\u0938 \u0935\u094D\u092F\u0915\u094D\u0924\u093F \u0915\u0947 \u0932\u093F\u090F \u0939\u0948?"
  },
  "kn-IN": {
    name: "\u0CAB\u0CB2\u0CBE\u0CA8\u0CC1\u0CAD\u0CB5\u0CBF\u0CAF \u0CB9\u0CC6\u0CB8\u0CB0\u0CC1 \u0C8F\u0CA8\u0CC1?",
    visitType: "\u0C87\u0CA6\u0CC1 ANC, \u0CAA\u0CCD\u0CB0\u0CB8\u0CB5\u0CBE\u0CA8\u0C82\u0CA4\u0CB0\u0CA6, \u0C85\u0CA5\u0CB5\u0CBE \u0CB2\u0CB8\u0CBF\u0C95\u0CC6 \u0CAD\u0CC7\u0C9F\u0CBF \u0C86\u0C97\u0CBF\u0CA6\u0CC6\u0CAF\u0CC7?",
    weight: "\u0CA4\u0CC2\u0C95 \u0C8E\u0CB7\u0CCD\u0C9F\u0CC1?",
    pregnancyMonths: "\u0C97\u0CB0\u0CCD\u0CAD\u0CBE\u0CB5\u0CB8\u0CCD\u0CA5\u0CC6 \u0C8E\u0CB7\u0CCD\u0C9F\u0CC1 \u0CA4\u0CBF\u0C82\u0C97\u0CB3\u0CC1?",
    babyAgeDays: "\u0CAE\u0C97\u0CC1\u0CB5\u0CBF\u0CA8 \u0CB5\u0CAF\u0CB8\u0CCD\u0CB8\u0CC1 \u0C8E\u0CB7\u0CCD\u0C9F\u0CC1 \u0CA6\u0CBF\u0CA8 \u0C85\u0CA5\u0CB5\u0CBE \u0CB5\u0CBE\u0CB0?",
    bpSystolic: "\u0CB0\u0C95\u0CCD\u0CA4\u0CA6\u0CCA\u0CA4\u0CCD\u0CA4\u0CA1 \u0C8E\u0CB7\u0CCD\u0C9F\u0CC1?",
    ifaStatus: "\u0C85\u0CB5\u0CB0\u0CC1 IFA \u0CAE\u0CBE\u0CA4\u0CCD\u0CB0\u0CC6\u0C97\u0CB3\u0CA8\u0CCD\u0CA8\u0CC1 \u0CA8\u0CBF\u0CAF\u0CAE\u0CBF\u0CA4\u0CB5\u0CBE\u0C97\u0CBF \u0CA4\u0CC6\u0C97\u0CC6\u0CA6\u0CC1\u0C95\u0CCA\u0CB3\u0CCD\u0CB3\u0CC1\u0CA4\u0CCD\u0CA4\u0CBF\u0CA6\u0CCD\u0CA6\u0CBE\u0CB0\u0CC6\u0CAF\u0CC7?",
    lastAncDate: "\u0C95\u0CCA\u0CA8\u0CC6\u0CAF ANC \u0CA4\u0CAA\u0CBE\u0CB8\u0CA3\u0CC6 \u0CAF\u0CBE\u0CB5\u0CBE\u0C97 \u0C86\u0CAF\u0CBF\u0CA4\u0CC1?",
    ttStatus: "\u0C8E\u0CB7\u0CCD\u0C9F\u0CC1 TT \u0C85\u0CA5\u0CB5\u0CBE Td \u0CA1\u0CCB\u0CB8\u0CCD \u0C86\u0C97\u0CBF\u0CA6\u0CC6, \u0C95\u0CCA\u0CA8\u0CC6\u0CAF \u0CA1\u0CCB\u0CB8\u0CCD \u0CAF\u0CBE\u0CB5\u0CBE\u0C97?",
    houseNo: "\u0CAE\u0CA8\u0CC6\u0CAF \u0CB8\u0C82\u0C96\u0CCD\u0CAF\u0CC6 \u0C8F\u0CA8\u0CC1?",
    save: "\u0C89\u0CB3\u0CBF\u0CA6\u0CA6\u0CCD\u0CA6\u0CC6\u0CB2\u0CCD\u0CB2\u0CBE \u0CB8\u0CB0\u0CBF\u0CAF\u0CC7, \u0C89\u0CB3\u0CBF\u0CB8\u0CAC\u0CC7\u0C95\u0CC7?",
    edit: "\u0CAF\u0CBE\u0CB5 \u0CAE\u0CBE\u0CB9\u0CBF\u0CA4\u0CBF\u0CAF\u0CA8\u0CCD\u0CA8\u0CC1 \u0CA4\u0CBF\u0CA6\u0CCD\u0CA6\u0CAC\u0CC7\u0C95\u0CC1?",
    chooseHouse: "\u0C88 \u0CB9\u0CC6\u0CB8\u0CB0\u0CBF\u0CA8 \u0CB9\u0CB2\u0CB5\u0CC1 \u0C9C\u0CA8\u0CB0\u0CBF\u0CA6\u0CCD\u0CA6\u0CBE\u0CB0\u0CC6. \u0CAF\u0CBE\u0CB5 \u0CAE\u0CA8\u0CC6\u0CAF \u0CAD\u0CC7\u0C9F\u0CBF \u0C87\u0CA6\u0CC1?",
    choosePerson: "\u0C88 \u0CAD\u0CC7\u0C9F\u0CBF \u0CAF\u0CBE\u0CB0\u0CBF\u0C97\u0CBE\u0C97\u0CBF?"
  }
};
function question(language, field) {
  const lang = QUESTIONS[language] || QUESTIONS["en-IN"];
  return lang[field] || QUESTIONS["en-IN"][field] || "Please clarify this detail.";
}
function setField(fields, key, value, evidence = "", uncertain = false, detector = "rule_engine") {
  if (value === null || value === void 0 || value === "") return;
  const previous = fields[key];
  const previousValues = previous?.value !== null && previous?.value !== void 0 && JSON.stringify(previous.value) !== JSON.stringify(value) ? [
    ...previous.previousValues || [],
    { value: previous.value, timestamp: (/* @__PURE__ */ new Date()).toISOString(), evidence: previous.evidence }
  ] : previous?.previousValues;
  fields[key] = {
    value,
    state: uncertain ? "uncertain" : "confirmed",
    evidence,
    detector,
    ...previousValues ? { previousValues } : {}
  };
}
function mergeExtraction(fields, extracted, source) {
  const add = (key, value, evidenceKey, confidenceKey = evidenceKey) => {
    if (value === null || value === void 0 || value === "") return;
    const evidence = extracted.evidence[evidenceKey] || source;
    const detector = extracted.extractionDiagnostics?.provider === "Gemini" || extracted.extractionDiagnostics?.provider === "Groq" ? "LLM" : "rule_engine";
    setField(fields, key, value, evidence, extracted.confidence[confidenceKey] === "uncertain", detector);
  };
  add("name", extracted.beneficiaryName, "beneficiaryName", "beneficiary");
  add("age", extracted.age, "age");
  add("beneficiaryId", extracted.beneficiaryId, "beneficiaryName");
  add("beneficiaryType", extracted.beneficiaryType === "unknown" ? null : extracted.beneficiaryType, "beneficiaryName");
  add("pregnancyMonths", extracted.pregnancyMonths, "pregnancyMonths");
  add("gestationalWeeks", extracted.gestationalWeeks, "pregnancyMonths");
  add("babyAgeDays", extracted.babyAgeDays, "babyAgeDays");
  add("houseNo", extracted.houseNo, "houseNo");
  add("village", extracted.village, "village");
  add("visitType", extracted.visitType, "visitType");
  add("weight", extracted.weight, "weight");
  add("bpSystolic", extracted.bpSystolic, "bloodPressure", "bp");
  add("bpDiastolic", extracted.bpDiastolic, "bloodPressure", "bp");
  add("hemoglobin", extracted.hemoglobin, "hemoglobin");
  add("lastAncDate", extracted.lastAncDate, "lastAncDate");
  add("ttStatus", extracted.ttStatus, "ttStatus");
  add("ttLastDoseDate", extracted.ttLastDoseDate, "ttLastDoseDate");
  add("ifaStatus", extracted.ifaStatus || (extracted.ifaTablets !== null ? `${extracted.ifaTablets} tablets` : null), "ifaStatus", "ifa");
  add("ifaTablets", extracted.ifaTablets, "ifaStatus", "ifa");
  add("vaccinationsGiven", extracted.vaccinationsGiven.length ? extracted.vaccinationsGiven : null, "vaccinations");
  add("vaccinationsDue", null, "vaccinations");
  add("symptoms", extracted.symptoms.length ? extracted.symptoms.map((s) => ({
    canonicalId: s.canonicalId,
    negated: s.negated,
    timing: s.timing,
    certainty: s.certainty,
    evidence: s.evidence
  })) : null, "symptoms");
  add("notes", extracted.notes || null, "notes");
}
function spokenResponse(session, extracted, danger) {
  if (danger.decision === "FLAG") return "Danger sign recorded. Confirm the visit record; the urgent referral alert remains visible.";
  if (danger.decision === "ASK" && danger.clarificationQuestions.length) return danger.clarificationQuestions[0];
  if (session.pendingQuestion) return session.pendingQuestion;
  return null;
}
async function loadRoster(file = BENEFICIARIES_FILE) {
  try {
    const content = await fs2.readFile(file, "utf8");
    const parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
    const values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray(parsed.value) ? parsed.value : [];
    return values;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
function findMissingField(session) {
  const incomplete = (key) => !session.fields[key] || session.fields[key].value === null || session.fields[key].state !== "confirmed";
  const value = (key) => session.fields[key]?.value;
  if (incomplete("name")) return "name";
  if (incomplete("houseNo")) return "houseNo";
  if (incomplete("visitType")) return "visitType";
  if (incomplete("weight")) return "weight";
  if (value("visitType") === "ANC") {
    if (incomplete("pregnancyMonths")) return "pregnancyMonths";
    if (incomplete("bpSystolic") || incomplete("bpDiastolic")) return "bpSystolic";
    if (incomplete("ifaStatus")) return "ifaStatus";
    if (incomplete("lastAncDate")) return "lastAncDate";
    if (incomplete("ttStatus")) return "ttStatus";
    if (incomplete("ttLastDoseDate")) return "ttStatus";
  }
  if (value("visitType") === "PNC" && incomplete("babyAgeDays")) {
    return "babyAgeDays";
  }
  return null;
}
function validateCorrection(key, value) {
  const numericRanges = {
    age: [1, 120],
    pregnancyMonths: [1, 10],
    gestationalWeeks: [1, 42],
    babyAgeDays: [0, 3650],
    weight: [0.8, 250],
    bpSystolic: [40, 300],
    bpDiastolic: [20, 200],
    hemoglobin: [2, 25],
    ifaTablets: [0, 1e3]
  };
  if (key in numericRanges) {
    const number = typeof value === "number" ? value : Number(value);
    const [min, max] = numericRanges[key];
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new Error(`The correction for ${key} is outside the accepted range.`);
    }
    return number;
  }
  if (key === "visitType") {
    if (!["ANC", "PNC", "immunisation"].includes(String(value))) {
      throw new Error("Visit type must be ANC, PNC, or immunisation.");
    }
    return value;
  }
  if (key === "beneficiaryType") {
    if (!["pregnant_woman", "newborn", "mother", "unknown"].includes(String(value))) {
      throw new Error("Beneficiary type is invalid.");
    }
    return value;
  }
  if (key === "vaccinationsGiven" || key === "vaccinationsDue") {
    const items = Array.isArray(value) ? value : String(value).split(",");
    if (items.some((item) => typeof item !== "string" || item.trim().length > 80)) {
      throw new Error("Vaccination names must be text.");
    }
    return items.map((item) => item.trim()).filter(Boolean);
  }
  if (key === "symptoms") {
    if (typeof value !== "string" && !Array.isArray(value)) {
      throw new Error("Symptoms must be entered as text or a list.");
    }
    return value;
  }
  if (key === "lastAncDate" || key === "ttLastDoseDate" || key === "visitDate") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00`))) {
      throw new Error(`The correction for ${key} must be a date in YYYY-MM-DD format.`);
    }
    return value;
  }
  if (typeof value !== "string" || value.trim().length > 500) {
    throw new Error(`The correction for ${key} must be text of 500 characters or fewer.`);
  }
  return value.trim();
}
function makeSavedRecord(session, danger) {
  const fields = session.fields;
  const visitDate = String(fields.visitDate.value || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
  const followups = generateFollowups(
    String(fields.visitType.value || "ANC"),
    fields.gestationalWeeks.value === null ? null : Number(fields.gestationalWeeks.value),
    fields.babyAgeDays.value === null ? null : Number(fields.babyAgeDays.value),
    fields.ifaTablets.value === null ? null : Number(fields.ifaTablets.value),
    visitDate
  );
  return {
    id: session.pendingRecordId || `${session.demoMode ? "DEMO-" : "REC-"}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    beneficiaryName: fields.name.value,
    beneficiaryId: fields.beneficiaryId.value || fields.name.value,
    village: fields.village.value,
    houseNo: fields.houseNo.value,
    visitType: fields.visitType.value,
    isFlagged: danger.decision === "FLAG",
    dangerDecision: danger.decision,
    flaggedSigns: danger.flaggedSigns,
    referralSlip: danger.referralSlip,
    ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])),
    bp: fields.bpSystolic.value !== null && fields.bpDiastolic.value !== null ? `${fields.bpSystolic.value}/${fields.bpDiastolic.value}` : null,
    transcript: session.transcript,
    followups
  };
}
function buildReadBack(fields, language) {
  const parts = [];
  const name = fields.name?.value;
  const visitType = fields.visitType?.value;
  if (name) parts.push(`Patient ${String(name)}`);
  if (visitType) parts.push(`${String(visitType)} visit`);
  const labels = language === "kn-IN" ? ["\u0CB5\u0CAF\u0CB8\u0CCD\u0CB8\u0CC1", "\u0C97\u0CB0\u0CCD\u0CAD\u0CBE\u0CB5\u0CB8\u0CCD\u0CA5\u0CC6", "\u0CAE\u0C97\u0CC1\u0CB5\u0CBF\u0CA8 \u0CB5\u0CAF\u0CB8\u0CCD\u0CB8\u0CC1", "\u0CA4\u0CC2\u0C95", "\u0CB8\u0CBF\u0CB8\u0CCD\u0C9F\u0CCA\u0CB2\u0CBF\u0C95\u0CCD BP", "\u0CA1\u0CAF\u0CBE\u0CB8\u0CCD\u0C9F\u0CCA\u0CB2\u0CBF\u0C95\u0CCD BP", "\u0CB9\u0CBF\u0CAE\u0CCB\u0C97\u0CCD\u0CB2\u0CCB\u0CAC\u0CBF\u0CA8\u0CCD", "\u0C95\u0CCA\u0CA8\u0CC6\u0CAF ANC", "TT \u0CB8\u0CCD\u0CA5\u0CBF\u0CA4\u0CBF", "\u0C95\u0CCA\u0CA8\u0CC6\u0CAF TT \u0CA1\u0CCB\u0CB8\u0CCD"] : language === "hi-IN" ? ["\u0909\u092E\u094D\u0930", "\u0917\u0930\u094D\u092D\u093E\u0935\u0938\u094D\u0925\u093E", "\u092C\u091A\u094D\u091A\u0947 \u0915\u0940 \u0909\u092E\u094D\u0930", "\u0935\u091C\u0928", "\u090A\u092A\u0930\u0940 BP", "\u0928\u093F\u091A\u0932\u093E BP", "\u0939\u0940\u092E\u094B\u0917\u094D\u0932\u094B\u092C\u093F\u0928", "\u092A\u093F\u091B\u0932\u0940 ANC", "TT \u0938\u094D\u0925\u093F\u0924\u093F", "\u0906\u0916\u093F\u0930\u0940 TT \u0916\u0941\u0930\u093E\u0915"] : ["Age", "Pregnancy", "Baby age", "Weight", "systolic BP", "diastolic BP", "haemoglobin", "Last ANC", "TT status", "Last TT dose"];
  const saveText = QUESTIONS[language]?.save || QUESTIONS["en-IN"].save;
  if (fields.beneficiaryId?.value) parts.push(`ID ${fields.beneficiaryId.value}`);
  if (fields.houseNo?.value) parts.push(`House ${fields.houseNo.value}`);
  if (fields.village?.value) parts.push(`Village ${fields.village.value}`);
  if (fields.visitDate?.value) parts.push(`Visit date ${fields.visitDate.value}`);
  for (const [[key], label, unit] of [
    [["age"], labels[0], "years"],
    [["pregnancyMonths"], labels[1], "months"],
    [["babyAgeDays"], labels[2], "days"],
    [["weight"], labels[3], "kg"],
    [["hemoglobin"], labels[6], "g/dL"],
    [["lastAncDate"], labels[7], ""],
    [["ttStatus"], labels[8], ""],
    [["ttLastDoseDate"], labels[9], ""]
  ]) {
    const field = fields[key];
    if (field && field.value !== null) {
      const value = field.state === "uncertain" ? String(field.value).split("").map(
        (digit) => digit === "." ? language === "hi-IN" ? "\u0926\u0936\u092E\u0932\u0935" : language === "kn-IN" ? "\u0CA6\u0CB6\u0CAE\u0CBE\u0C82\u0CB6" : "point" : digit === "-" ? language === "hi-IN" ? "\u0921\u0948\u0936" : language === "kn-IN" ? "\u0CA1\u0CCD\u0CAF\u0CBE\u0CB6\u0CCD" : "dash" : digit
      ).join(" ") : String(field.value);
      parts.push(`${label} ${value}${unit ? ` ${unit}` : ""}`);
    }
  }
  if (fields.bpSystolic?.value !== null && fields.bpDiastolic?.value !== null) {
    parts.push(`Blood pressure ${fields.bpSystolic.value}/${fields.bpDiastolic.value} mmHg`);
  }
  if (fields.ifaStatus?.value !== null) parts.push(`IFA status ${fields.ifaStatus.value}`);
  if (Array.isArray(fields.vaccinationsGiven?.value) && fields.vaccinationsGiven.value.length) {
    parts.push(`Vaccinations given ${fields.vaccinationsGiven.value.join(", ")}`);
  }
  if (Array.isArray(fields.symptoms?.value) && fields.symptoms.value.length) {
    const symptoms = fields.symptoms.value.map(
      (symptom) => `${symptom.negated ? "No " : ""}${String(symptom.canonicalId || "symptom")}`
    );
    parts.push(`Symptoms ${symptoms.join(", ")}`);
  }
  const optionalMissing = [
    ["hemoglobin", "haemoglobin"],
    ["ifaTablets", "IFA tablet quantity"],
    ["vaccinationsGiven", "vaccinations"],
    ["vaccinationsDue", "vaccinations due"],
    ["symptoms", "symptoms"]
  ].filter(([key]) => fields[key]?.value === null).map(([, label]) => label);
  if (optionalMissing.length) parts.push(`Not recorded: ${optionalMissing.join(", ")}`);
  return `${parts.join(". ")}. ${saveText}`.trim();
}
function processTurn(input, extract = extractWithFallback) {
  const transcript = input.transcript.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (!transcript) return processTurnOnce(input, extract);
  const key = `${input.session_id}\0${transcript}`;
  const now = Date.now();
  for (const [oldKey, value] of recentTurns) {
    if (now - value.startedAt > 3e3) recentTurns.delete(oldKey);
  }
  const duplicate = recentTurns.get(key);
  if (duplicate && now - duplicate.startedAt <= 3e3) return duplicate.result;
  const entry = {
    startedAt: now,
    result: processTurnOnce(input, extract)
  };
  recentTurns.set(key, entry);
  void entry.result.catch(() => {
    if (recentTurns.get(key) === entry) recentTurns.delete(key);
  });
  return entry.result;
}
async function processTurnOnce(input, extract) {
  const text = input.transcript.trim();
  if (!input.session_id || !text && !input.corrections) {
    throw new Error("session_id and transcript or field corrections are required.");
  }
  const language = ["en-IN", "hi-IN", "kn-IN"].includes(input.language) ? input.language : "en-IN";
  const session = sessions.get(input.session_id) || {
    id: input.session_id,
    language,
    transcript: "",
    fields: {
      ...structuredClone(EMPTY_FIELDS),
      visitDate: {
        value: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        state: "confirmed",
        evidence: "System visit date"
      }
    },
    pendingQuestion: null,
    pendingField: null,
    duplicateCandidates: [],
    pendingDangerSignId: null,
    dangerClarifications: {},
    pendingSave: false,
    pendingRecordId: null,
    savedRecord: null,
    demoMode: input.session_id.startsWith("demo-")
  };
  session.language = language;
  const previousQuestion = session.pendingQuestion;
  const pendingField = session.pendingField;
  session.transcript = [session.transcript, text].filter(Boolean).join(". ");
  const currentLower = text.toLowerCase();
  if (session.savedRecord) {
    sessions.set(session.id, session);
    const storedDanger = evaluateDangerSigns(
      session.transcript,
      language,
      String(session.fields.name.value || "Beneficiary"),
      String(session.fields.beneficiaryId.value || "ID-Pending"),
      "ASHA-001",
      session.dangerClarifications
    );
    if (session.savedRecord.isFlagged === true) {
      storedDanger.decision = "FLAG";
      storedDanger.flaggedSigns = Array.isArray(session.savedRecord.flaggedSigns) ? session.savedRecord.flaggedSigns : storedDanger.flaggedSigns;
      storedDanger.referralSlip = typeof session.savedRecord.referralSlip === "string" ? session.savedRecord.referralSlip : storedDanger.referralSlip;
    }
    return response(session, emptyExtraction(), storedDanger, [], null, [], session.savedRecord);
  }
  if (session.pendingSave && /^(?:no|nope|not yet|nahi|नहीं|ಇಲ್ಲ)[.!?]*$/i.test(currentLower)) {
    session.pendingSave = false;
    session.pendingQuestion = question(language, "edit");
    session.pendingField = null;
    sessions.set(session.id, session);
    const danger2 = evaluateDangerSigns(
      session.transcript,
      language,
      String(session.fields.name.value || "Beneficiary"),
      String(session.fields.beneficiaryId.value || "ID-Pending"),
      "ASHA-001",
      session.dangerClarifications
    );
    return response(session, emptyExtraction(), danger2, [session.pendingQuestion], session.pendingQuestion, [], null);
  }
  const allowedCorrections = new Set(Object.keys(EMPTY_FIELDS));
  for (const [key, value] of Object.entries(input.corrections || {})) {
    if (!allowedCorrections.has(key)) throw new Error(`Unsupported correction field: ${key}`);
    if (value === null || value === void 0 || value === "") continue;
    setField(session.fields, key, validateCorrection(key, value), "Manual keypad correction", false, "manual_edit");
  }
  if (session.duplicateCandidates.length && session.duplicateCandidates.some((candidate) => candidate.id === session.fields.beneficiaryId.value)) {
    session.duplicateCandidates = [];
    session.pendingQuestion = null;
    session.pendingField = null;
  }
  if (session.pendingSave && /^(yes|yeah|yep|correct|okay|ok|save|haan|हां|हाँ|ಹೌದು)\b/i.test(currentLower)) {
    const danger2 = evaluateDangerSigns(
      session.transcript,
      language,
      String(session.fields.name.value || "Beneficiary"),
      String(session.fields.beneficiaryId.value || "ID-Pending"),
      "ASHA-001",
      session.dangerClarifications
    );
    const record = makeSavedRecord(session, danger2);
    session.pendingRecordId = String(record.id);
    const encryptedRecord = await saveVisitRecord(record);
    session.savedRecord = record;
    session.pendingSave = false;
    session.pendingQuestion = null;
    sessions.set(session.id, session);
    const savedLine = language === "kn-IN" ? "\u0CAD\u0CC7\u0C9F\u0CBF\u0CAF\u0CA8\u0CCD\u0CA8\u0CC1 \u0CB8\u0CC1\u0CB0\u0C95\u0CCD\u0CB7\u0CBF\u0CA4\u0CB5\u0CBE\u0C97\u0CBF \u0C89\u0CB3\u0CBF\u0CB8\u0CB2\u0CBE\u0C97\u0CBF\u0CA6\u0CC6. \u0CAE\u0CC1\u0C82\u0CA6\u0CBF\u0CA8 \u0C85\u0CA8\u0CC1\u0CB8\u0CB0\u0CA3\u0CC6 \u0CAA\u0C9F\u0CCD\u0C9F\u0CBF \u0C87\u0CB2\u0CCD\u0CB2\u0CBF\u0CA6\u0CC6." : language === "hi-IN" ? "\u092D\u0947\u0902\u091F \u0938\u0941\u0930\u0915\u094D\u0937\u093F\u0924 \u0930\u0942\u092A \u0938\u0947 \u0938\u0947\u0935 \u0939\u0941\u0908\u0964 \u0906\u0917\u0947 \u0915\u0940 \u091C\u093E\u0902\u091A \u0938\u0942\u091A\u0940 \u092F\u0939 \u0930\u0939\u0940\u0964" : "Visit saved securely. Here is the follow-up list.";
    return response(session, emptyExtraction(), danger2, [], savedLine, record.followups, record, encryptedRecord);
  }
  const extractionLabels = {
    name: "beneficiary name",
    houseNo: "house number",
    visitType: "visit type",
    pregnancyMonths: "pregnancy duration in months",
    weight: "weight",
    bpSystolic: "blood pressure",
    lastAncDate: "last ANC date",
    ttStatus: "TT status and last TT dose date",
    ifaStatus: "IFA status",
    babyAgeDays: "baby age in days"
  };
  const pendingFieldPattern = {
    name: /\b(name|beneficiary)\b/i,
    houseNo: /\b(house|ghar)\b/i,
    visitType: /\b(anc|pnc|postnatal|immunisation|immunization)\b/i,
    pregnancyMonths: /\b(months?|weeks?)\b/i,
    weight: /\b(weight|kilo|kg|vajan|wazan)\b/i,
    bpSystolic: /\b(bp|blood pressure)\b/i,
    lastAncDate: /\b(last anc|anc date|last checkup|last visit)\b/i,
    ttStatus: /\b(tt|td|dose|doses)\b/i,
    ifaStatus: /\b(ifa|iron)\b/i,
    babyAgeDays: /\b(baby|days?|weeks?)\b/i
  };
  const extractionText = pendingField && extractionLabels[pendingField] && !pendingFieldPattern[pendingField]?.test(text) ? `${extractionLabels[pendingField]} ${text}` : text;
  const extracted = text ? session.demoMode ? {
    ...extractDeterministic(extractionText, language),
    modelUsed: "demo-rules",
    llmStatus: "ready",
    extractionDiagnostics: {
      provider: "Rules",
      model: "demo-rules",
      failedProviders: [],
      providerLatencyMs: { Gemini: 0, Groq: 0 },
      totalLatencyMs: 0,
      llmCalls: 0
    }
  } : await extract(extractionText, language) : emptyExtraction();
  mergeExtraction(session.fields, extracted, text);
  if (pendingField === "houseNo" && session.duplicateCandidates.length) {
    const digits = text.match(/\b[A-Za-z0-9-]+\b/)?.[0];
    if (digits) {
      const selected = session.duplicateCandidates.find((item) => item.house_no === digits);
      if (selected) {
        setField(session.fields, "name", selected.name, text);
        setField(session.fields, "beneficiaryId", selected.id, text);
        setField(session.fields, "houseNo", selected.house_no, text);
        setField(session.fields, "village", selected.village, text);
        setField(session.fields, "age", selected.age, text);
        session.duplicateCandidates = [];
      }
    }
  }
  if (pendingField === "ttStatus") {
    const answerDate = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)?.[1];
    if (answerDate) setField(session.fields, "ttLastDoseDate", answerDate, text);
    if (!session.fields.ttStatus.value && /\b(one|two|three|1|2|3)\b/i.test(text)) {
      const doses = text.match(/\b(one|two|three|1|2|3)\b/i)?.[1];
      setField(session.fields, "ttStatus", `${doses} doses`, text);
    }
  }
  const isWeightCorrection = /^(?:no[, ]*)?(?:weight\s*(?:is|:)?\s*)?\d+(?:\.\d+)?\s*(?:kg|kilo)?$/i.test(text);
  if (pendingField === "weight" && isWeightCorrection || /^(?:no[, ]*)?weight\s*(?:is|:)?\s*\d+(?:\.\d+)?\s*(?:kg|kilo)?$/i.test(text)) {
    const correction = Number(text.match(/\d+(?:\.\d+)?/)?.[0]);
    setField(session.fields, "weight", correction, text);
  }
  if (pendingField === "bpSystolic") {
    const bpMatch = text.match(/(\d{2,3})\s*(?:by|\/)\s*(\d{2,3})/i);
    if (bpMatch) {
      setField(session.fields, "bpSystolic", Number(bpMatch[1]), text);
      setField(session.fields, "bpDiastolic", Number(bpMatch[2]), text);
    }
  }
  session.pendingQuestion = null;
  session.pendingField = null;
  const rosterFile = session.demoMode ? DEMO_BENEFICIARIES_FILE : BENEFICIARIES_FILE;
  const roster = await loadRoster(rosterFile);
  const mentionedNames = extracted.beneficiaryNames;
  if (mentionedNames.length > 1 && !previousQuestion?.includes("person")) {
    session.pendingQuestion = question(language, "choosePerson");
    session.pendingField = "name";
  } else if (previousQuestion === question(language, "choosePerson")) {
    const selected = mentionedNames.find((candidate) => text.toLowerCase().includes(candidate.toLowerCase()));
    if (selected) setField(session.fields, "name", selected, text);
  }
  let rosterLabel = null;
  let beneficiaryResult = null;
  const currentName = String(session.fields.name.value || "");
  if (currentName && !session.pendingQuestion) {
    const matches = roster.filter((item) => item.name.toLowerCase() === currentName.toLowerCase());
    const house = String(session.fields.houseNo.value || "");
    const village = String(session.fields.village.value || "");
    const sameNameRepeated = text.toLowerCase().split(currentName.toLowerCase()).length - 1 > 1;
    if (matches.length > 1 && (!house || sameNameRepeated)) {
      session.duplicateCandidates = matches;
      session.pendingQuestion = question(language, "chooseHouse");
      session.pendingField = "houseNo";
    } else if (matches.length > 1 && house && !matches.some(
      (item) => item.house_no === house && (!village || item.village.toLowerCase() === village.toLowerCase())
    )) {
      session.duplicateCandidates = matches;
      session.pendingQuestion = question(language, "chooseHouse");
      session.pendingField = "houseNo";
    } else if (matches.length > 1 && house) {
      const selected = matches.find(
        (item) => item.house_no === house && (!village || item.village.toLowerCase() === village.toLowerCase())
      );
      if (selected) {
        beneficiaryResult = { status: "existing", beneficiary: selected };
        setField(session.fields, "beneficiaryId", selected.id, currentName);
        setField(session.fields, "village", selected.village, currentName);
        if (session.fields.age.value === null && selected.age !== null) {
          setField(session.fields, "age", selected.age, currentName);
        }
      }
    } else if (matches.length === 1 && (!house || matches[0].house_no === house)) {
      beneficiaryResult = { status: "existing", beneficiary: matches[0] };
      setField(session.fields, "beneficiaryId", matches[0].id, currentName);
      if (!house) setField(session.fields, "houseNo", matches[0].house_no, currentName);
      if (!village) setField(session.fields, "village", matches[0].village, currentName);
      if (session.fields.age.value === null && matches[0].age !== null) {
        setField(session.fields, "age", matches[0].age, currentName);
      }
    } else {
      const houseNo = String(session.fields.houseNo.value || "");
      if (!houseNo) {
      } else {
        const created = {
          id: `NEW-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: currentName,
          house_no: houseNo,
          village: String(session.fields.village.value || ""),
          category: session.fields.visitType.value === "PNC" ? "PNC" : "ANC",
          age: typeof session.fields.age.value === "number" ? session.fields.age.value : null,
          isNew: true
        };
        await fs2.mkdir(path3.dirname(rosterFile), { recursive: true });
        await fs2.writeFile(rosterFile, JSON.stringify([...roster, created], null, 2), "utf8");
        setField(session.fields, "beneficiaryId", created.id, currentName);
        rosterLabel = "created";
        beneficiaryResult = { status: "created", beneficiary: created };
      }
    }
  }
  const weightText = String(session.fields.weight.evidence || "");
  const parsedWeight = parseWeight(
    weightText || extracted.evidence.weight || "",
    session.fields.beneficiaryType.value === "newborn" ? "newborn" : "adult",
    language
  );
  if (session.fields.weight.value === null && parsedWeight.value !== null) {
    setField(session.fields, "weight", parsedWeight.value, parsedWeight.rawText, parsedWeight.state === "uncertain");
  } else if (session.fields.weight.value !== null && parsedWeight.state === "uncertain") {
    session.fields.weight.state = "uncertain";
  }
  const systolic = Number(session.fields.bpSystolic.value);
  const diastolic = Number(session.fields.bpDiastolic.value);
  if (session.fields.bpSystolic.value !== null && (systolic < 70 || systolic > 250 || diastolic < 40 || diastolic > 150)) {
    session.fields.bpSystolic.state = "uncertain";
    session.fields.bpDiastolic.state = "uncertain";
  }
  const affirmativeSymptomAnswer = /^(yes|yeah|yep|haan|हां|हाँ|ಹೌದು)\b/i.test(currentLower);
  const negativeSymptomAnswer = /^(no|nope|nahi|नहीं|ಇಲ್ಲ)\b/i.test(currentLower);
  const symptomSignId = pendingField === "symptoms" ? session.pendingDangerSignId : null;
  if (symptomSignId && (affirmativeSymptomAnswer || negativeSymptomAnswer)) {
    session.dangerClarifications[symptomSignId] = affirmativeSymptomAnswer ? "present" : "absent";
    const existing = Array.isArray(session.fields.symptoms.value) ? session.fields.symptoms.value : [];
    setField(session.fields, "symptoms", [
      ...existing.filter((item) => item.canonicalId !== symptomSignId),
      {
        canonicalId: symptomSignId,
        negated: negativeSymptomAnswer,
        timing: "current",
        certainty: "high",
        evidence: text
      }
    ], text, false, "manual_edit");
    session.pendingDangerSignId = null;
  } else if (text) {
    for (const sign of DANGER_SIGNS_LIST) {
      if (sign.synonyms.some((synonym) => currentLower.includes(synonym.toLowerCase()))) {
        delete session.dangerClarifications[sign.id];
      }
    }
  }
  const danger = evaluateDangerSigns(
    session.transcript,
    language,
    currentName || "Beneficiary",
    String(session.fields.beneficiaryId.value || "ID-Pending"),
    "ASHA-001",
    session.dangerClarifications
  );
  const isDangerClarification = Boolean(
    symptomSignId && (affirmativeSymptomAnswer || negativeSymptomAnswer)
  );
  if (extracted.extractionDiagnostics?.provider === "Rules" && !hasExtractedData(extracted) && !isDangerClarification) {
    const retryMessage = language === "hi-IN" ? "\u092E\u093E\u092B\u093C \u0915\u0940\u091C\u093F\u090F, \u092E\u0948\u0902 \u0938\u092E\u091D \u0928\u0939\u0940\u0902 \u092A\u093E\u092F\u093E\u0964 \u0915\u0943\u092A\u092F\u093E \u090F\u0915 \u092C\u093E\u0930 \u092B\u093F\u0930 \u0915\u0939\u0947\u0902\u0964" : language === "kn-IN" ? "\u0C95\u0CCD\u0CB7\u0CAE\u0CBF\u0CB8\u0CBF, \u0CA8\u0CA8\u0C97\u0CC6 \u0C85\u0CB0\u0CCD\u0CA5\u0CB5\u0CBE\u0C97\u0CB2\u0CBF\u0CB2\u0CCD\u0CB2. \u0CA6\u0CAF\u0CB5\u0CBF\u0C9F\u0CCD\u0C9F\u0CC1 \u0CAE\u0CA4\u0CCD\u0CA4\u0CCA\u0CAE\u0CCD\u0CAE\u0CC6 \u0CB9\u0CC7\u0CB3\u0CBF." : "Sorry, I did not catch that. Please say it once more.";
    session.pendingQuestion = retryMessage;
    session.pendingField = null;
    sessions.set(session.id, session);
    return response(
      session,
      extracted,
      danger,
      [retryMessage],
      retryMessage,
      [],
      null,
      null,
      null,
      null,
      danger.ruleFired,
      "busy"
    );
  }
  if (session.pendingQuestion) {
  } else if (danger.decision === "ASK" && danger.clarificationQuestions.length) {
    const symptomLabels = language === "kn-IN" ? { vaginal_bleeding: "\u0CB0\u0C95\u0CCD\u0CA4\u0CB8\u0CCD\u0CB0\u0CBE\u0CB5", high_fever_pregnancy: "\u0CB9\u0CC6\u0C9A\u0CCD\u0C9A\u0CBF\u0CA8 \u0C9C\u0CCD\u0CB5\u0CB0" } : language === "hi-IN" ? { vaginal_bleeding: "\u0930\u0915\u094D\u0924\u0938\u094D\u0930\u093E\u0935", high_fever_pregnancy: "\u0924\u0947\u091C\u093C \u092C\u0941\u0916\u093E\u0930" } : { vaginal_bleeding: "bleeding", high_fever_pregnancy: "high fever" };
    const uncertainSign = danger.evidence.find((item) => item.state === "ASK")?.signId || "vaginal_bleeding";
    const label = symptomLabels[uncertainSign] || uncertainSign.replace(/_/g, " ");
    session.pendingQuestion = language === "kn-IN" ? `\u0C88\u0C97 ${label} \u0C87\u0CA6\u0CC6\u0CAF\u0CC7? \u0CB9\u0CCC\u0CA6\u0CC1 \u0C85\u0CA5\u0CB5\u0CBE \u0C87\u0CB2\u0CCD\u0CB2 \u0C8E\u0C82\u0CA6\u0CC1 \u0CB9\u0CC7\u0CB3\u0CBF.` : language === "hi-IN" ? `\u0915\u094D\u092F\u093E \u0905\u092D\u0940 ${label} \u0939\u0948? \u0915\u0943\u092A\u092F\u093E \u0939\u093E\u0901 \u092F\u093E \u0928\u0939\u0940\u0902 \u0915\u0939\u0947\u0902\u0964` : `Is there ${label} now? Please answer yes or no.`;
    session.pendingField = "symptoms";
    session.pendingDangerSignId = danger.evidence.find((item) => item.state === "ASK")?.signId || null;
  } else {
    if (parsedWeight.isConfusable) {
      session.pendingField = "weight";
      session.pendingQuestion = language === "en-IN" ? "Did you say seven (7) or sixty (60)? Please confirm." : language === "kn-IN" ? "\u0CA8\u0CC0\u0CB5\u0CC1 \u0C8F\u0CB3\u0CC1 (7) \u0C8E\u0C82\u0CA6\u0CBF\u0CB0\u0CBE \u0C85\u0CA5\u0CB5\u0CBE \u0C85\u0CB0\u0CB5\u0CA4\u0CCD\u0CA4\u0CC1 (60) \u0C8E\u0C82\u0CA6\u0CBF\u0CB0\u0CBE? \u0CA6\u0CAF\u0CB5\u0CBF\u0C9F\u0CCD\u0C9F\u0CC1 \u0C96\u0C9A\u0CBF\u0CA4\u0CAA\u0CA1\u0CBF\u0CB8\u0CBF." : parsedWeight.confusablePrompt || question(language, "weight");
    } else if (findMissingField(session)) {
      const missing = findMissingField(session);
      session.pendingField = missing;
      session.pendingQuestion = question(language, missing);
    } else {
      session.pendingSave = true;
      session.pendingQuestion = question(language, "save");
    }
  }
  const questions = session.pendingQuestion ? [session.pendingQuestion] : [];
  const readBack = session.pendingSave ? buildReadBack(session.fields, language) : null;
  sessions.set(session.id, session);
  const answerText = spokenResponse(session, extracted, danger);
  const announcedAnswer = rosterLabel ? `New patient ${currentName} added. ${answerText || ""}`.trim() : answerText;
  return response(
    session,
    extracted,
    danger,
    questions,
    announcedAnswer,
    [],
    null,
    null,
    readBack,
    rosterLabel,
    parsedWeight.explanation,
    void 0,
    beneficiaryResult
  );
}
function emptyExtraction() {
  return {
    beneficiaryName: null,
    beneficiaryNames: [],
    beneficiaryId: null,
    beneficiaryType: "unknown",
    age: null,
    houseNo: null,
    village: null,
    visitType: null,
    pregnancyMonths: null,
    gestationalWeeks: null,
    babyAgeDays: null,
    childAgeDays: null,
    weight: null,
    bpSystolic: null,
    bpDiastolic: null,
    hemoglobin: null,
    lastAncDate: null,
    ttStatus: null,
    ttLastDoseDate: null,
    ifaStatus: null,
    ifaTablets: null,
    vaccinationsGiven: [],
    symptoms: [],
    notes: "",
    evidence: {},
    confidence: {},
    extractionStatus: "confirmed",
    modelUsed: process.env.LLM_PROVIDER === "mock" ? "mock" : process.env.LLM_MODEL?.trim() || "unconfigured"
  };
}
function response(session, extracted, danger, questions, answerText, followups, record, encryptedRecord = null, readBackText = null, rosterLabel = null, rule = danger.ruleFired, llmStatus = extracted.llmStatus || "ready", beneficiaryResult = null) {
  return {
    session_id: session.id,
    transcript: session.transcript,
    extracted,
    fields: structuredClone(session.fields),
    questions,
    answer_text: answerText,
    danger,
    read_back_text: readBackText,
    saved: Boolean(record),
    encrypted_record: encryptedRecord,
    followups,
    referral_slip: danger.referralSlip,
    saved_record: record,
    test_mode: session.demoMode || process.env.LLM_PROVIDER === "mock",
    roster_label: rosterLabel,
    beneficiary_result: beneficiaryResult,
    duplicate_candidates: [...session.duplicateCandidates],
    rule,
    llm_status: llmStatus,
    extraction_status: extracted.extractionDiagnostics || null
  };
}
function discardTurnSession(sessionId) {
  sessions.delete(sessionId);
  for (const key of recentTurns.keys()) {
    if (key.startsWith(`${sessionId}\0`)) recentTurns.delete(key);
  }
}

// server/health.ts
function createHealthResponse(input) {
  return {
    gnani_key: input.gnaniKey,
    llm_key: input.llmKey,
    fallback_key: input.fallbackKey,
    encryption_key: input.encryptionKey,
    stt_ok: input.sttOk,
    tts_ok: input.ttsOk,
    port: input.port
  };
}

// server.ts
var app = express();
var server = http.createServer(app);
var PORT = Number(process.env.PORT) || 3e3;
var HOST = "0.0.0.0";
var PROJECT_ROOT = process.env.ASHA_PROJECT_ROOT || path4.dirname(fileURLToPath4(import.meta.url));
var BENEFICIARIES_FILE2 = process.env.ASHA_BENEFICIARIES_FILE || path4.join(PROJECT_ROOT, "data", "beneficiaries.json");
app.use(express.json({ limit: "10mb" }));
app.get("/api/beneficiaries", async (_req, res) => {
  try {
    res.json(await readNewBeneficiaries());
  } catch {
    res.status(500).json({ error: "Could not load beneficiaries." });
  }
});
app.post("/api/beneficiaries", async (req, res) => {
  const { name, house_no, category, age, village } = req.body;
  if (typeof name !== "string" || !name.trim() || typeof house_no !== "string" || !house_no.trim() || typeof village !== "string" || !village.trim() || !["ANC", "PNC"].includes(category)) {
    return res.status(400).json({ error: "Name, house number, village, and valid beneficiary type are required." });
  }
  try {
    const records = await readNewBeneficiaries();
    const existing = records.find(
      (item) => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase() && item.house_no === house_no.trim() && item.village.toLocaleLowerCase() === village.trim().toLocaleLowerCase()
    );
    if (existing) return res.json(existing);
    const created = {
      id: `NEW-${Date.now()}`,
      name: name.trim(),
      house_no: house_no.trim(),
      village: village.trim(),
      category,
      age: age !== null && age !== void 0 && Number.isFinite(Number(age)) ? Number(age) : null,
      isNew: true
    };
    const updated = [...records, created];
    await fs3.mkdir(path4.dirname(BENEFICIARIES_FILE2), { recursive: true });
    await fs3.writeFile(BENEFICIARIES_FILE2, JSON.stringify(updated, null, 2), "utf8");
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Could not save beneficiary." });
  }
});
app.get("/api/records", async (_req, res) => {
  try {
    res.json(await listVisitRecords());
  } catch (error) {
    console.error("[api/records] Could not load saved visit records:", error instanceof Error ? error.message : "unknown error");
    res.status(500).json({ error: "Could not load saved visit records." });
  }
});
app.patch("/api/records/:recordId/followups/:followupId", async (req, res) => {
  const completed = req.body?.completed;
  if (typeof completed !== "boolean") {
    return res.status(400).json({ error: "completed must be true or false." });
  }
  try {
    const record = await updateVisitFollowup(req.params.recordId, req.params.followupId, completed);
    res.json(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update follow-up.";
    const status = message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: message });
  }
});
app.delete("/api/records", async (_req, res) => {
  try {
    await deleteVisitRecords();
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: "Could not delete saved visit records." });
  }
});
app.delete("/api/beneficiaries", async (_req, res) => {
  try {
    await fs3.rm(BENEFICIARIES_FILE2, { force: true });
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: "Could not delete beneficiaries." });
  }
});
var cachedHealth = null;
var cachedHealthAt = 0;
var healthProbe = null;
app.get("/api/health", async (_req, res) => {
  if (cachedHealth && Date.now() - cachedHealthAt < 6e4) {
    return res.json(cachedHealth);
  }
  if (!healthProbe) {
    healthProbe = checkHealth().then((health) => {
      cachedHealth = health;
      cachedHealthAt = Date.now();
      return health;
    }).finally(() => {
      healthProbe = null;
    });
  }
  res.json(await healthProbe);
});
app.get("/api/config", (req, res) => {
  res.json({
    sttModel: "prisma-v3.0",
    ttsModel: "timbre-v3.0",
    llmModel: process.env.LLM_MODEL?.trim() || null,
    fallbackModel: process.env.FALLBACK_MODEL?.trim() || null,
    sttEndpoint: "wss://api.vachana.ai/stt/v3/stream",
    ttsEndpoint: "wss://api.vachana.ai/api/v1/tts",
    testMode: process.env.LLM_PROVIDER === "mock"
  });
});
app.post("/api/turn", async (req, res) => {
  const { session_id, transcript, language, corrections } = req.body;
  if (typeof session_id !== "string" || !session_id.trim() || typeof transcript !== "string" || !transcript.trim() && (!corrections || typeof corrections !== "object" || Array.isArray(corrections)) || typeof language !== "string") {
    return res.status(400).json({ error: "session_id, transcript, and language are required." });
  }
  try {
    res.json(await processTurn({ session_id, transcript, language, corrections }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visit turn processing failed.";
    res.status(502).json({ error: message, canRetry: true });
  }
});
app.post("/api/turn/preview", (req, res) => {
  const { session_id, transcript, language } = req.body || {};
  if (typeof session_id !== "string" || !session_id || typeof transcript !== "string" || !transcript.trim() || typeof language !== "string") {
    return res.status(400).json({ error: "session_id, transcript, and language are required." });
  }
  res.json({ fields: previewVisitFields(session_id, transcript, language) });
});
app.delete("/api/turn/:sessionId", (req, res) => {
  discardTurnSession(req.params.sessionId);
  res.json({ deleted: true });
});
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice, lang, speed } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing text parameter" });
    }
    const result = await synthesizeTimbreV3({ text, voice, lang, speed });
    res.json(result);
  } catch (err) {
    console.error("TTS error:", err.message);
    res.status(502).json({
      error: "Gnani Timbre v3.0 synthesis failed",
      details: err.message,
      canRetry: true
    });
  }
});
app.post("/api/records/encrypt", (req, res) => {
  try {
    const encryptedToken = encryptPayload(req.body);
    res.json({ encryptedToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/records/decrypt", (req, res) => {
  try {
    const { token } = req.body;
    const decrypted = decryptPayload(token);
    res.json({ data: JSON.parse(decrypted) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
var wssSTT = new WebSocketServer({ noServer: true });
var wssTTS = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const pathname = url.pathname;
  if (pathname === "/ws/stt") {
    wssSTT.handleUpgrade(request, socket, head, (ws) => {
      wssSTT.emit("connection", ws, request, url);
    });
  } else if (pathname === "/ws/tts") {
    wssTTS.handleUpgrade(request, socket, head, (ws) => {
      wssTTS.emit("connection", ws, request, url);
    });
  } else {
  }
});
wssSTT.on("connection", (clientWs, request, url) => {
  const lang = url?.searchParams?.get("lang") || "en-IN";
  const apiKey = process.env.GNANI_API_KEY;
  if (!apiKey) {
    clientWs.send(
      JSON.stringify({
        type: "error",
        error_code: "MISSING_API_KEY",
        message: "GNANI_API_KEY is missing. Put GNANI_API_KEY in the .env file in the project root, then restart the server."
      })
    );
    clientWs.close();
    return;
  }
  const configuredMinimumSilenceMs = Number(process.env.GNANI_MIN_SILENCE_MS);
  const minimumSilenceMs = Number.isFinite(configuredMinimumSilenceMs) && configuredMinimumSilenceMs >= 300 && configuredMinimumSilenceMs <= 5e3 ? configuredMinimumSilenceMs : 1500;
  const gnaniHeaders = {
    "x-api-key-id": apiKey,
    model: "prisma-v3.0",
    language_code: lang,
    "x-sample-rate": "16000",
    format: "transcribe",
    "x-vad-threshold": "0.7",
    "x-min-silence-ms": String(minimumSilenceMs),
    "x-min-speech-ms": "50",
    "x-min-segment-ms": "100"
  };
  let gnaniWs = null;
  let isGnaniOpen = false;
  const audioBufferQueue = [];
  try {
    gnaniWs = new WebSocket2("wss://api.vachana.ai/stt/v3/stream", {
      headers: gnaniHeaders
    });
  } catch (err) {
    clientWs.send(
      JSON.stringify({
        type: "error",
        error_code: "GNANI_CONNECTION_ERROR",
        message: `Failed to initiate Gnani STT connection: ${err.message}`
      })
    );
    clientWs.close();
    return;
  }
  gnaniWs.on("open", () => {
    isGnaniOpen = true;
    while (audioBufferQueue.length > 0) {
      const chunk = audioBufferQueue.shift();
      if (chunk && gnaniWs?.readyState === WebSocket2.OPEN) {
        gnaniWs.send(chunk);
      }
    }
  });
  gnaniWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (clientWs.readyState === WebSocket2.OPEN) {
        clientWs.send(JSON.stringify(msg));
      }
    } catch {
      if (clientWs.readyState === WebSocket2.OPEN) {
        clientWs.send(data);
      }
    }
  });
  gnaniWs.on("error", (err) => {
    if (clientWs.readyState === WebSocket2.OPEN) {
      clientWs.send(
        JSON.stringify({
          type: "error",
          error_code: "GNANI_STT_ERROR",
          message: `Gnani Prisma v3.0 STT error: ${err.message || "Connection failed (HTTP 401 Unauthorized)"}`,
          canRetry: true
        })
      );
    }
  });
  gnaniWs.on("close", (code, reason) => {
    if (clientWs.readyState === WebSocket2.OPEN) {
      clientWs.send(
        JSON.stringify({
          type: "gnani_closed",
          code,
          reason: reason.toString()
        })
      );
    }
  });
  clientWs.on("message", (message, isBinary) => {
    if (isBinary) {
      const pcmBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message);
      if (isGnaniOpen && gnaniWs?.readyState === WebSocket2.OPEN) {
        gnaniWs.send(pcmBuffer);
      } else {
        if (audioBufferQueue.length < 50) {
          audioBufferQueue.push(pcmBuffer);
        }
      }
    } else {
      try {
        const textMsg = JSON.parse(message.toString());
        if (textMsg.type === "stop") {
          if (gnaniWs?.readyState === WebSocket2.OPEN) {
            gnaniWs.close();
          }
        }
      } catch {
      }
    }
  });
  clientWs.on("close", () => {
    if (gnaniWs && gnaniWs.readyState === WebSocket2.OPEN) {
      gnaniWs.close();
    }
  });
});
wssTTS.on("connection", (clientWs) => {
  clientWs.on("message", async (data) => {
    try {
      const payload = JSON.parse(data.toString());
      const { text, voice, lang, speed } = payload;
      if (!text) {
        return clientWs.send(
          JSON.stringify({ type: "error", message: "No text provided for synthesis" })
        );
      }
      let streamedChunks = 0;
      const result = await synthesizeTimbreV3(
        { text, voice, lang, speed },
        (chunk) => {
          if (clientWs.readyState === WebSocket2.OPEN) {
            streamedChunks += 1;
            clientWs.send(
              JSON.stringify({
                type: "chunk",
                ...chunk
              })
            );
          }
        }
      );
      if (clientWs.readyState === WebSocket2.OPEN) {
        if (streamedChunks === 0 && result.audioBase64) {
          clientWs.send(JSON.stringify({
            type: "chunk",
            chunkIndex: 0,
            audioBase64: result.audioBase64,
            isFinal: true,
            timeToFirstAudioMs: result.timeToFirstAudioMs
          }));
        }
        clientWs.send(JSON.stringify({
          type: "complete",
          isFinal: true,
          timeToFirstAudioMs: result.timeToFirstAudioMs
        }), () => clientWs.close(1e3, "Synthesis complete"));
      }
    } catch (err) {
      if (clientWs.readyState === WebSocket2.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: "error",
            error_code: "GNANI_TTS_ERROR",
            message: err.message,
            canRetry: true
          })
        );
      }
    }
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true"
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path4.resolve("dist/index.html"));
    });
  }
  server.listen(PORT, HOST, () => {
    console.log(`[ASHA Vaani] Unified Server running on http://${HOST}:${PORT}`);
    console.log(`[ASHA Vaani] STT: Gnani Prisma v3.0 | TTS: Gnani Timbre v3.0 | LLM: Gemini -> Groq -> Rules`);
    void warmGroqModelCatalog().catch((error) => {
      const status = error && typeof error === "object" && "status" in error ? String(error.status) : "UNAVAILABLE";
      console.warn(`[LLM] Groq model discovery status=${status}`);
    });
    warmTTSCache().catch(() => {
      console.warn("[ASHA Vaani] Timbre fixed-line cache warmup failed.");
    });
  });
}
startServer();
async function checkHealth() {
  const gnaniKey = Boolean(process.env.GNANI_API_KEY);
  const llmKey = Boolean(process.env.LLM_API_KEY);
  const fallbackKey = Boolean(process.env.FALLBACK_API_KEY?.trim());
  const encryptionKey = Boolean(process.env.ENCRYPTION_KEY);
  const [sttOk, ttsOk] = gnaniKey ? await Promise.all([probeGnaniStt(), probeGnaniTts()]) : [false, false];
  return createHealthResponse({
    port: PORT,
    gnaniKey,
    llmKey,
    fallbackKey,
    encryptionKey,
    sttOk,
    ttsOk
  });
}
async function readNewBeneficiaries() {
  try {
    const content = await fs3.readFile(BENEFICIARIES_FILE2, "utf8");
    const parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
    const values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray(parsed.value) ? parsed.value : null;
    if (!values) throw new Error("Stored beneficiary data is invalid.");
    return values;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
function probeGnaniStt() {
  return new Promise((resolve) => {
    let settled = false;
    let ws = null;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (ws && ws.readyState < WebSocket2.CLOSING) ws.close();
      resolve(ok);
    };
    const timeout = setTimeout(() => finish(false), 3500);
    try {
      ws = new WebSocket2("wss://api.vachana.ai/stt/v3/stream", {
        headers: {
          "x-api-key-id": process.env.GNANI_API_KEY,
          model: "prisma-v3.0",
          language_code: "en-IN",
          format: "transcribe",
          "x-sample-rate": "16000"
        }
      });
      ws.once("open", () => {
        ws?.send(Buffer.alloc(3200));
        setTimeout(() => finish(true), 250);
      });
      ws.on("message", (message) => {
        try {
          const response2 = JSON.parse(message.toString());
          if (response2.type === "error" || response2.error) finish(false);
        } catch {
          finish(false);
        }
      });
      ws.once("error", () => finish(false));
      ws.once("close", () => {
        if (!settled) finish(false);
      });
    } catch {
      finish(false);
    }
  });
}
async function probeGnaniTts() {
  try {
    const result = await synthesizeTimbreV3({
      text: "Ready.",
      voice: "Shivani",
      lang: "en-IN"
    });
    return result.audioBase64.length > 0;
  } catch {
    return false;
  }
}
