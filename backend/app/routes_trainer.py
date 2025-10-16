# backend/app/routes_trainer.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Literal, Dict, Any, Tuple
from pathlib import Path
import uuid, json, tempfile, os

from .deps import require_trainer

# ---------------------------------------------------------------------
# Read QUESTIONS_FILE from env (same behavior as app.main)
# ---------------------------------------------------------------------
from pydantic_settings import BaseSettings, SettingsConfigDict

class _Settings(BaseSettings):
    QUESTIONS_FILE: str = ""  # optional override
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

_settings = _Settings()

def _default_questions_path() -> Path:
    # backend/app/routes_trainer.py -> backend/
    return Path(__file__).resolve().parents[1] / "data" / "questions.json"

def _questions_path() -> Path:
    # If env provided, use that; otherwise use the default
    raw = (_settings.QUESTIONS_FILE or "").strip()
    return (Path(raw).resolve() if raw else _default_questions_path()).resolve()


router = APIRouter(prefix="/trainer", tags=["trainer"])

# ----------------------- file i/o helpers (grouped by role) -----------------------

def _ensure_file():
    p = _questions_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        # start with empty grouped object, not a list
        p.write_text("{}", encoding="utf-8")

def _normalize_item(it: dict) -> dict:
    """Ensure id, role, and default legacy fields."""
    if not isinstance(it, dict):
        return {}
    if not it.get("id"):
        it["id"] = str(uuid.uuid4())
    # default legacy rows are 'core' unless explicitly set
    it.setdefault("source", "core")
    # allow topic missing / None
    it.setdefault("topic", it.get("topic", None))
    # keep difficulty None/str
    return it

def _load_map() -> Dict[str, List[Dict[str, Any]]]:
    """Load as { role: [ {q}, ... ] } no matter how file is currently shaped."""
    _ensure_file()
    p = _questions_path()
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}

    if isinstance(raw, dict):
        out: Dict[str, List[Dict[str, Any]]] = {}
        for role, arr in raw.items():
            bucket: List[Dict[str, Any]] = []
            if isinstance(arr, list):
                for it in arr:
                    it = dict(it or {})
                    it["role"] = role  # ensure role field present/consistent
                    it = _normalize_item(it)
                    if it:
                        bucket.append(it)
            out[role] = bucket
        return out

    # if someone accidentally wrote a flat list, upgrade it back to grouped
    if isinstance(raw, list):
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for it in raw:
            it = dict(it or {})
            role = it.get("role") or "Uncategorized"
            it = _normalize_item(it)
            grouped.setdefault(role, []).append(it)
        return grouped

    return {}

def _atomic_write_map(d: Dict[str, List[Dict[str, Any]]]):
    # keep same grouped-by-role structure on disk
    p = _questions_path()
    tmp = tempfile.NamedTemporaryFile(
        "w", delete=False, encoding="utf-8", dir=str(p.parent)
    )
    try:
        json.dump(d, tmp, ensure_ascii=False, indent=2)
        tmp.flush(); os.fsync(tmp.fileno()); tmp.close()
        os.replace(tmp.name, p)
    except Exception:
        try: os.unlink(tmp.name)
        except Exception: pass
        raise

def _flatten(d: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for role, arr in d.items():
        for it in arr:
            q = dict(it)
            q["role"] = role
            out.append(q)
    return out


# ----------------------------- schemas -----------------------------

class Question(BaseModel):
    id: str
    role: str
    text: str
    topic: Optional[str] = None
    difficulty: Optional[Literal["easy","medium","hard"]] = None
    source: Optional[Literal["core","trainer"]] = None

class QuestionCreate(BaseModel):
    role: str
    text: str
    topic: Optional[str] = None
    difficulty: Optional[Literal["easy","medium","hard"]] = None

class QuestionPatch(BaseModel):
    role: Optional[str] = None
    text: Optional[str] = None
    topic: Optional[str] = None
    difficulty: Optional[Literal["easy","medium","hard"]] = None


# ----------------------------- routes -----------------------------

@router.get("/questions", response_model=List[Question])
def list_questions(
    role: Optional[str] = None,
    topic: Optional[str] = None,
    difficulty: Optional[Literal["easy","medium","hard"]] = Query(None),
    include_core: bool = Query(True, description="include questions from the core bank"),
    _u = Depends(require_trainer),
):
    data = _load_map()
    rows = _flatten(data)

    if not include_core:
        rows = [q for q in rows if (q.get("source") or "core") != "core"]
    if role:
        rows = [q for q in rows if q.get("role") == role]
    if topic is not None:
        rows = [q for q in rows if (q.get("topic") or "") == topic]
    if difficulty is not None:
        rows = [q for q in rows if (q.get("difficulty") or "") == difficulty]

    return [Question(**q) for q in rows]

@router.post("/questions", response_model=Question)
def create_question(q: QuestionCreate, _u = Depends(require_trainer)):
    data = _load_map()
    role = q.role
    rec = _normalize_item({
        "id": str(uuid.uuid4()),
        "role": role,
        "text": q.text,
        "topic": q.topic,
        "difficulty": q.difficulty,
        "source": "trainer",   # mark trainer-created
    })
    data.setdefault(role, []).insert(0, rec)
    _atomic_write_map(data)
    return Question(**rec)

def _find_by_id(d: Dict[str, List[Dict[str, Any]]], qid: str) -> Tuple[str, int] | None:
    for r, arr in d.items():
        for i, it in enumerate(arr):
            if it.get("id") == qid:
                return (r, i)
    return None

@router.patch("/questions/{qid}", response_model=Question)
def update_question(qid: str, patch: QuestionPatch, _u = Depends(require_trainer)):
    data = _load_map()
    loc = _find_by_id(data, qid)
    if not loc:
        raise HTTPException(status_code=404, detail="Not found")

    role, idx = loc
    cur = dict(data[role][idx])
    new_role = (patch.role or cur.get("role") or role)

    # apply changes
    for k, v in patch.model_dump(exclude_unset=True).items():
        cur[k] = v

    # if role changed, move buckets
    if new_role != role:
        cur["role"] = new_role
        data[role].pop(idx)
        data.setdefault(new_role, []).insert(0, cur)
    else:
        data[role][idx] = cur

    _atomic_write_map(data)
    return Question(**cur)

@router.delete("/questions/{qid}")
def delete_question(qid: str, _u = Depends(require_trainer)):
    data = _load_map()
    loc = _find_by_id(data, qid)
    if not loc:
        raise HTTPException(status_code=404, detail="Not found")
    role, idx = loc
    data[role].pop(idx)
    _atomic_write_map(data)
    return {"ok": True, "id": qid}
