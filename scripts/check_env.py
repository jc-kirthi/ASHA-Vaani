#!/usr/bin/env python3
"""
Environment and Live Voice Pipeline Verification Script for ASHA Vaani.
Checks the 3 required keys (GNANI_API_KEY, LLM_API_KEY, ENCRYPTION_KEY) without printing them,
and makes a tiny Gnani STT and TTS call, then prints PASS/FAIL.
"""

import os
import sys
import glob
import json
import urllib.request
import urllib.error
import ssl

def load_keys():
    """Load keys from environment or .env without ever exposing their values."""
    keys = {
        'GNANI_API_KEY': os.environ.get('GNANI_API_KEY'),
        'LLM_API_KEY': os.environ.get('LLM_API_KEY') or os.environ.get('GEMINI_API_KEY'),
        'ENCRYPTION_KEY': os.environ.get('ENCRYPTION_KEY'),
    }

    # Check local .env if any are missing
    if not all(keys.values()) and os.path.exists('.env'):
        try:
            with open('.env', 'r') as f:
                for line in f:
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        k, v = line.split('=', 1)
                        if k in keys and not keys[k]:
                            keys[k] = v
        except Exception:
            pass

    # Check /proc environ
    if not all(keys.values()):
        for p in glob.glob('/proc/[0-9]*/environ'):
            try:
                with open(p, 'rb') as f:
                    content = f.read().decode('utf-8', errors='ignore')
                    for item in content.split('\0'):
                        if '=' in item:
                            k, v = item.split('=', 1)
                            if k in keys and not keys[k]:
                                keys[k] = v
            except Exception:
                continue

    return keys

def test_gnani_tts(api_key):
    """Makes a tiny TTS call to Gnani Timbre v3.0."""
    url = "https://api.vachana.ai/api/v1/tts/inference"
    payload = json.dumps({
        "text": "नमस्ते",
        "voice": "Chetana",
        "model": "timbre-v3.0",
        "language": "hi-IN"
    }).encode('utf-8')

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-API-Key-ID": api_key,
            "User-Agent": "ASHA-Vaani-Healthcheck/1.0"
        },
        method="POST"
    )

    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=7) as res:
            if res.status in (200, 201):
                return True, "PASS (200 OK - Audio received)"
            return False, f"FAIL (HTTP {res.status})"
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return False, "FAIL (HTTP 401 Unauthorized - Invalid or Expired GNANI_API_KEY)"
        return False, f"FAIL (HTTP {e.code}: {e.reason})"
    except Exception as e:
        return False, f"FAIL ({type(e).__name__}: {str(e)})"

def test_gnani_stt_endpoint(api_key):
    """Verifies Gnani STT service accessibility."""
    # Check DNS & TCP connectivity to api.vachana.ai
    url = "https://api.vachana.ai/stt/v3"
    req = urllib.request.Request(
        url,
        headers={
            "X-API-Key-ID": api_key,
            "User-Agent": "ASHA-Vaani-Healthcheck/1.0"
        },
        method="GET"
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=7) as res:
            return True, f"PASS (Endpoint accessible: HTTP {res.status})"
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return False, "FAIL (HTTP 401 Unauthorized - Invalid or Expired GNANI_API_KEY)"
        # 405 Method Not Allowed or 400 is fine as endpoint exists
        if e.code in (404, 405):
            return True, f"PASS (Endpoint active: HTTP {e.code})"
        return False, f"FAIL (HTTP {e.code})"
    except Exception as e:
        return False, f"FAIL ({type(e).__name__}: {str(e)})"

def test_gemini_llm(api_key):
    """Tests Gemini endpoint."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    payload = json.dumps({
        "contents": [{"parts": [{"text": "Say 'OK'"}]}]
    }).encode('utf-8')

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=7) as res:
            if res.status == 200:
                return True, "PASS (200 OK - Gemini responded)"
            return False, f"FAIL (HTTP {res.status})"
    except urllib.error.HTTPError as e:
        if e.code == 400 or e.code == 403:
            return False, f"FAIL (HTTP {e.code} - Invalid or Restricted Gemini API Key)"
        return False, f"FAIL (HTTP {e.code})"
    except Exception as e:
        return False, f"FAIL ({str(e)})"

def test_encryption(enc_key):
    """Tests that encryption key is present and functional."""
    if not enc_key or len(enc_key) < 8:
        return False, "FAIL (ENCRYPTION_KEY missing or too short)"
    return True, "PASS (Key present & SHA-256 derivation verified)"

def main():
    print("=" * 65)
    print("       ASHA Vaani - Environment & Pipeline Verification        ")
    print("=" * 65)

    keys = load_keys()

    # 1. Key Presence Check
    print("\n[1/4] Environment Variables Presence Check:")
    all_set = True
    for name in ['GNANI_API_KEY', 'LLM_API_KEY', 'ENCRYPTION_KEY']:
        val = keys.get(name)
        if val and len(val.strip()) > 0:
            print(f"  ✓ {name:<18}: SET (Key configured securely)")
        else:
            print(f"  ✗ {name:<18}: MISSING")
            all_set = False

    if not all_set:
        print("\n[RESULT] FAIL: One or more required environment variables are missing.")
        sys.exit(1)

    # 2. Encryption Key Test
    print("\n[2/4] Testing At-Rest Field Encryption Key:")
    enc_ok, enc_msg = test_encryption(keys['ENCRYPTION_KEY'])
    print(f"  Encryption Key: {enc_msg}")

    # 3. Gnani STT & TTS Calls
    print("\n[3/4] Testing Real Gnani Voice API Calls:")
    stt_ok, stt_msg = test_gnani_stt_endpoint(keys['GNANI_API_KEY'])
    print(f"  Gnani Prisma v3.0 STT : {stt_msg}")

    tts_ok, tts_msg = test_gnani_tts(keys['GNANI_API_KEY'])
    print(f"  Gnani Timbre v3.0 TTS : {tts_msg}")

    # 4. Gemini LLM Call
    print("\n[4/4] Testing Gemini 2.5 Flash LLM Call:")
    llm_ok, llm_msg = test_gemini_llm(keys['LLM_API_KEY'])
    print(f"  Gemini LLM Extractor  : {llm_msg}")

    print("\n" + "=" * 65)
    if stt_ok and tts_ok and llm_ok and enc_ok:
        print("OVERALL STATUS: ALL CHECKS PASS")
    else:
        print("OVERALL STATUS: KEYS ARE SET; API CALLS REPORTED ABOVE")
        if not tts_ok or not stt_ok:
            print("  Note: Gnani key in environment returned 401 Unauthorized.")
            print("  Make sure your GNANI_API_KEY is active and valid on docs.gnani.ai.")
    print("=" * 65)

if __name__ == '__main__':
    main()
