# backend/app/main.py
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import random
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from uuid import UUID

import mimetypes
import openai
from app.models import Attempt, AttemptCreate, AttemptUpdate, Question
from fastapi import (
    Body,
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from starlette.middleware.gzip import GZipMiddleware


# -------------------- Settings --------------------
class Settings(BaseSettings):
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    QUESTIONS_FILE: str = ""  # optional override
    ATTEMPTS_FILE: str = ""  # optional override (defaults to data/attempts.jsonl)
    BACKEND_API_KEY: Optional[str] = None  # optional API key for mutating endpoints

    # Rate limit knobs (per IP)
    RL_READ_RATE: int = 60  # requests / minute
    RL_MUTATE_RATE: int = 20  # requests / minute

    OPENAI_API_KEY: Optional[str] = None
    OPENAI_TRANSCRIBE_MODEL: str = "gpt-4o-transcribe"
    openai_analyze_model: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


settings = Settings()

# -------------------- App --------------------
tags_metadata = [
    {"name": "health", "description": "Health and server info"},
    {"name": "questions", "description": "Interview questions"},
    {"name": "search", "description": "Search questions"},
    {"name": "attempts", "description": "Session attempts CRUD"},
    {"name": "stats", "description": "Aggregated statistics"},
    {"name": "dev", "description": "Developer utilities / seeders"},
    {"name": "audio", "description": "Audio transcription"},
    {"name": "analysis", "description": "Text analysis"},
]

app = FastAPI(
    title="Intervue.AI API",
    version="1.5.1",
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
    if not settings.BACKEND_API_KEY:
        return
    key = request.headers.get("x-api-key") or request.query_params.get("api_key")
    if not key or key != settings.BACKEND_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


_ip_hits_read: dict[str, deque[float]] = defaultdict(deque)
_ip_hits_mutate: dict[str, deque[float]] = defaultdict(deque)


def _rate_limit(
    request: Request, bucket: dict[str, deque[float]], rate: int, window: float = 60.0
):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    dq = bucket[ip]
    while dq and now - dq[0] > window:
        dq.popleft()
    if len(dq) >= rate:
        raise HTTPException(status_code=429, detail="Too many requests")
    dq.append(now)


def rl_read_dep(request: Request):
    _rate_limit(request, _ip_hits_read, settings.RL_READ_RATE)


def rl_mutate_dep(request: Request):
    _rate_limit(request, _ip_hits_mutate, settings.RL_MUTATE_RATE)


# -------------------- Windows-safe IO helpers --------------------

ATTEMPTS_LOCK = threading.Lock()


def _parse_dt(val: Any) -> Optional[datetime]:
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        s = val.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(s)
        except Exception:
            return None
    return None


def _to_iso_z(val: Any) -> str:
    dt = _parse_dt(val)
    if dt is None:
        try:
            return str(val)
        except Exception:
            return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _replace_with_retry(
    src: Path, dst: Path, attempts: int = 8, delay: float = 0.2
) -> None:
    for i in range(attempts):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            time.sleep(delay * (i + 1))
    os.replace(src, dst)


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


# -------------------- GPT helpers (concise prompts) --------------------
def _analyze_text_with_gpt(
    client: OpenAI, model: str, text: str, context: str | None = None
) -> dict:
    system = (
        "You are an ultra-concise analysis engine.\n"
        "Task: extract concise keywords and key phrases, write a brief 1–2 sentence summary, "
        "and rate how relevant TEXT is to the optional CONTEXT (0–100).\n"
        "Output policy (STRICT):\n"
        "- Keep everything short and to the point.\n"
        "- keywords: up to 8 single words.\n"
        "- key_phrases: up to 8 phrases, each ≤ 6 words.\n"
        "- summary: ≤ 35 words.\n"
        "- rationale: ≤ 40 words; explain the score briefly.\n"
        "- JSON ONLY with keys: score, keywords, key_phrases, summary, rationale."
    )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"TEXT:\n{text}"},
    ]
    if context:
        messages[1]["content"] += f"\n\nCONTEXT (optional):\n{context}"

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.0,
        )
        raw = resp.choices[0].message.content if resp.choices else "{}"
        data = json.loads(raw or "{}")

        return {
            "score": int(max(0, min(100, int(data.get("score", 0))))),
            "keywords": [k for k in (data.get("keywords") or []) if isinstance(k, str)][:8],
            "key_phrases": [k for k in (data.get("key_phrases") or []) if isinstance(k, str)][:8],
            "summary": str(data.get("summary", ""))[:400],
            "rationale": str(data.get("rationale", ""))[:400],
        }
    except Exception as e:
        return {
            "score": 0,
            "keywords": [],
            "key_phrases": [],
            "summary": "",
            "rationale": f"Failed to get analysis: {e}",
        }


