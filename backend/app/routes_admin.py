# backend/app/routes_admin.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
from pathlib import Path
import json

from .deps import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])

# --- use the SAME users store as routers/auth.py ---
USERS_DB = Path(__file__).resolve().parent / "data" / "users.json"
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

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: Optional[str] = None

class RolePatch(BaseModel):
    email: str
    role: Optional[str] = None

@router.get("/users", response_model=List[UserOut])
def list_users(_admin = Depends(require_admin)):
    users = _load_users()
    # users keyed by email in routers/auth.py
    return [UserOut(id=u.get("id") or k, name=u.get("name") or k.split("@")[0], email=k, role=u.get("role")) 
            for k, u in users.items()]

@router.patch("/users", response_model=UserOut)
def update_user_role(p: RolePatch, _admin = Depends(require_admin)):
    users = _load_users()
    u = users.get(p.email)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u["role"] = p.role
    users[p.email] = u
    _save_users(users)
    return UserOut(id=u.get("id") or p.email, name=u.get("name") or p.email.split("@")[0], email=p.email, role=u.get("role"))
