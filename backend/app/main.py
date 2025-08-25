from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Literal
import json, random, time, uuid, io, csv

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
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
app = FastAPI(title="Intervue.AI API", version="1.3.0")

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


# Attempts: use a create model so the server assigns id/date if omitted
DifficultyL = Literal["easy", "medium", "hard"]

class AttemptCreate(BaseModel):
    role: str
    score: int = Field(ge=0, le=100)
    duration_min: int = Field(ge=0)
    date: Optional[datetime] = None  # allow client to provide, otherwise now()
    difficulty: Optional[DifficultyL] = None  # NEW (optional, helps Analytics)


class Attempt(AttemptCreate):
    id: str
    date: datetime  # required in the stored model


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
        # leave existing data; /health will show the missing file
        pass


@app.on_event("startup")
def startup() -> None:
    load_questions_from_disk()
    # ensure attempts file dir exists
    p = attempts_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        p.touch()


# -------------------- Helpers --------------------
def _filtered_bank(role: str, difficulty: Optional[str]) -> List[Question]:
    if role not in QUESTIONS:
        raise HTTPException(status_code=404, detail="Unknown role")
    bank = QUESTIONS[role]
    if difficulty:
        d = difficulty.lower()
        bank = [q for q in bank if (q.difficulty or "").lower() == d]
    return bank


def _append_attempt_jsonl(a: Attempt) -> None:
    p = attempts_path()
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(a.model_dump(), default=str) + "\n")


def _read_attempts_jsonl(limit: int = 100, role: Optional[str] = None) -> List[Attempt]:
    p = attempts_path()
    out: List[Attempt] = []
    if not p.exists():
        return out
    with p.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if role and rec.get("role") != role:
                    continue
                out.append(Attempt(**rec))
            except Exception:
                # skip corrupt line
                continue
    # JSONL is append-only (oldest first). Return most-recent first, limited.
    return out[::-1][:limit]


# Aggregate helpers
def _stats(attempts: List[Attempt]):
    total = len(attempts)
    if total == 0:
        return {
            "total": 0, "avg_score": 0, "total_minutes": 0,
            "by_role": [], "by_role_sessions": [], "last_7d": {"count": 0, "avg": 0}
        }

    avg_score = round(sum(a.score for a in attempts) / total)
    total_minutes = sum(a.duration_min for a in attempts)

    # per-role sessions
    role_sessions: Dict[str, int] = {}
    role_scores: Dict[str, List[int]] = {}
    for a in attempts:
        role_sessions[a.role] = role_sessions.get(a.role, 0) + 1
        role_scores.setdefault(a.role, []).append(a.score)

    by_role_avg = [{"role": r, "avg": round(sum(v)/len(v))} for r, v in role_scores.items()]
    by_role_avg.sort(key=lambda x: x["avg"], reverse=True)

    by_role_sessions = [{"role": r, "count": c} for r, c in role_sessions.items()]
    by_role_sessions.sort(key=lambda x: x["count"], reverse=True)

    # last 7 days
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    recent = [a for a in attempts if a.date >= week_ago]
    last7_count = len(recent)
    last7_avg = round(sum(a.score for a in recent)/last7_count) if last7_count else 0

    return {
        "total": total,
        "avg_score": avg_score,
        "total_minutes": total_minutes,
        "by_role": by_role_avg,
        "by_role_sessions": by_role_sessions,
        "last_7d": {"count": last7_count, "avg": last7_avg},
    }


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
    """
    List questions for a role with optional difficulty filter.
    - offset/limit for paging
    - shuffle with optional seed for deterministic order
    """
    hot_reload_if_changed()
    bank = _filtered_bank(role, difficulty)

    if shuffle:
        bank = bank[:]  # copy before shuffle
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
    """Return item at index (wraps) with optional difficulty filter."""
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
    """Return one random question (deterministic if seed provided)."""
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
    """Simple substring search in text/topic, optionally scoped to a role."""
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
    """Return most recent attempts first; can filter by role."""
    return _read_attempts_jsonl(limit=limit, role=role)


@app.post("/attempts", response_model=Attempt)
def add_attempt(payload: AttemptCreate = Body(...)):
    """Create a new attempt; server assigns id and default date if missing."""
    # Validate role against known roles for nicer UX
    if payload.role not in QUESTIONS:
        raise HTTPException(status_code=400, detail="Unknown role")

    attempt = Attempt(
        id=str(uuid.uuid4()),
        role=payload.role,
        score=payload.score,
        duration_min=payload.duration_min,
        date=payload.date or datetime.utcnow(),
        difficulty=payload.difficulty,
    )
    try:
        _append_attempt_jsonl(attempt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save attempt: {e}")
    return attempt


# --------- NEW: export/clear/stats/seed ----------
@app.get("/attempts/export.csv")
def export_attempts_csv():
    rows = _read_attempts_jsonl(limit=10_000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "role", "score", "duration_min", "date", "difficulty"])
    for a in rows:
        writer.writerow([a.id, a.role, a.score, a.duration_min, a.date.isoformat(), a.difficulty or ""])
    buf.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="attempts.csv"'}
    return StreamingResponse(iter([buf.read()]), media_type="text/csv", headers=headers)


@app.get("/attempts/export.json")
def export_attempts_json():
    rows = _read_attempts_jsonl(limit=10_000)
    return JSONResponse([a.model_dump() for a in rows])


@app.delete("/attempts")
def clear_attempts():
    p = attempts_path()
    try:
        p.write_text("", encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear: {e}")
    return {"ok": True}


@app.get("/attempts/stats")
def attempts_stats(limit: int = Query(1000, ge=1, le=10000)):
    rows = _read_attempts_jsonl(limit=limit)
    return _stats(rows)


@app.post("/attempts/seed", response_model=Dict[str, int])
def seed_attempts(
    count: int = Query(10, ge=1, le=200),
    role: Optional[str] = Query(None, description="If provided, seed only this role"),
    seed: Optional[int] = Query(None),
):
    """Seed pseudo-random attempts for quick demos."""
    if role and role not in QUESTIONS:
        raise HTTPException(status_code=400, detail="Unknown role")

    rng = random.Random(seed)
    roles = [role] if role else sorted(QUESTIONS.keys()) or ["Frontend Developer"]

    now = datetime.utcnow()
    mins = [15, 20, 22, 25, 18, 30]
    diffs = ["easy", "medium", "hard"]

    added = 0
    for i in range(count):
        r = rng.choice(roles)
        sc = rng.randint(35, 98)
        dur = rng.choice(mins)
        delta = rng.randint(0, 28)  # in last 4 weeks
        dt = now - timedelta(days=delta, hours=rng.randint(0, 23))
        d = rng.choice(diffs)
        a = Attempt(
            id=str(uuid.uuid4()),
            role=r,
            score=sc,
            duration_min=dur,
            date=dt,
            difficulty=d,  # store difficulty for stacked charts
        )
        _append_attempt_jsonl(a)
        added += 1

    return {"inserted": added}