def _analyze_relevance_with_gpt(
    client: OpenAI, model: str, question: str, answer: str
) -> dict:
    system = (
        "You are a strict relevance judge. Score ONLY how relevant the ANSWER is to the QUESTION.\n"
        "Ignore style/grammar/factual detail beyond topical fit.\n"
        "Scoring: 0–100 (integers). 0 = totally irrelevant; 100 = perfectly addresses the question.\n"
        "Be brief and to the point.\n"
        "Output policy (STRICT):\n"
        "- matched_points: up to 5 bullet fragments, each 2–6 words.\n"
        "- missed_points: up to 5 bullet fragments, each 2–6 words.\n"
        "- rationale: ≤ 35 words explaining the score.\n"
        "- JSON ONLY with keys: relevance_score, matched_points, missed_points, rationale."
    )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"QUESTION:\n{question}\n\nANSWER:\n{answer}"},
    ]

    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    raw = resp.choices[0].message.content if resp.choices else "{}"
    data = json.loads(raw or "{}")

    try:
        score = int(data.get("relevance_score", 0))
    except Exception:
        score = 0
    score = max(0, min(100, score))

    return {
        "relevance_score": score,
        "matched_points": [s for s in (data.get("matched_points") or []) if isinstance(s, str)][:5],
        "missed_points": [s for s in (data.get("missed_points") or []) if isinstance(s, str)][:5],
        "rationale": str(data.get("rationale", ""))[:300],
    }


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
    rec = a.model_dump()
    rec["date"] = _to_iso_z(rec.get("date", datetime.now(timezone.utc)))
    body = json.dumps(rec, ensure_ascii=False, separators=(",", ":"))
    with ATTEMPTS_LOCK:
        with p.open("a", encoding="utf-8", newline="\n") as f:
            f.write(body + "\n")
            f.flush()
            os.fsync(f.fileno())


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
    return out[::-1][:limit]


def _rewrite_attempts_jsonl(transform: Callable[[dict], Optional[dict]]) -> int:
    p = attempts_path()
    if not p.exists():
        return 0
    tmp = p.with_suffix(".tmp")
    count = 0
    with ATTEMPTS_LOCK:
        with p.open("r", encoding="utf-8") as fin, tmp.open(
            "w", encoding="utf-8", newline="\n"
        ) as fout:
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
                    if "date" in new_rec:
                        new_rec["date"] = _to_iso_z(new_rec["date"])
                    else:
                        new_rec["date"] = _to_iso_z(datetime.now(timezone.utc))
                    fout.write(
                        json.dumps(new_rec, ensure_ascii=False, separators=(",", ":"))
                        + "\n"
                    )
                    count += 1
            fout.flush()
            os.fsync(fout.fileno())
        _replace_with_retry(tmp, p)
    return count


def _etag_json(request: Request, data: Any, max_age: int = 30) -> Response:
    body = json.dumps(jsonable_encoder(data), separators=(",", ":"), default=str)
    etag = '"' + hashlib.sha1(body.encode("utf-8")).hexdigest() + '"'
    inm = request.headers.get("if-none-match")
    headers = {"ETag": etag, "Cache-Control": f"public, max-age={max_age}"}
    if inm == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


