# backend/app/routers/auth.py
from __future__ import annotations

import os
import time
import uuid
from typing import Optional, Dict

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr
import jwt  # PyJWT

router = APIRouter(prefix="/auth", tags=["auth"])

# Read secret from env (main.py already loads .env via pydantic-settings)
SECRET = os.getenv("APP_JWT_SECRET", "dev-secret")
ISSUER = "intervue-ai"
AUDIENCE = "intervue-ai-web"
TTL_SECONDS = int(os.getenv("APP_JWT_TTL_SECONDS", "604800"))  # 7 days

# Dev-only in-memory store (replace with DB later)
USERS: Dict[str, dict] = {}  # key: email -> {id, email, name, google_sub, created_at}

class OAuthGoogleIn(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    google_sub: Optional[str] = None

@router.post("/oauth/google")
def oauth_google(body: OAuthGoogleIn):
    """
    Upsert user by email and return an app JWT so the Next.js proxy can send
    Authorization: Bearer <appJwt> to protected backend routes.
    """
    email = body.email.lower()
    u = USERS.get(email)
    if not u:
        u = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": body.name or email.split("@")[0],
            "google_sub": body.google_sub,
            "created_at": int(time.time()),
        }
        USERS[email] = u

    now = int(time.time())
    payload = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": now,
        "nbf": now,
        "exp": now + TTL_SECONDS,
        "sub": u["id"],        # subject = internal user id
        "email": u["email"],   # include for convenience
        "name": u["name"],
    }
    app_jwt = jwt.encode(payload, SECRET, algorithm="HS256")
    return {"id": u["id"], "appJwt": app_jwt}
