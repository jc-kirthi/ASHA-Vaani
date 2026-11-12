#!/usr/bin/env python3
"""Remove synthetic beneficiary data written by the local ASHA Vaani backend."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_BENEFICIARIES = PROJECT_ROOT / "data" / "beneficiaries.json"


def purge_data() -> None:
    if SYNTHETIC_BENEFICIARIES.is_file():
        SYNTHETIC_BENEFICIARIES.unlink()
        print("Removed synthetic beneficiaries.")
    else:
        print("No persisted synthetic beneficiaries found.")
    print("Use Settings > Purge All Register Data & Transcripts to clear browser records.")


if __name__ == "__main__":
    purge_data()
