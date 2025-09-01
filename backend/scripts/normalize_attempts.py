# backend/scripts/normalize_attempts.py
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
import json
import shutil

ATTEMPTS = Path(__file__).resolve().parents[1] / "data" / "attempts.jsonl"

def parse_any_datetime(val: str) -> datetime:
    """
    Accepts:
      - '2025-08-29 05:20:23.570620'
      - '2025-08-29T05:20:23.570620'
      - '2025-08-27 22:41:39.197000+00:00'
      - '2025-08-29T05:20:23Z'
    Returns timezone-aware UTC datetime.
    """
    s = str(val).strip().replace(" ", "T")
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        # very defensive fallback: keep only seconds
        dt = datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt

def main():
    if not ATTEMPTS.exists():
        print(f"[skip] file not found: {ATTEMPTS}")
        return

    backup = ATTEMPTS.with_suffix(".jsonl.bak")
    shutil.copy2(ATTEMPTS, backup)
    tmp = ATTEMPTS.with_suffix(".jsonl.tmp")

    total = 0
    changed = 0
    errors = 0

    with ATTEMPTS.open("r", encoding="utf-8") as fin, tmp.open("w", encoding="utf-8") as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            total += 1
            try:
                rec = json.loads(line)
                old = rec.get("date", "")
                dt = parse_any_datetime(old)
                new = dt.isoformat().replace("+00:00", "Z")
                if old != new:
                    changed += 1
                rec["date"] = new
                fout.write(json.dumps(rec, ensure_ascii=False) + "\n")
            except Exception as e:
                errors += 1
                # keep original line if unparsable
                fout.write(line + "\n")

    tmp.replace(ATTEMPTS)
    print(f"[done] normalized={changed} / total={total}, errors={errors}, backup={backup}")

if __name__ == "__main__":
    main()
