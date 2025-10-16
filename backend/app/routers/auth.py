# backend/app/routers/auth.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from typing import Optional, Dict
from pathlib import Path
import json, time, os, jwt  # PyJWT

from app.deps import get_current_user, CurrentUser

router = APIRouter(prefix="/auth", tags=["auth"])

# ---- Shared users store (file) ----
USERS_DB = Path(__file__).resolve().parent.parent / "data" / "users.json"
USERS_DB.parent.mkdir(parents=True, exist_ok=True)
if not USERS_DB.exists():
    USERS_DB.write_text("{}", encoding="utf-8")

def _load_users() -> Dict[str, dict]:
    try:
        return json.loads(USERS_DB.read_text(encoding="utf-8"))
    except Exception:
        return {}

def _save_users(d: Dict[str, dict]):
    USERS_DB.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")

# ---- JWT minting (no import from main.py to avoid circulars) ----
APP_JWT_SECRET = os.getenv("APP_JWT_SECRET", "dev-secret")
ALGO = "HS256"

def _issue_app_jwt(email: str, *, id: Optional[str] = None, name: Optional[str] = None, role: Optional[str] = None) -> str:
    payload = {
        "email": email,
        "iat": int(time.time()),
    }
    if id:   payload["id"] = id
    if name: payload["name"] = name
    if role: payload["role"] = role
    return jwt.encode(payload, APP_JWT_SECRET, algorithm=ALGO)

# -------- /auth/oauth/google --------
class GoogleUpsertIn(BaseModel):
    email: str
    name: Optional[str] = None
    google_sub: Optional[str] = None

@router.post("/oauth/google")
def oauth_google_upsert(p: GoogleUpsertIn):
    users = _load_users()
    u = users.get(p.email) or {
        "id": p.google_sub or p.email,
        "email": p.email,
        "name": p.name or p.email.split("@")[0],
        "role": None,
        "provider": "google",
        "createdAt": int(time.time()),
    }
    # keep name fresh if provided
    if p.name:
        u["name"] = p.name
    users[p.email] = u
    _save_users(users)

    token = _issue_app_jwt(
        p.email,
        id=u["id"],
        name=u.get("name"),
        role=u.get("role"),
    )
    return {"id": u["id"], "appJwt": token, "role": u.get("role")}

# -------- /auth/role --------
class RoleIn(BaseModel):
    role: str

ALLOWED_ROLES = {"Student", "Trainer", "Admin"}

@router.post("/role")
def set_role(body: RoleIn, user: CurrentUser = Depends(get_current_user)):
    role = (body.role or "").strip()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    users = _load_users()
    # users keyed by email in this store
    rec = users.get(user.email) or {
        "id": user.id,
        "email": user.email,
        "name": user.name or user.email.split("@")[0],
        "role": None,
        "provider": "local",
        "createdAt": int(time.time()),
    }
    rec["role"] = role
    users[user.email] = rec
    _save_users(users)

    return {"ok": True, "role": role}
