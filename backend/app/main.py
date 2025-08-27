from __future__ import annotations
from fastapi.responses import StreamingResponse
import io, csv


from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any, Callable
import json, random, time, uuid, hashlib
from collections import defaultdict, deque

from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    Body,
    Request,
    Response,
    Depends,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, ValidationError
from pydantic_settings import BaseSettings


# -------------------- Settings --------------------
class Settings(BaseSettings):
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    QUESTIONS_FILE: str = ""    # optional override
    ATTEMPTS_FILE: str = ""     # optional override (defaults to data/attempts.jsonl)
    BACKEND_API_KEY: Optional[str] = None  # optional API key for mutating endpoints

    # Rate limit knobs (per IP)
    RL_READ_RATE: int = 60      # requests / minute
    RL_MUTATE_RATE: int = 20    # requests / minute

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


# -------------------- App --------------------
tags_metadata = [
    {"name": "health", "description": "Health and server info"},
    {"name": "questions", "description": "Interview questions"},
    {"name": "search", "description": "Search questions"},
    {"name": "attempts", "description": "Session attempts CRUD"},
    {"name": "stats", "description": "Aggregated statistics"},
    {"name": "dev", "description": "Developer utilities / seeders"},
]

app = FastAPI(
    title="Intervue.AI API",
    version="1.4.0",
    openapi_tags=tags_metadata,
)

# CORS
origins = [o.strip() for o in settings.BACKEND_CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GZip compression
app.add_middleware(GZipMiddleware, minimum_size=500)


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


def file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except Exception:
        return 0


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
        pass


@app.on_event("startup")
def startup() -> None:
    load_questions_from_disk()
    p = attempts_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        p.touch()


# -------------------- Security & Rate limiting --------------------
def require_api_key(request: Request):
    """
    Optional API key guard for MUTATING endpoints.
    If BACKEND_API_KEY is unset, allow everything (dev mode).
    """
    if not settings.BACKEND_API_KEY:
        return  # no-op
    key = request.headers.get("x-api-key") or request.query_params.get("api_key")
    if not key or key != settings.BACKEND_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing API key")


# per-IP sliding window limiter {ip -> deque[timestamps]}
_ip_hits_read: dict[str, deque[float]] = defaultdict(deque)
_ip_hits_mutate: dict[str, deque[float]] = defaultdict(deque)

def _rate_limit(request: Request, bucket: dict[str, deque[float]], rate: int, window: float = 60.0):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    dq = bucket[ip]
    # prune old
    while dq and now - dq[0] > window:
        dq.popleft()
    if len(dq) >= rate:
        raise HTTPException(status_code=429, detail="Too many requests")
    dq.append(now)

def rl_read_dep(request: Request):
    _rate_limit(request, _ip_hits_read, settings.RL_READ_RATE)

def rl_mutate_dep(request: Request):
    _rate_limit(request, _ip_hits_mutate, settings.RL_MUTATE_RATE)


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
                continue
    return out[::-1][:limit]  # most recent first


def _rewrite_attempts_jsonl(transform: Callable[[dict], Optional[dict]]) -> int:
    """
    Read all attempts, call transform(rec_dict) -> rec_dict | None.
    If transform returns None, the record is dropped.
    Rewrites the file; returns number of records written.
    """
    p = attempts_path()
    if not p.exists():
        return 0
    tmp = p.with_suffix(".tmp")
    count = 0
    with p.open("r", encoding="utf-8") as fin, tmp.open("w", encoding="utf-8") as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            new_rec = transform(rec)
            if new_rec is not None:
                fout.write(json.dumps(new_rec, default=str) + "\n")
                count += 1
    tmp.replace(p)
    return count


def _etag_json(request: Request, data: Any, max_age: int = 30) -> Response:
    """
    Return JSON with ETag/Cache-Control and support 304 revalidation.
    """
    body = json.dumps(jsonable_encoder(data), separators=(",", ":"), default=str)
    etag = '"' + hashlib.sha1(body.encode("utf-8")).hexdigest() + '"'
    inm = request.headers.get("if-none-match")
    headers = {"ETag": etag, "Cache-Control": f"public, max-age={max_age}"}
    if inm == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


# -------------------- Error handlers --------------------
@app.exception_handler(ValidationError)
async def on_validation_error(_: Request, exc: ValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "message": "Validation failed"},
    )