# -------------------- Transcripts (JSONL) --------------------
def transcripts_path() -> Path:
    return (_root() / "data" / "transcripts.jsonl").resolve()


class Transcript(BaseModel):
    id: str
    filename: str
    original_filename: str
    content_type: str
    size_bytes: int
    transcript: str
    created: datetime
    question_id: Optional[str] = None


TRANSCRIPTS_LOCK = threading.Lock()


def _append_transcript_jsonl(t: Transcript) -> None:
    p = transcripts_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    rec = t.model_dump()
    rec["created"] = _to_iso_z(rec["created"])
    body = json.dumps(rec, ensure_ascii=False, separators=(",", ":"))
    with TRANSCRIPTS_LOCK:
        with p.open("a", encoding="utf-8", newline="\n") as f:
            f.write(body + "\n")
            f.flush()
            os.fsync(f.fileno())


def _read_transcripts_jsonl(limit: int = 500) -> List[Transcript]:
    p = transcripts_path()
    out: List[Transcript] = []
    if not p.exists():
        return out
    with p.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                out.append(
                    Transcript(
                        id=rec.get("id", ""),
                        filename=rec.get("filename", ""),
                        original_filename=rec.get("original_filename", ""),
                        content_type=rec.get("content_type", ""),
                        size_bytes=rec.get("size_bytes", 0),
                        transcript=rec.get("transcript", ""),
                        created=_parse_dt(rec.get("created"))
                        or datetime.now(timezone.utc),
                        question_id=rec.get("question_id"),
                    )
                )
            except Exception:
                continue
    return out[::-1][:limit]


# -------------------- Analysis (JSONL) --------------------
def analysis_path() -> Path:
    return (_root() / "data" / "analysis.jsonl").resolve()


class AnalysisRecord(BaseModel):
    id: str
    session_id: str
    text_hash: str
    model: str
    score: int
    keywords: list[str]
    key_phrases: list[str]
    summary: str
    rationale: str
    created: datetime


ANALYSIS_LOCK = threading.Lock()


def _append_analysis_jsonl(a: AnalysisRecord) -> None:
    p = analysis_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    rec = a.model_dump()
    rec["created"] = _to_iso_z(rec["created"])
    body = json.dumps(rec, ensure_ascii=False, separators=(",", ":"))
    with ANALYSIS_LOCK:
        with p.open("a", encoding="utf-8", newline="\n") as f:
            f.write(body + "\n")
            f.flush()
            os.fsync(f.fileno())


def _read_analysis_jsonl(
    limit: int = 500, session_id: str | None = None
) -> list[AnalysisRecord]:
    p = analysis_path()
    out: list[AnalysisRecord] = []
    if not p.exists():
        return out
    with p.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if session_id and rec.get("session_id") != session_id:
                    continue
                out.append(
                    AnalysisRecord(
                        id=rec.get("id", ""),
                        session_id=rec.get("session_id", ""),
                        text_hash=rec.get("text_hash", ""),
                        model=rec.get("model", ""),
                        score=int(rec.get("score", 0)),
                        keywords=rec.get("keywords", []) or [],
                        key_phrases=rec.get("key_phrases", []) or [],
                        summary=rec.get("summary", ""),
                        rationale=rec.get("rationale", ""),
                        created=_parse_dt(rec.get("created"))
                        or datetime.now(timezone.utc),
                    )
                )
            except Exception:
                continue
    return out[::-1][:limit]


# -------------------- Error handlers --------------------
@app.exception_handler(ValidationError)
async def on_validation_error(_: Request, exc: ValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "message": "Validation failed"},
    )


@app.exception_handler(Exception)
async def on_unhandled(_: Request, exc: Exception):
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
@app.get(
    "/roles",
    response_model=List[str],
    tags=["questions"],
    dependencies=[Depends(rl_read_dep)],
)
def roles(request: Request):
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
    hot_reload_if_changed()
    bank = _filtered_bank(role, difficulty)
    if shuffle:
        bank = bank[:]
        rng = random.Random(seed)
        rng.shuffle(bank)
    end = min(offset + limit, len(bank))
    return _etag_json(request, bank[offset:end], max_age=30)


