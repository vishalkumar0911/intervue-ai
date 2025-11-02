# backend/app/deps.py
from __future__ import annotations
import os, json, jwt
from pathlib import Path
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

# Same secret & algo used in routers/auth.py
APP_JWT_SECRET = os.getenv("APP_JWT_SECRET", "dev-secret")
ALGO = "HS256"

# Optional bearer (so we can fall back to header if missing)
security = HTTPBearer(auto_error=False)

USERS_DB = Path(__file__).resolve().parent / "data" / "users.json"

def _load_users():
    try:
        return json.loads(USERS_DB.read_text(encoding="utf-8"))
    except Exception:
        return {}

def _role_from_store(email: str) -> Optional[str]:
    if not email:
        return None
    users = _load_users()
    u = users.get(email)
    return u.get("role") if isinstance(u, dict) else None

class CurrentUser(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    role: Optional[str] = None

def get_current_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(security)) -> CurrentUser:
    email: Optional[str] = None
    uid: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None

    # 1) Prefer Bearer token from NextAuth (appJwt)
    if creds and creds.scheme.lower() == "bearer":
        token = creds.credentials
        try:
            payload = jwt.decode(token, APP_JWT_SECRET, algorithms=[ALGO])
            uid = (payload.get("id") or payload.get("sub") or payload.get("email"))
            email = payload.get("email")
            name = payload.get("name")
            role = payload.get("role")  # may be None/stale
        except jwt.PyJWTError:
            # If Authorization provided but invalid, reject
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # 2) Dev fallback: header (useful for scripts or manual testing)
    if not email:
        email = request.headers.get("x-demo-email")

    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    # Keep role fresh: if token missing or stale, read from users.json
    store_role = _role_from_store(email)
    if store_role:
        role = store_role

    # Reasonable uid default
    uid = uid or email
    name = name or email.split("@")[0]

    return CurrentUser(id=uid, email=email, name=name, role=role)

def _ensure_role(u: CurrentUser, allowed: tuple[str, ...]):
    if u.role not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

def require_admin(u: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    _ensure_role(u, ("Admin",))
    return u

def require_trainer(u: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    _ensure_role(u, ("Trainer", "Admin"))
    return u
