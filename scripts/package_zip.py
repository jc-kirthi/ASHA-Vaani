#!/usr/bin/env python3
"""
ASHA Vaani Packaging Script.
Builds /mnt/agents/output/asha-vaani.zip using Python standard library zipfile.
Strictly excludes:
- .env
- any API keys or secrets
- __pycache__ and *.pyc
- node_modules
- .venv
- *.db SQLite databases
- data/cache/* contents
- *.log files
- raw audio (*.wav, *.pcm)
"""

import os
import zipfile

OUTPUT_DIR = "/mnt/agents/output"
ZIP_PATH = os.path.join(OUTPUT_DIR, "asha-vaani.zip")
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

EXCLUDE_DIRS = {"__pycache__", "node_modules", ".venv", ".git"}
EXCLUDE_EXTS = {".pyc", ".pyo", ".pyd", ".db", ".log", ".wav", ".pcm", ".raw"}
EXCLUDE_FILES = {".env"}

def should_exclude(rel_path: str) -> bool:
    parts = rel_path.replace("\\", "/").split("/")
    for p in parts:
        if p in EXCLUDE_DIRS:
            return True
        if p == ".env":
            return True
    if rel_path.startswith("data/cache/") and len(parts) > 2:
        return True
    base = os.path.basename(rel_path)
    if base in EXCLUDE_FILES:
        return True
    ext = os.path.splitext(base)[1].lower()
    if ext in EXCLUDE_EXTS:
        return True
    return False

def package_project():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    if os.path.exists(ZIP_PATH):
        os.remove(ZIP_PATH)

    included_files = []

    # Files and folders to include
    include_roots = [
        "app", "data", "static", "scripts", "tests", "docs", "src",
        "README.md", "run.sh", "Makefile", "requirements.txt",
        ".env.example", ".gitignore", "package.json", "index.html",
        "metadata.json", "vite.config.ts", "tsconfig.json"
    ]

    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in include_roots:
            full_path = os.path.join(ROOT_DIR, item)
            if not os.path.exists(full_path):
                continue

            if os.path.isfile(full_path):
                rel_path = item
                if not should_exclude(rel_path):
                    zf.write(full_path, rel_path)
                    included_files.append(rel_path)
            elif os.path.isdir(full_path):
                for dirpath, dirnames, filenames in os.walk(full_path):
                    # Filter out excluded directory names in-place
                    dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
                    for fname in filenames:
                        file_full = os.path.join(dirpath, fname)
                        rel_path = os.path.relpath(file_full, ROOT_DIR).replace("\\", "/")
                        if not should_exclude(rel_path):
                            zf.write(file_full, rel_path)
                            included_files.append(rel_path)

    size_kb = os.path.getsize(ZIP_PATH) / 1024
    print(f"[OK] Successfully packaged {len(included_files)} files into {ZIP_PATH} ({size_kb:.1f} KB)")
    return ZIP_PATH, included_files

if __name__ == "__main__":
    package_project()
