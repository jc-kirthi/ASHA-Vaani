"""
Gnani Prisma v3.0 Streaming Speech-to-Text (STT) Client for ASHA Vaani.
Follows official Gnani documentation: https://docs.gnani.ai/api/STT/stt-websocket.md
Endpoint: wss://api.vachana.ai/stt/v3/stream
Model: prisma-v3.0
Supported Languages: hi-IN, kn-IN, en-IN, bn-IN, mr-IN, gu-IN, pa-IN, te-IN, ta-IN, ml-IN, indic-auto.
"""

import os
import json
import asyncio
import time
from typing import Optional, AsyncGenerator, Dict, Any, Callable

# Check if websockets is available, else provide fallback
try:
    import websockets
except ImportError:
    websockets = None

class GnaniSTTClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        language_code: str = "hi-IN",
        sample_rate: int = 16000,
        model: str = "prisma-v3.0",
        vad_threshold: float = 0.7,
        min_silence_ms: int = 500,
        min_speech_ms: int = 100,
        min_segment_ms: int = 120
    ):
        self.api_key = api_key or os.environ.get("GNANI_API_KEY", "")
        self.endpoint = "wss://api.vachana.ai/stt/v3/stream"
        self.language_code = language_code
        self.sample_rate = sample_rate
        self.model = model
        self.vad_threshold = vad_threshold
        self.min_silence_ms = min_silence_ms
        self.min_speech_ms = min_speech_ms
        self.min_segment_ms = min_segment_ms
        self.ws = None
        self.connected_config = {}
        self.latencies = []

    def get_upgrade_headers(self) -> Dict[str, str]:
        """
        Headers strictly per Gnani documentation:
        x-api-key-id, language_code, model, format, x-sample-rate, and VAD tuning.
        """
        headers = {
            "x-api-key-id": self.api_key,
            "language_code": self.language_code,
            "model": self.model,
            "format": "verbatim",
            "x-sample-rate": str(self.sample_rate),
            "x-vad-threshold": str(self.vad_threshold),
            "x-min-silence-ms": str(self.min_silence_ms),
            "x-min-speech-ms": str(self.min_speech_ms),
            "x-min-segment-ms": str(self.min_segment_ms)
        }
        return headers

    async def connect(self):
        """
        Establish WebSocket connection to Gnani STT.
        """
        if not websockets:
            raise RuntimeError("Python 'websockets' package is required for live Gnani connection.")
        if not self.api_key:
            raise ValueError("GNANI_API_KEY environment variable is not set.")

        headers = self.get_upgrade_headers()
        # websockets connect with upgrade headers
        self.ws = await websockets.connect(
            self.endpoint,
            additional_headers=headers
        )

        # Receive initial 'connected' frame
        msg = await self.ws.recv()
        data = json.loads(msg)
        if data.get("type") == "connected":
            self.connected_config = data.get("config", {})
            return data
        elif data.get("type") == "error":
            raise RuntimeError(f"Gnani STT connection error: {data.get('message')}")
        return data

    async def send_pcm_chunk(self, chunk: bytes):
        """
        Send raw PCM binary frame.
        Per Gnani docs: 1,024 bytes (512 samples at 16kHz) at 32ms cadence.
        """
        if self.ws and not self.ws.closed:
            await self.ws.send(chunk)

    async def receive_events(self) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Asynchronously yield server messages:
        - processing: speech boundary detected
        - transcript: final transcribed segment with latency and text
        - error: recoverable or fatal error
        """
        if not self.ws:
            return

        async for msg in self.ws:
            if isinstance(msg, str):
                try:
                    payload = json.loads(msg)
                    msg_type = payload.get("type")
                    if msg_type == "transcript":
                        lat = payload.get("latency")
                        if lat is not None:
                            self.latencies.append(lat)
                    yield payload
                except json.JSONDecodeError:
                    continue

    async def close(self):
        if self.ws and not self.ws.closed:
            await self.ws.close()
            self.ws = None
