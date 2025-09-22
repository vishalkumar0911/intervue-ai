# backend/app/routes_admin.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict
from pathlib import Path
import json, time

from .deps import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])

# ✅ Canonical users store: backend/app/data/users.json
USERS_DB = Path(__file__).resolve().parent / "data" / "users.json"
USERS_DB.parent.mkdir(parents=True, exist_ok=True)
if not USERS_DB.exists():
    USERS_DB.write_text("{}", encoding="utf-8")

# ✅ Audit log (JSONL): backend/app/data/admin_audit.jsonl
AUDIT_FILE = Path(__file__).resolve().parent / "data" / "admin_audit.jsonl"
AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)
if not AUDIT_FILE.exists():
    AUDIT_FILE.write_text("", encoding="utf-8")

def _load_users() -> Dict[str, dict]:
    try:
        return json.loads(USERS_DB.read_text(encoding="utf-8"))
    except Exception:
        return {}

def _save_users(d: Dict[str, dict]):
    USERS_DB.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")

def _append_audit(event: dict):
    """Append a single JSON line to the audit file."""
    event.setdefault("ts", int(time.time()))
    with AUDIT_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")

def _read_audit_tail(limit: int = 50) -> List[dict]:
    """Read last N events (best-effort, small file)."""
    try:
        lines = AUDIT_FILE.read_text(encoding="utf-8").splitlines()
        tail = lines[-limit:]
        return [json.loads(x) for x in tail if x.strip()]
    except Exception:
        return []

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: Optional[str] = None

class RolePatch(BaseModel):
    email: str
    role: Optional[str] = None  # "Student" | "Trainer" | "Admin" | null

@router.get("/users", response_model=List[UserOut])
def list_users(_admin = Depends(require_admin)):
    users = _load_users()
    return [
        UserOut(
            id=u.get("id") or email,
            name=u.get("name") or email.split("@")[0],
            email=email,
            role=u.get("role"),
        )
        for email, u in users.items()
    ]

@router.patch("/users", response_model=UserOut)
def update_user_role(p: RolePatch, _admin = Depends(require_admin)):
    users = _load_users()
    u = users.get(p.email)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    before_role = u.get("role")
    u["role"] = p.role
    users[p.email] = u
    _save_users(users)

    # 🔏 write audit
    _append_audit({
        "type": "role_change",
        "email": p.email,
        "before": before_role,
        "after": p.role,
    })

    return UserOut(
        id=u.get("id") or p.email,
        name=u.get("name") or p.email.split("@")[0],
        email=p.email,
        role=u.get("role"),
    )

# 📖 Read recent audit events
class AuditEvent(BaseModel):
    ts: int
    type: str
    email: str
    before: Optional[str] = None
    after: Optional[str] = None

@router.get("/audit", response_model=List[AuditEvent])
def recent_audit(limit: int = Query(50, ge=1, le=200), _admin = Depends(require_admin)):
    rows = _read_audit_tail(limit)
    # newest last → newest first for UI
    rows.reverse()
    return [AuditEvent(**r) for r in rows]
