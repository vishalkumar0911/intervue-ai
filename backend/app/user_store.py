# backend/app/user_store.py
from __future__ import annotations
from pathlib import Path
from typing import Dict, Optional

import json
import time

# Canonical users store: backend/app/data/users.json
USERS_DB = Path(__file__).resolve().parent / "data" / "users.json"
USERS_DB.parent.mkdir(parents=True, exist_ok=True)
if not USERS_DB.exists():
    USERS_DB.write_text("{}", encoding="utf-8")


def load_users() -> Dict[str, dict]:
    try:
        return json.loads(USERS_DB.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_users(d: Dict[str, dict]) -> None:
    USERS_DB.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def upsert_user(
    *,
    email: str,
    id: Optional[str] = None,
    name: Optional[str] = None,
    role: Optional[str] = None,       # None means “don’t change existing role”
    provider: Optional[str] = None,   # "google" | "local" | etc.
) -> dict:
    """
    Create or update a user in users.json.
    Only non-None fields overwrite existing values.
    """
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("email is required")

    users = load_users()
    rec = users.get(email) or {
        "id": id or email,
        "email": email,
        "name": name or email.split("@")[0],
        "role": None,
        "provider": provider or "local",
        "createdAt": int(time.time()),
    }

    if id is not None:
        rec["id"] = id
    if name is not None:
        rec["name"] = name
    if role is not None:
        rec["role"] = role
    if provider is not None:
        rec["provider"] = provider

    users[email] = rec
    save_users(users)
    return rec
