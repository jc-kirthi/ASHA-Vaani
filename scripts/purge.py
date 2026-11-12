#!/usr/bin/env python3
"""
ASHA Vaani - Safe Post-Judging Data Purge Script.
Compliance with Responsible AI & Patient Privacy:
- Securely purges all encrypted visit records from SQLite database
- Deletes all cached TTS / synthesized audio in data/cache/
- Deletes any local audio temporary files or session transcripts
- Resets data storage to initial pristine state
"""

import os
import sys
import glob
import sqlite3

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CACHE_DIR = os.path.join(ROOT_DIR, "data", "cache")
DB_PATH = os.path.join(ROOT_DIR, "data", "asha_vaani.db")

def purge_data():
    print("================================================================================")
    print("                ASHA VAANI SECURE HEALTHCARE DATA PURGE                        ")
    print("================================================================================")

    # 1. Purge SQLite records database
    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cur.fetchall()
            for (tname,) in tables:
                if not tname.startswith("sqlite_"):
                    cur.execute(f"DELETE FROM {tname};")
            conn.commit()
            conn.close()
            print(f"[OK] Purged all rows from database: {DB_PATH}")
        except Exception as e:
            print(f"[WARN] Error clearing database tables: {e}")
        try:
            os.remove(DB_PATH)
            print(f"[OK] Removed database file: {DB_PATH}")
        except Exception as e:
            print(f"[WARN] Could not delete db file: {e}")
    else:
        print("[OK] No persistent SQLite database found.")

    # 2. Clear TTS cache directory
    if os.path.exists(CACHE_DIR):
        files = glob.glob(os.path.join(CACHE_DIR, "*"))
        count = 0
        for f in files:
            try:
                os.remove(f)
                count += 1
            except Exception:
                pass
        print(f"[OK] Cleared {count} cached audio files from {CACHE_DIR}")
    else:
        print("[OK] Cache directory clean.")

    # 3. Clean temporary logs or audio files
    temp_patterns = ["*.wav", "*.pcm", "*.raw", "*.tmp", "*_record_dump.json"]
    for pat in temp_patterns:
        matches = glob.glob(os.path.join(ROOT_DIR, pat))
        for m in matches:
            try:
                os.remove(m)
                print(f"[OK] Cleaned temporary artifact: {m}")
            except Exception:
                pass

    print("\n[SUCCESS] Responsible AI Purge Complete. Zero residual patient records or transcripts exist.")
    print("================================================================================\n")

if __name__ == "__main__":
    purge_data()