@app.get(
    "/question/next",
    response_model=Question,
    tags=["questions"],
    dependencies=[Depends(rl_read_dep)],
)
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


@app.get(
    "/questions/random",
    response_model=Question,
    tags=["questions"],
    dependencies=[Depends(rl_read_dep)],
)
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


# -------------------- Search --------------------
@app.get(
    "/search",
    response_model=List[Question],
    tags=["search"],
    dependencies=[Depends(rl_read_dep)],
)
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
        item
        for item in haystack
        if ql in (item.text or "").lower() or ql in (item.topic or "").lower()
    ]
    return results[:limit]


# -------------------- Attempts Endpoints --------------------
@app.get(
    "/attempts",
    response_model=List[Attempt],
    tags=["attempts"],
    dependencies=[Depends(rl_read_dep)],
)
def get_attempts(
    role: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    return _read_attempts_jsonl(limit=limit, role=role)


@app.get("/attempts/export", tags=["attempts"], dependencies=[Depends(rl_read_dep)])
def export_attempts(role: Optional[str] = Query(None)):
    items = _read_attempts_jsonl(limit=10_000, role=role)

    def iter_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "role", "score", "duration_min", "date", "difficulty"])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        for it in items:
            writer.writerow(
                [
                    it.id,
                    it.role,
                    it.score,
                    it.duration_min,
                    _to_iso_z(getattr(it, "date", "")),
                    it.difficulty or "",
                ]
            )
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    headers = {"Content-Disposition": 'attachment; filename="attempts.csv"'}
    return StreamingResponse(iter_csv(), media_type="text/csv", headers=headers)