@app.exception_handler(Exception)
async def on_unhandled(_: Request, exc: Exception):
    # Let HTTPException bubble via default handler; otherwise return 500
    if isinstance(exc, HTTPException):
        raise exc
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "message": str(exc)},
    )


# -------------------- Health --------------------
@app.get("/health", tags=["health"])
def health():
    hot_reload_if_changed()
    qpath = questions_path()
    apath = attempts_path()
    return {
        "ok": True,
        "mode": "protected" if settings.BACKEND_API_KEY else "open",
        "roles": sorted(QUESTIONS.keys()),
        "counts": {r: len(qs) for r, qs in QUESTIONS.items()},
        "questions_file": str(qpath),
        "questions_size": file_size(qpath),
        "attempts_file": str(apath),
        "attempts_size": file_size(apath),
        "last_questions_load_ts": QUESTIONS_MTIME,
        "server_time": time.time(),
    }


# -------------------- Question Endpoints --------------------
@app.get("/roles", response_model=List[str], tags=["questions"], dependencies=[Depends(rl_read_dep)])
def roles(request: Request):
    """Return available roles (ETag + Cache-Control enabled)."""
    hot_reload_if_changed()
    data = sorted(QUESTIONS.keys())
    return _etag_json(request, data, max_age=60)

@app.get(
    "/questions",
    response_model=List[Question],
    tags=["questions"],
    dependencies=[Depends(rl_read_dep)],
)
def list_questions(
    request: Request,
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
        bank = bank[:]
        rng = random.Random(seed)
        rng.shuffle(bank)
    end = min(offset + limit, len(bank))
    # ETag aids client caching of the bank slice
    return _etag_json(request, bank[offset:end], max_age=30)

@app.get("/question/next", response_model=Question, tags=["questions"], dependencies=[Depends(rl_read_dep)])
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

@app.get("/questions/random", response_model=Question, tags=["questions"], dependencies=[Depends(rl_read_dep)])
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


# -------------------- Search --------------------
@app.get("/search", response_model=List[Question], tags=["search"], dependencies=[Depends(rl_read_dep)])
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
@app.get("/attempts", response_model=List[Attempt], tags=["attempts"], dependencies=[Depends(rl_read_dep)])
def get_attempts(
    role: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    """Return most recent attempts (newest first)."""
    return _read_attempts_jsonl(limit=limit, role=role)

@app.get("/attempts/{attempt_id}", response_model=Attempt, tags=["attempts"], dependencies=[Depends(rl_read_dep)])
def get_attempt_by_id(attempt_id: str):
    items = _read_attempts_jsonl(limit=10_000)
    for a in items:
        if a.id == attempt_id:
            return a
    raise HTTPException(status_code=404, detail="Attempt not found")

@app.post(
    "/attempts",
    response_model=Attempt,
    status_code=201,
    tags=["attempts"],
    dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)],
)
def add_attempt(payload: AttemptCreate = Body(...)):
    """Create a new attempt; server assigns id and default date if missing."""
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
        _append_attempt_jsonl(attempt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save attempt: {e}")
    return attempt

@app.delete(
    "/attempts/{attempt_id}",
    tags=["attempts"],
    dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)],
)
def delete_attempt(attempt_id: str):
    """Delete an attempt by id."""
    found = False

    def transform(rec: dict):
        nonlocal found
        # some corrupt lines or arrays might sneak in; protect access
        if isinstance(rec, dict) and rec.get("id") == attempt_id:
            found = True
            return None
        return rec

    _rewrite_attempts_jsonl(transform)
    if not found:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return {"ok": True, "deleted": 1, "id": attempt_id}

