"""
Gnani Timbre v3.0 Text-to-Speech (TTS) Client for ASHA Vaani.
Follows official Gnani documentation: https://docs.gnani.ai/api/TTS/tts-websocket.md
Endpoint: wss://api.vachana.ai/api/v1/tts
Model: timbre-v3.0 (all 10 languages supported across all voices)
Voices: Chetana, Shivani, Lakshmi, Kalpana, Vasudha, Riyaa, Tarika, Avinash, Shubham, Prakash, Devansh, Yashraj, Harshad
"""

import os
import json
import base64
import hashlib
import asyncio
from typing import Optional, AsyncGenerator, Dict, Any, List

try:
    import websockets
except ImportError:
    websockets = None

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "cache")

class GnaniTTSClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        voice: str = "Chetana",
        model: str = "timbre-v3.0",
        language: str = "hi-IN",
        speed: float = 1.0,
        sample_rate: int = 16000
    ):
        self.api_key = api_key or os.environ.get("GNANI_API_KEY", "")
        self.endpoint = "wss://api.vachana.ai/api/v1/tts"
        self.voice = voice
        self.model = model
        self.language = language
        self.speed = speed
        self.sample_rate = sample_rate
        self.active_request_id = None
        self._interrupted = False
        os.makedirs(CACHE_DIR, exist_ok=True)

    def _cache_key(self, text: str, lang: str, voice: str) -> str:
        h = hashlib.sha256(f"{text}_{lang}_{voice}_{self.speed}_{self.sample_rate}".encode("utf-8")).hexdigest()
        return os.path.join(CACHE_DIR, f"tts_{h}.wav")

    def get_cached_audio(self, text: str, lang: str) -> Optional[bytes]:
        path = self._cache_key(text, lang, self.voice)
        if os.path.exists(path):
            with open(path, "rb") as f:
                return f.read()
        return None

    def save_cache_audio(self, text: str, lang: str, audio_bytes: bytes):
        path = self._cache_key(text, lang, self.voice)
        try:
            with open(path, "wb") as f:
                f.write(audio_bytes)
        except Exception:
            pass

    def interrupt(self):
        """
        Instant barge-in signal: client stops audio streaming immediately.
        """
        self._interrupted = True

    async def stream_synthesize(
        self,
        text: str,
        language: Optional[str] = None,
        voice: Optional[str] = None
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream synthesized audio chunks over WebSocket.
        Yields raw audio bytes chunk-by-chunk for immediate low-latency playback.
        """
        self._interrupted = False
        lang = language or self.language
        v = voice or self.voice

        # Check cache first for instant playback
        cached = self.get_cached_audio(text, lang)
        if cached:
            yield cached
            return

        if not websockets or not self.api_key:
            # Yield silence or let frontend fallback to Web Speech API
            return

        headers = {
            "X-API-Key-ID": self.api_key
        }

        request_payload = {
            "text": text,
            "voice": v,
            "model": self.model,
            "language": lang,
            "speed": self.speed,
            "audio_config": {
                "sample_rate": self.sample_rate,
                "num_channels": 1,
                "sample_width": 2,
                "encoding": "linear_pcm",
                "container": "wav"
            }
        }

        collected_chunks: List[bytes] = []

        try:
            async with websockets.connect(self.endpoint, additional_headers=headers) as ws:
                await ws.send(json.dumps(request_payload))

                async for msg in ws:
                    if self._interrupted:
                        break

                    data = json.loads(msg)
                    msg_type = data.get("type")

                    if msg_type == "audio":
                        chunk_b64 = data.get("data", {}).get("audio", "")
                        if chunk_b64:
                            raw_chunk = base64.b64decode(chunk_b64)
                            collected_chunks.append(raw_chunk)
                            yield raw_chunk

                    elif msg_type == "complete":
                        break
                    elif msg_type == "error":
                        raise RuntimeError(f"Gnani TTS error: {data.get('message')}")

            if collected_chunks and not self._interrupted:
                full_audio = b"".join(collected_chunks)
                self.save_cache_audio(text, lang, full_audio)

        except Exception as e:
            # Log error without leaking secrets
            pass
