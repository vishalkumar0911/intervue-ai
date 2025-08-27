from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Callable, Iterable, Any
import json, random, time, uuid

from fastapi import FastAPI, HTTPException, Query, Body, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


# -------------------- Settings --------------------
class Settings(BaseSettings):
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    QUESTIONS_FILE: str = ""   # optional override
    ATTEMPTS_FILE: str = ""    # optional override (defaults to data/attempts.jsonl)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


# -------------------- App --------------------
app = FastAPI(title="Intervue.AI API", version="1.4.0")

origins = [o.strip() for o in settings.BACKEND_CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------- Models --------------------
class Question(BaseModel):
    id: str
    role: str
    text: str
    topic: Optional[str] = None
    difficulty: Optional[str] = "easy"


# Attempts: support optional difficulty (so Analytics can stack by difficulty)
class AttemptCreate(BaseModel):
    role: str
    score: int = Field(ge=0, le=100)
    duration_min: int = Field(ge=0)
    date: Optional[datetime] = None  # allow client to provide, otherwise now()
    difficulty: Optional[str] = Field(
        default=None,
        description="Optional tag: easy|medium|hard",
    )


class Attempt(AttemptCreate):
    id: str
    date: datetime  # required in stored model


class AttemptUpdate(BaseModel):
    role: Optional[str] = None
    score: Optional[int] = Field(default=None, ge=0, le=100)
    duration_min: Optional[int] = Field(default=None, ge=0)
    date: Optional[datetime] = None
    difficulty: Optional[str] = None


# -------------------- Data loading --------------------
QUESTIONS: Dict[str, List[Question]] = {}
QUESTIONS_MTIME: float = 0.0


def _root() -> Path:
    return Path(__file__).resolve().parent.parent


def questions_path() -> Path:
    if settings.QUESTIONS_FILE:
        return Path(settings.QUESTIONS_FILE).resolve()
    return (_root() / "data" / "questions.json").resolve()


def attempts_path() -> Path:
    if settings.ATTEMPTS_FILE:
        return Path(settings.ATTEMPTS_FILE).resolve()
    return (_root() / "data" / "attempts.jsonl").resolve()


def load_questions_from_disk() -> None:
    global QUESTIONS, QUESTIONS_MTIME
    path = questions_path()
    data = json.loads(path.read_text(encoding="utf-8"))
    QUESTIONS = {role: [Question(**q) for q in qs] for role, qs in data.items()}
    QUESTIONS_MTIME = path.stat().st_mtime


def hot_reload_if_changed() -> None:
    path = questions_path()
    try:
        mtime = path.stat().st_mtime
        if mtime != QUESTIONS_MTIME:
            load_questions_from_disk()
    except FileNotFoundError:
        # keep old in memory; /health will reveal missing file
        pass


@app.on_event("startup")
def startup() -> None:
    load_questions_from_disk()
    p = attempts_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        p.touch()


# -------------------- Robust JSONL helpers --------------------
def _parse_line_to_records(line: str) -> list[dict]:
    """
    Parse a JSONL line that might be:
      - a single JSON object     -> returns [obj]
      - a JSON array of objects  -> returns [...objs]
      - malformed                -> returns []
    """
    try:
        parsed = json.loads(line)
    except Exception:
        return []

    if isinstance(parsed, dict):
        return [parsed]
    if isinstance(parsed, list):
        out = []
        for item in parsed:
            if isinstance(item, dict):
                out.append(item)
        return out
    return []


def _read_attempts_jsonl(limit: int = 100, role: Optional[str] = None) -> List[Attempt]:
    """
    Read attempts from JSONL, tolerant to lines that are arrays.
    Returns most-recent-first, limited.
    """
    p = attempts_path()
    out: List[Attempt] = []
    if not p.exists():
        return out

    with p.open("r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            for rec in _parse_line_to_records(raw):
                # filter early if asked for a role
                if role and rec.get("role") != role:
                    continue
                try:
                    out.append(Attempt(**rec))
                except Exception:
                    # skip invalid
                    continue

    # file is append-only (oldest first) → return newest first
    return out[::-1][:limit]


def _rewrite_attempts_jsonl(transform: Callable[[dict], Optional[dict]]) -> int:
    """
    Read all attempts line-by-line, support array-lines, apply `transform(rec)` to each dict.
    If transform returns None, record is dropped (e.g., delete).
    Rewrites the file in-place. Returns number of records written.
    """
    p = attempts_path()
    if not p.exists():
        return 0

    tmp = p.with_suffix(".tmp")
    written = 0
    with p.open("r", encoding="utf-8") as fin, tmp.open("w", encoding="utf-8") as fout:
        for raw in fin:
            raw = raw.strip()
            if not raw:
                continue

            records = _parse_line_to_records(raw)
            if not records:
                continue

            for rec in records:
                try:
                    new_rec = transform(rec)
                except Exception:
                    # if transform itself crashes on a malformed rec, skip that rec
                    continue

                if new_rec is None:
                    # dropped
                    continue

                try:
                    fout.write(json.dumps(new_rec, default=str) + "\n")
                    written += 1
                except Exception:
                    # on write error for this record, skip to next
                    continue

    tmp.replace(p)
    return written


# -------------------- Health --------------------
@app.get("/health")
def health():
    hot_reload_if_changed()
    return {
        "ok": True,
        "roles": sorted(QUESTIONS.keys()),
        "counts": {r: len(qs) for r, qs in QUESTIONS.items()},
        "questions_file": str(questions_path()),
        "attempts_file": str(attempts_path()),
        "last_questions_load_ts": QUESTIONS_MTIME,
        "server_time": time.time(),
    }


# -------------------- Question Endpoints --------------------
@app.get("/roles", response_model=List[str])
def roles():
    hot_reload_if_changed()
    return sorted(QUESTIONS.keys())


@app.get("/questions", response_model=List[Question])
def list_questions(
    role: str,
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10_000),
    difficulty: Optional[str] = Query(None, pattern="^(easy|medium|hard)$"),
    shuffle: bool = False,
    seed: Optional[int] = None,
):
    hot_reload_if_changed()
    bank = _filtered_bank(role, difficulty)
    if shuffle:
        bank = bank[:]
        rng = random.Random(seed)
        rng.shuffle(bank)
    end = min(offset + limit, len(bank))
    return bank[offset:end]


@app.get("/question/next", response_model=Question)
def next_question(
    role: str,
    index: int = Query(0, ge=0),
    difficulty: Optional[str] = Query(None, pattern="^(easy|medium|hard)$"),
):
    hot_reload_if_changed()
    bank = _filtered_bank(role, difficulty)
    if not bank:
        raise HTTPException(status_code=404, detail="No questions for role/difficulty")
    return bank[index % len(bank)]


@app.get("/questions/random", response_model=Question)
def random_question(
    role: str,
    difficulty: Optional[str] = Query(None, pattern="^(easy|medium|hard)$"),
    seed: Optional[int] = None,
):
    hot_reload_if_changed()
    bank = _filtered_bank(role, difficulty)
    if not bank:
        raise HTTPException(status_code=404, detail="No questions for role/difficulty")
    rng = random.Random(seed)
    return rng.choice(bank)


@app.get("/search", response_model=List[Question])
def search(
    q: str = Query(..., min_length=1),
    role: Optional[str] = None,
    limit: int = Query(20, ge=1, le=200),
):
    hot_reload_if_changed()
    haystack: List[Question] = []
    if role:
        haystack = _filtered_bank(role, None)
    else:
        for _, qs in QUESTIONS.items():
            haystack.extend(qs)

    ql = q.lower()
    results = [
        item for item in haystack
        if ql in (item.text or "").lower() or ql in (item.topic or "").lower()
    ]
    return results[:limit]


# -------------------- Attempts Endpoints --------------------
@app.get("/attempts", response_model=List[Attempt])
def get_attempts(
    role: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    return _read_attempts_jsonl(limit=limit, role=role)


@app.get("/attempts/{attempt_id}", response_model=Attempt)
def get_attempt_by_id(attempt_id: str):
    items = _read_attempts_jsonl(limit=10_000)
    for a in items:
        if a.id == attempt_id:
            return a
    raise HTTPException(status_code=404, detail="Attempt not found")


@app.post("/attempts", response_model=Attempt)
def add_attempt(payload: AttemptCreate = Body(...)):
    if payload.role not in QUESTIONS:
        raise HTTPException(status_code=400, detail="Unknown role")
    if payload.difficulty and payload.difficulty not in {"easy", "medium", "hard"}:
        raise HTTPException(status_code=400, detail="Invalid difficulty")
    attempt = Attempt(
        id=str(uuid.uuid4()),
        role=payload.role,
        score=payload.score,
        duration_min=payload.duration_min,
        date=payload.date or datetime.utcnow(),
        difficulty=payload.difficulty,
    )
    try:
        # Always store as single-object JSONL lines
        p = attempts_path()
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps(attempt.model_dump(), default=str) + "\n")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save attempt: {e}")
    return attempt


@app.delete("/attempts/{attempt_id}")
def delete_attempt(attempt_id: str):
    """
    Delete one attempt by id. Returns 404 if not found.
    Robust to legacy JSON array lines in the file.
    """
    found = False

    def transform(rec: dict):
        nonlocal found
        if rec.get("id") == attempt_id:
            found = True
            return None  # drop
        return rec

    written = _rewrite_attempts_jsonl(transform)
    if not found:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return {"ok": True, "deleted": 1, "id": attempt_id, "remaining_written": written}


@app.patch("/attempts/{attempt_id}", response_model=Attempt)
def update_attempt(attempt_id: str, patch: AttemptUpdate):
    """
    Patch an attempt. If a provided role is invalid, the old role is kept.
    Difficulty must be easy|medium|hard when provided.
    """
    updated: Optional[Attempt] = None

    def transform(rec: dict):
        nonlocal updated
        if rec.get("id") != attempt_id:
            return rec

        # apply patch onto a copy of the dict
        role = patch.role if patch.role is not None else rec.get("role")
        if role not in QUESTIONS:
            role = rec.get("role")

        score = patch.score if patch.score is not None else rec.get("score")
        duration_min = patch.duration_min if patch.duration_min is not None else rec.get("duration_min")

        if patch.date is not None:
            date_value: Any = patch.date.isoformat() if isinstance(patch.date, datetime) else patch.date
        else:
            date_value = rec.get("date")

        difficulty = patch.difficulty if patch.difficulty is not None else rec.get("difficulty")
        if difficulty and difficulty not in {"easy", "medium", "hard"}:
            difficulty = rec.get("difficulty")

        new_rec = {
            "id": attempt_id,
            "role": role,
            "score": score,
            "duration_min": duration_min,
            "date": date_value,
            "difficulty": difficulty,
        }

        try:
            updated = Attempt(**new_rec)
        except Exception:
            # if something invalid, keep old record
            try:
                updated = Attempt(**rec)
            except Exception:
                updated = None
            return rec

        return updated.model_dump()

    _rewrite_attempts_jsonl(transform)
    if not updated:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return updated


# -------------------- Maintenance: Normalize attempts file --------------------
@app.post("/attempts/normalize")
def normalize_attempts():
    """
    One-time repair:
      - reads all attempts (tolerant to array-lines/malformed items)
      - re-writes the file as proper JSONL (one object per line)
      - ensures 'date' is an ISO string
    """
    data = _read_attempts_jsonl(limit=10_000)  # newest first
    p = attempts_path()
    tmp = p.with_suffix(".tmp")
    written = 0

    # write oldest first so natural append order is preserved
    with tmp.open("w", encoding="utf-8") as fout:
        for a in data[::-1]:
            rec = a.model_dump()
            # ensure date is always a string
            if isinstance(rec.get("date"), datetime):
                rec["date"] = a.date.isoformat()
            try:
                fout.write(json.dumps(rec, default=str) + "\n")
                written += 1
            except Exception:
                continue

    tmp.replace(p)
    return {"ok": True, "rewritten": written, "file": str(p)}


# -------------------- internal helpers --------------------
def _filtered_bank(role: str, difficulty: Optional[str]) -> List[Question]:
    if role not in QUESTIONS:
        raise HTTPException(status_code=404, detail="Unknown role")
    bank = QUESTIONS[role]
    if difficulty:
        d = difficulty.lower()
        bank = [q for q in bank if (q.difficulty or "").lower() == d]
    return bank
