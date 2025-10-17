# backend/app/routers/local_auth.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
import os
import time
import jwt  # PyJWT

from app.user_store import upsert_user

router = APIRouter(prefix="/auth", tags=["auth"])

APP_JWT_SECRET = os.getenv("APP_JWT_SECRET", "dev-secret")
ALGO = "HS256"


def _issue_app_jwt(email: str, *, id: Optional[str] = None, name: Optional[str] = None, role: Optional[str] = None) -> str:
    payload = {"email": email, "iat": int(time.time())}
    if id:
        payload["id"] = id
    if name:
        payload["name"] = name
    if role:
        payload["role"] = role
    return jwt.encode(payload, APP_JWT_SECRET, algorithm=ALGO)


# -------- Manual signup --------
class SignupIn(BaseModel):
    name: Optional[str] = None
    email: EmailStr
    password: str
    role: Optional[str] = None  # optional “preferred role” field from UI


@router.post("/signup")
def signup_local(p: SignupIn):
    """
    Create local user and include them in users.json.
    NOTE: Password is not persisted in this demo backend (frontend keeps it for local-only auth),
    but we still register the user centrally so Admin/analytics can see them.
    """
    rec = upsert_user(
        email=p.email,
        id=p.email,  # simple stable id
        name=p.name or p.email.split("@")[0],
        role=None,   # don’t set role automatically; onboarding or admin can set later
        provider="local",
    )
    token = _issue_app_jwt(p.email, id=rec.get("id"), name=rec.get("name"), role=rec.get("role"))
    return {"id": rec.get("id"), "appJwt": token, "role": rec.get("role")}


# -------- Manual login --------
class LoginIn(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
def login_local(p: LoginIn):
    """
    Accept login and ensure the user exists in users.json.
    We do not check a stored password in this demo backend.
    """
    rec = upsert_user(
        email=p.email,
        id=p.email,
        # don’t override name/provider/role if already present
        name=None,
        role=None,
        provider="local",
    )
    token = _issue_app_jwt(p.email, id=rec.get("id"), name=rec.get("name"), role=rec.get("role"))
    return {"id": rec.get("id"), "appJwt": token, "role": rec.get("role")}
