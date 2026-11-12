#!/usr/bin/env python3
"""
ASHA Vaani - Synthetic Noisy Audio Generator and Offline Pipeline Runner.
Generates 16 kHz 16-bit mono PCM WAV audio mixed with household/street noise at specified SNRs.
Includes a text-only simulation mode so tests can execute reliably in environments without microphone hardware.
"""

import os
import sys
import math
import wave
import struct
import random
import argparse

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.danger import DangerSignEngine
from app.numbers import NumberNormalizer
from app.extractor import VisitExtractor

def generate_sine_wave(freq: float, duration_s: float, sample_rate: int = 16000, amplitude: float = 0.5) -> list:
    total_samples = int(duration_s * sample_rate)
    return [amplitude * math.sin(2 * math.pi * freq * (i / sample_rate)) for i in range(total_samples)]

def generate_noise(duration_s: float, sample_rate: int = 16000, noise_type: str = "household") -> list:
    total_samples = int(duration_s * sample_rate)
    samples = []
    # Household ambient rumble + fan + kitchen clatter
    for i in range(total_samples):
        # Pink/brown noise approximation (low frequency hum ~ 120Hz)
        hum = 0.3 * math.sin(2 * math.pi * 120 * (i / sample_rate))
        # White background hiss
        white = (random.random() * 2.0 - 1.0) * 0.1
        # Random burst clatter (door/vessel)
        clatter = 0.5 * (random.random() * 2.0 - 1.0) if random.random() < 0.002 else 0.0
        samples.append(hum + white + clatter)
    return samples

def mix_audio(clean: list, noise: list, target_snr_db: float = 10.0) -> list:
    # Calculate RMS
    clean_rms = math.sqrt(sum(s * s for s in clean) / len(clean)) if clean else 0.001
    noise_rms = math.sqrt(sum(s * s for s in noise) / len(noise)) if noise else 0.001

    desired_noise_rms = clean_rms / (10 ** (target_snr_db / 20.0))
    scale = desired_noise_rms / max(noise_rms, 1e-6)

    mixed = []
    for c, n in zip(clean, noise):
        val = c + (n * scale)
        val = max(-1.0, min(1.0, val))  # clamp
        mixed.append(val)
    return mixed

def save_wav(samples: list, output_path: str, sample_rate: int = 16000):
    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        int_samples = [int(s * 32767.0) for s in samples]
        raw_bytes = struct.pack(f"<{len(int_samples)}h", *int_samples)
        wf.writeframes(raw_bytes)
    print(f"[OK] Generated noisy audio: {output_path} ({len(samples)/sample_rate:.1f}s, {sample_rate}Hz, 16-bit mono)")

def run_text_simulation(text: str, language: str = "hi"):
    print(f"\n[TEXT-ONLY SIMULATION] Language: {language}")
    print(f"Utterance: \"{text}\"")
    extractor = VisitExtractor()
    engine = DangerSignEngine()
    normalizer = NumberNormalizer()

    ext = extractor.extract_heuristic(text, language)
    danger_res = engine.evaluate(text, language=language, llm_symptoms=ext.get("symptoms", []))
    weight_res = normalizer.parse_weight(text, category="newborn", language=language)

    print("\n--- Pipeline Results ---")
    print(f"Beneficiary:   {ext.get('beneficiary_name') or 'Not matched'}")
    print(f"Visit Type:    {ext.get('visit_type')}")
    print(f"Weight:        {weight_res.value} kg (State: {weight_res.state})")
    print(f"Danger Status: {danger_res.decision}")
    if danger_res.decision == "FLAG":
        print(f"Flagged Signs: {[s['name'] for s in danger_res.flagged_signs]}")
        print(f"Referral Slip: {danger_res.referral_slip}")
    elif danger_res.decision == "ASK":
        print(f"Clarifications: {danger_res.clarification_questions}")
    print("------------------------\n")

def main():
    parser = argparse.ArgumentParser(description="Synthetic noisy audio generator & text simulation")
    parser.add_argument("--mode", choices=["audio", "text"], default="audio", help="Generate audio file or run text simulation")
    parser.add_argument("--snr", type=float, default=10.0, help="Target Signal-to-Noise Ratio in dB (e.g. 5, 10, 20)")
    parser.add_argument("--output", type=str, default="data/sample_noisy_visit.wav", help="Output path for WAV file")
    parser.add_argument("--text", type=str, default="Sita Devi ka ANC visit hai, BP 120/80 aur weight 55 kilo hai, bleeding nahi hai")
    parser.add_argument("--lang", type=str, default="hi")
    args = parser.parse_args()

    if args.mode == "text":
        run_text_simulation(args.text, args.lang)
    else:
        # Generate 3 seconds of synthetic speech-like tone burst + ambient noise
        clean = generate_sine_wave(freq=220.0, duration_s=3.0)
        noise = generate_noise(duration_s=3.0, noise_type="household")
        mixed = mix_audio(clean, noise, target_snr_db=args.snr)
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        save_wav(mixed, args.output)

if __name__ == "__main__":
    main()