@app.get(
    "/attempts/{attempt_id}",
    response_model=Attempt,
    tags=["attempts"],
    dependencies=[Depends(rl_read_dep)],
)
def get_attempt_by_id(attempt_id: UUID):
    aid = str(attempt_id)
    items = _read_attempts_jsonl(limit=10_000)
    for a in items:
        if a.id == aid:
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
    if payload.role not in QUESTIONS:
        raise HTTPException(status_code=400, detail="Unknown role")
    if payload.difficulty and payload.difficulty not in {"easy", "medium", "hard"}:
        raise HTTPException(status_code=400, detail="Invalid difficulty")
    attempt = Attempt(
        id=str(uuid.uuid4()),
        role=payload.role,
        score=payload.score,
        duration_min=payload.duration_min,
        date=payload.date or datetime.now(timezone.utc),
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
def delete_attempt(attempt_id: UUID):
    aid = str(attempt_id)
    found = False

    def transform(rec: dict):
        nonlocal found
        if isinstance(rec, dict) and rec.get("id") == aid:
            found = True
            return None
        return rec

    _rewrite_attempts_jsonl(transform)
    if not found:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return {"ok": True, "deleted": 1, "id": aid}


@app.patch(
    "/attempts/{attempt_id}",
    response_model=Attempt,
    tags=["attempts"],
    dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)],
)
def update_attempt(attempt_id: UUID, patch: AttemptUpdate):
    aid = str(attempt_id)
    updated: Optional[Attempt] = None

    def transform(rec: dict):
        nonlocal updated
        if not isinstance(rec, dict) or rec.get("id") != aid:
            return rec
        role = patch.role if patch.role is not None else rec.get("role")
        if role not in QUESTIONS:
            role = rec.get("role")
        score = patch.score if patch.score is not None else rec.get("score")
        duration_min = (
            patch.duration_min
            if patch.duration_min is not None
            else rec.get("duration_min")
        )
        date_val = patch.date if patch.date is not None else rec.get("date")
        difficulty = (
            patch.difficulty if patch.difficulty is not None else rec.get("difficulty")
        )
        if difficulty and difficulty not in {"easy", "medium", "hard"}:
            difficulty = rec.get("difficulty")

        new_rec = {
            "id": aid,
            "role": role,
            "score": score,
            "duration_min": duration_min,
            "date": _to_iso_z(date_val),
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


# -------------------- Transcripts Endpoints --------------------
@app.get(
    "/transcripts",
    response_model=List[Transcript],
    tags=["audio"],
    dependencies=[Depends(rl_read_dep)],
)
def list_transcripts(limit: int = Query(100, ge=1, le=1000)):
    return _read_transcripts_jsonl(limit=limit)


@app.get(
    "/transcripts/{tid}",
    response_model=Transcript,
    tags=["audio"],
    dependencies=[Depends(rl_read_dep)],
)
def get_transcript(tid: str):
    items = _read_transcripts_jsonl(limit=10_000)
    for t in items:
        if t.id == tid:
            return t
    raise HTTPException(status_code=404, detail="Transcript not found")


# -------------------- Analysis Endpoints --------------------
class AnalyzeIn(BaseModel):
    text: str
    context: str | None = None
    session_id: str | None = None
    model: str | None = None


@app.post(
    "/api/analyze",
    tags=["analysis"],
    dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)],
)
def api_analyze(payload: AnalyzeIn):
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="Missing 'text'")

    api_key = (settings.OPENAI_API_KEY or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500, detail="OPENAI_API_KEY is missing on the server"
        )

    analyze_model = (
        payload.model
        or os.environ.get("OPENAI_ANALYZE_MODEL")
        or "gpt-4o-mini"
    ).strip()
    client = OpenAI(api_key=api_key)

    data = _analyze_text_with_gpt(
        client, analyze_model, payload.text, payload.context
    )

    aid = str(uuid.uuid4())
    rec = AnalysisRecord(
        id=aid,
        session_id=payload.session_id or "default",
        text_hash=_sha(payload.text),
        model=analyze_model,
        score=int(data["score"]),
        keywords=data["keywords"],
        key_phrases=data["key_phrases"],
        summary=data["summary"],          # concise summary
        rationale=data["rationale"],      # concise rationale for score
        created=datetime.now(timezone.utc),
    )
    _append_analysis_jsonl(rec)

    return {
        "ok": True,
        "id": aid,
        "session_id": rec.session_id,
        "score": rec.score,
        "keywords": rec.keywords,
        "key_phrases": rec.key_phrases,
        "summary": rec.summary,
        "rationale": rec.rationale,
        "model": rec.model,
        "created": _to_iso_z(rec.created),
    }


@app.get(
    "/analysis",
    response_model=List[AnalysisRecord],
    tags=["analysis"],
    dependencies=[Depends(rl_read_dep)],
)
def list_analysis(limit: int = Query(100, ge=1, le=1000), session_id: str | None = None):
    return _read_analysis_jsonl(limit=limit, session_id=session_id)


@app.get(
    "/analysis/{aid}",
    response_model=AnalysisRecord,
    tags=["analysis"],
    dependencies=[Depends(rl_read_dep)],
)
def get_analysis(aid: str):
    items = _read_analysis_jsonl(limit=10_000)
    for i in items:
        if i.id == aid:
            return i
    raise HTTPException(status_code=404, detail="Analysis not found")


# -------------------- Content Analysis (strict relevance) --------------------
class ContentAnalyzeRequest(BaseModel):
    question: str
    answer_transcript: str
    session_id: str | None = None
    model: str | None = None


