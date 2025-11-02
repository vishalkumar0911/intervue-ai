# backend/app/routers/auth.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from typing import Optional
import time
import os
import jwt  # PyJWT

from app.deps import get_current_user, CurrentUser
from app.user_store import upsert_user

router = APIRouter(prefix="/auth", tags=["auth"])

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
    rec = upsert_user(
        email=p.email,
        id=p.google_sub or p.email,
        name=p.name or p.email.split("@")[0],
        role=None,  # don’t change existing role
        provider="google",
    )
    token = _issue_app_jwt(
        p.email,
        id=rec.get("id"),
        name=rec.get("name"),
        role=rec.get("role"),
    )
    return {"id": rec.get("id"), "appJwt": token, "role": rec.get("role")}

# -------- /auth/role --------
class RoleIn(BaseModel):
    role: str

ALLOWED_ROLES = {"Student", "Trainer", "Admin"}

@router.post("/role")
def set_role(body: RoleIn, user: CurrentUser = Depends(get_current_user)):
    role = (body.role or "").strip()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    rec = upsert_user(
        email=user.email,
        id=user.id,
        name=user.name or user.email.split("@")[0],
        role=role,
        provider="local",  # keep/normalize
    )
    return {"ok": True, "role": rec.get("role")}