@app.patch(
    "/attempts/{attempt_id}",
    response_model=Attempt,
    tags=["attempts"],
    dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)],
)
def update_attempt(attempt_id: str, patch: AttemptUpdate):
    """Patch fields of an attempt; ignores invalid field values gracefully."""
    updated: Optional[Attempt] = None

    def transform(rec: dict):
        nonlocal updated
        if not isinstance(rec, dict) or rec.get("id") != attempt_id:
            return rec
        role = patch.role if patch.role is not None else rec.get("role")
        if role not in QUESTIONS:
            role = rec.get("role")
        score = patch.score if patch.score is not None else rec.get("score")
        duration_min = patch.duration_min if patch.duration_min is not None else rec.get("duration_min")
        date = (
            patch.date.isoformat() if isinstance(patch.date, datetime) else patch.date
        ) if patch.date is not None else rec.get("date")
        difficulty = patch.difficulty if patch.difficulty is not None else rec.get("difficulty")
        if difficulty and difficulty not in {"easy", "medium", "hard"}:
            difficulty = rec.get("difficulty")

        new_rec = {
            "id": attempt_id,
            "role": role,
            "score": score,
            "duration_min": duration_min,
            "date": date,
            "difficulty": difficulty,
        }
        try:
            updated = Attempt(**new_rec)
        except Exception:
            updated = Attempt(**rec)
            return rec
        return updated.model_dump()

    _rewrite_attempts_jsonl(transform)
    if not updated:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return updated

@app.get("/attempts/export")
def export_attempts(role: Optional[str] = Query(None)):
    """
    Stream a CSV export of attempts (optionally filtered by ?role=…).
    Columns: id,role,score,duration_min,date,difficulty
    """
    items = _read_attempts_jsonl(limit=10_000, role=role)
    def iter_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "role", "score", "duration_min", "date", "difficulty"])
        yield output.getvalue()
        output.seek(0); output.truncate(0)

        for it in items:
            writer.writerow([
                it.id,
                it.role,
                it.score,
                it.duration_min,
                # Ensure ISO string
                it.date.isoformat() if hasattr(it.date, "isoformat") else str(it.date),
                it.difficulty or "",
            ])
            yield output.getvalue()
            output.seek(0); output.truncate(0)

    headers = {"Content-Disposition": 'attachment; filename="attempts.csv"'}
    return StreamingResponse(iter_csv(), media_type="text/csv", headers=headers)


# -------------------- Stats --------------------
@app.get("/stats", tags=["stats"], dependencies=[Depends(rl_read_dep)])
def stats():
    """
    Simple stats for dashboard/analytics:
      - questions_per_role
      - attempts_total
      - attempts_by_role
      - attempts_by_difficulty
    """
    hot_reload_if_changed()
    questions_per_role = {r: len(qs) for r, qs in QUESTIONS.items()}

    attempts = _read_attempts_jsonl(limit=10_000)
    attempts_total = len(attempts)
    by_role: Dict[str, int] = defaultdict(int)
    by_diff: Dict[str, int] = defaultdict(int)
    for a in attempts:
        by_role[a.role] += 1
        d = (a.difficulty or "unknown").lower()
        by_diff[d] += 1

    return {
        "questions_per_role": questions_per_role,
        "attempts_total": attempts_total,
        "attempts_by_role": dict(by_role),
        "attempts_by_difficulty": dict(by_diff),
    }


# -------------------- Developer utilities --------------------
@app.post(
    "/dev/seed",
    tags=["dev"],
    dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)],
)
def dev_seed(
    count: int = Query(20, ge=1, le=500),
    seed: int = Query(42),
    role: Optional[str] = Query(None, description="Seed only this role; default: all roles"),
):
    """Create synthetic attempts for quick demos/testing."""
    rng = random.Random(seed)
    roles = [role] if role else sorted(QUESTIONS.keys()) or ["Frontend Developer"]
    if not roles:
        raise HTTPException(status_code=400, detail="No roles available to seed")

    created = 0
    for _ in range(count):
        r = rng.choice(roles)
        attempt = Attempt(
            id=str(uuid.uuid4()),
            role=r,
            score=rng.randint(35, 95),
            duration_min=rng.randint(8, 32),
            date=datetime.utcnow(),
            difficulty=rng.choice(["easy", "medium", "hard"]),
        )
        _append_attempt_jsonl(attempt)
        created += 1
    return {"ok": True, "created": created}