@app.post(
    "/api/analyze_content",
    tags=["analysis"],
    dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)],
)
def api_analyze_content(payload: ContentAnalyzeRequest):
    q = (payload.question or "").strip()
    a = (payload.answer_transcript or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Missing 'question'")
    if not a:
        raise HTTPException(status_code=400, detail="Missing 'answer_transcript'")

    api_key = (settings.OPENAI_API_KEY or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500, detail="OPENAI_API_KEY is missing on the server"
        )
    analyze_model = (
        payload.model
        or os.environ.get("OPENAI_ANALYZE_MODEL")
        or "gpt-4o-mini"
    ).strip()

    client = OpenAI(api_key=api_key)

    try:
        data = _analyze_relevance_with_gpt(client, analyze_model, q, a)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Analysis failed: {e}")

    # Persist as AnalysisRecord; reuse 'score' for relevance_score
    aid = str(uuid.uuid4())
    rec = AnalysisRecord(
        id=aid,
        session_id=payload.session_id or "default",
        text_hash=_sha(q + "\n" + a),
        model=analyze_model,
        score=int(data["relevance_score"]),
        keywords=[],
        key_phrases=[],
        summary=data["rationale"],  # brief reasoning stored as summary
        rationale="; ".join(data["matched_points"] + data["missed_points"])[:4000],
        created=datetime.now(timezone.utc),
    )
    _append_analysis_jsonl(rec)

    return {
        "ok": True,
        "id": aid,
        "session_id": rec.session_id,
        "model": analyze_model,
        "relevance_score": data["relevance_score"],
        "matched_points": data["matched_points"],
        "missed_points": data["missed_points"],
        "rationale": data["rationale"],   # short, to the point
        "created": _to_iso_z(rec.created),
    }


# -------------------- Stats --------------------
@app.get("/stats", tags=["stats"], dependencies=[Depends(rl_read_dep)])
def stats():
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


# -------------------- Audio / Transcription --------------------
@app.post(
    "/api/transcribe",
    tags=["audio"],
    dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)],
)
async def api_transcribe(request: Request, file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=400, detail=f"File must be audio/*, got {file.content_type!r}"
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    uploads_dir = _root() / "data" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "").suffix
    if not ext:
        ext = mimetypes.guess_extension(file.content_type or "") or ".bin"

    fname = (
        f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid.uuid4().hex}{ext}"
    )
    out_path = uploads_dir / fname
    with out_path.open("wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())

    api_key = (settings.OPENAI_API_KEY or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500, detail="OPENAI_API_KEY is missing on the server"
        )

    model = (settings.OPENAI_TRANSCRIBE_MODEL or "whisper-1").strip()

    buf = io.BytesIO(data)
    buf.name = file.filename or f"audio{ext}"

    try:
        client = OpenAI(api_key=api_key)
        result = client.audio.transcriptions.create(
            model=model,
            file=buf,
        )
        transcript_text = getattr(result, "text", "") or ""
    except openai.AuthenticationError as e:
        raise HTTPException(status_code=500, detail=f"OpenAI auth failed: {e}") from e
    except openai.RateLimitError as e:
        msg = getattr(e, "message", str(e))
        if "insufficient_quota" in msg or "quota" in msg.lower():
            raise HTTPException(
                status_code=429, detail=f"OpenAI quota exceeded: {msg}"
            )
        raise HTTPException(status_code=429, detail=f"OpenAI rate limit: {msg}")
    except openai.APIConnectionError as e:
        raise HTTPException(
            status_code=502, detail=f"OpenAI connection error: {e}"
        ) from e
    except openai.APIError as e:
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {e}") from e
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"OpenAI transcription failed: {e}"
        ) from e

    tid = str(uuid.uuid4())
    _append_transcript_jsonl(
        Transcript(
            id=tid,
            filename=fname,
            original_filename=(getattr(file, "filename", None) or fname),
            content_type=(getattr(file, "content_type", None) or "audio/*"),
            size_bytes=len(data),
            transcript=transcript_text,
            created=datetime.now(timezone.utc),
            question_id=request.query_params.get("question_id"),
        )
    )

    return {
        "ok": True,
        "id": tid,
        "filename": fname,
        "size_bytes": len(data),
        "content_type": file.content_type,
        "transcript": transcript_text,
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
            date=datetime.now(timezone.utc),
            difficulty=rng.choice(["easy", "medium", "hard"]),
        )
        _append_attempt_jsonl(attempt)
        created += 1
    return {"ok": True, "created": created}
