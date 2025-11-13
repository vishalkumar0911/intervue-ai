# backend/app/main.py
from __future__ import annotations

import logging
import contextvars
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
from typing import Any, Callable, Dict, List, Tuple, Optional, Literal
from uuid import UUID

# NEW: Added imports for AI/Audio features
import mimetypes
import openai
from openai import OpenAI
from pydantic import BaseModel # <--- FIX: Corrected pantic to pydantic

# NEW: Import resume parsing libraries
try:
    import docx
except ImportError:
    docx = None
try:
    from pdfminer.high_level import extract_text as extract_pdf_text
except ImportError:
    extract_pdf_text = None

from app.models import Question, AttemptCreate, Attempt, AttemptUpdate
from fastapi import (
    APIRouter,  # <--- FIX: Added APIRouter here
    Body,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    File,
    UploadFile,
    Form,
)
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from starlette.middleware.gzip import GZipMiddleware

# NEW: import extra routers (files you added)
from app.routes_admin import router as admin_router, public_router as admin_public_router
from app.routes_trainer import router as trainer_router

# -------------------- Settings --------------------
class Settings(BaseSettings):
    """Typed env with sane defaults. Extra keys are ignored (no crashes)."""

    # CORS: comma-separated list
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Optional overrides for data locations
    QUESTIONS_FILE: str = ""
    ATTEMPTS_FILE: str = ""

    # API key — when set, mutating + auth routes require it
    BACKEND_API_KEY: Optional[str] = None

    # Rate limit knobs (per IP)
    RL_READ_RATE: int = 60   # requests / minute
    RL_MUTATE_RATE: int = 20 # requests / minute

    # --- Merged Settings from 'main' branch ---
    # Used by auth/forgot/reset + JWT-bearing proxy calls
    APP_JWT_SECRET: Optional[str] = None
    FRONTEND_URL: str = "http://localhost:3000"
    RESET_TOKEN_EXPIRES_MIN: int = 30
    RESEND_API_KEY: Optional[str] = None
    EMAIL_FROM: Optional[str] = None
    
    # --- Merged Settings from 'feature/analytics' branch ---
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_TRANSCRIBE_MODEL: str = "whisper-1"
    OPENAI_ANALYZE_MODEL: str = "gpt-4o-mini" # Merged from 'openai_analyze_model'

    # DEV_MODE: when true, enable demo-only public endpoints (safe for local dev)
    DEV_MODE: str = "true"

    # pydantic-settings v2 config
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # don't crash if .env has keys not listed above
    )

settings = Settings()
print("[BOOT] BACKEND_API_KEY =", repr(settings.BACKEND_API_KEY))  # debug
print("[BOOT] FRONTEND_URL    =", repr(settings.FRONTEND_URL))     # debug
print("[BOOT] DEV_MODE        =", repr(settings.DEV_MODE))         # debug
# NEW: Check for resume parsing libraries
if docx is None:
    print("[BOOT] WARNING: 'python-docx' not installed. DOCX resume parsing will be disabled.")
if extract_pdf_text is None:
    print("[BOOT] WARNING: 'pdfminer.six' not installed. PDF resume parsing will be disabled.")

# -------------------- Logging --------------------
logger = logging.getLogger("intervue")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# correlation id context
REQUEST_ID: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

def _log_json(level: str, **fields):
    # small structured logger to print a JSON line
    try:
        payload = {"level": level, **fields}
        logger.log(logging.INFO if level in {"info","warning"} else logging.ERROR, json.dumps(payload))
    except Exception:
        # never let logging crash the request
        logger.warning("failed to serialize log line")

# -------------------- App --------------------
tags_metadata = [
    {"name": "health", "description": "Health and server info"},
    {"name": "questions", "description": "Interview questions"},
    {"name": "search", "description": "Search questions"},
    {"name": "attempts", "description": "Session attempts CRUD"},
    {"name": "stats", "description": "Aggregated statistics"},
    {"name": "auth", "description": "OAuth + password flows"},
    {"name": "dev", "description": "Developer utilities / seeders"},
    # NEW: Added tags
    {"name": "audio", "description": "Audio transcription"},
    {"name": "analysis", "description": "Text analysis"},
    {"name": "interview", "description": "NEW: Dynamic AI interview flow"}, # NEW TAG
]

app = FastAPI(
    title="Intervue.AI API",
    version="1.5.1",
    openapi_tags=tags_metadata,
)

# -------------------- Correlation-ID + access log middleware --------------------
@app.middleware("http")
async def add_request_id_and_log(request: Request, call_next):
    import time as _t, uuid as _uuid

    # get/propagate incoming X-Request-ID
    rid = request.headers.get("x-request-id") or str(_uuid.uuid4())
    REQUEST_ID.set(rid)

    start = _t.time()
    try:
        response = await call_next(request)
    finally:
        # compute timing & log after response is ready
        dur_ms = int((_t.time() - start) * 1000)
        client_ip = request.client.host if request.client else "unknown"
        # path without query for signal, but include query separately if you prefer
        path = request.url.path
        # Response might not exist if an exception bubbled to exception handler,
        # so grab status from scope if available
        status = getattr(locals().get("response", None), "status_code", None)

        _log_json(
            "info",
            event="http_access",
            request_id=rid,
            method=request.method,
            path=path,
            status=status,
            duration_ms=dur_ms,
            client_ip=client_ip,
        )

    # attach correlation id to the response
    response.headers["X-Request-ID"] = rid
    return response

# -------------------- CORS --------------------
def _split_csv(s: str) -> List[str]:
    return [o.strip() for o in (s or "").split(",") if o.strip()]

origins = _split_csv(settings.BACKEND_CORS_ORIGINS)
print("[BOOT] CORS origins     =", origins)  # debug

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,          # ✅ uses your env-provided origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],            # includes Authorization for Bearer tokens
)

# -------------------- Compression --------------------
app.add_middleware(GZipMiddleware, minimum_size=500)

# -------------------- Data loading --------------------
QUESTIONS: Dict[str, List[Question]] = {}
QUESTIONS_MTIME: float = 0.0

def _root() -> Path:
    return Path(__file__).resolve().parent.parent

def questions_path() -> Path:
    return Path(settings.QUESTIONS_FILE).resolve() if settings.QUESTIONS_FILE else (_root() / "data" / "questions.json").resolve()

def attempts_path() -> Path:
    return Path(settings.ATTEMPTS_FILE).resolve() if settings.ATTEMPTS_FILE else (_root() / "data" / "attempts.jsonl").resolve()

# NEW: Paths for audio/analysis data
def transcripts_path() -> Path:
    return (_root() / "data" / "transcripts.jsonl").resolve()

def analysis_path() -> Path:
    return (_root() / "data" / "analysis.jsonl").resolve()


def file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except Exception:
        return 0


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
    # Ensure all data dirs/files exist
    for p in [attempts_path(), transcripts_path(), analysis_path()]:
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists():
            p.touch()

# -------------------- Security & Rate limiting --------------------
# API key dependency (header OR ?api_key=...). If BACKEND_API_KEY is unset, it's open.
def require_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(default=None, alias="x-api-key"),
):
    expected = (settings.BACKEND_API_KEY or "").strip()
    if not expected:
        return  # open mode

    header_key = (
        x_api_key
        or request.headers.get("x-api-key")
        or request.headers.get("X-API-Key")
        or ""
    ).strip()
    if header_key == expected:
        return

    qp = (request.query_params.get("api_key") or "").strip()
    if qp == expected:
        return

    _log_json(
        "warning",
        event="auth_denied",
        reason="invalid_api_key",
        request_id=REQUEST_ID.get(),
        client_ip=(request.client.host if request.client else "unknown"),
        path=request.url.path,
    )
    raise HTTPException(status_code=401, detail="Invalid API key")

# per-IP sliding window limiter {ip -> deque[timestamps]}
_ip_hits_read: dict[str, deque[float]] = defaultdict(deque)
_ip_hits_mutate: dict[str, deque[float]] = defaultdict(deque)

def _rate_limit(request: Request, bucket: dict[str, deque[float]], rate: int, window: float = 60.0):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    dq = bucket[ip]
    while dq and now - dq[0] > window:
        dq.popleft()
    if len(dq) >= rate:
        _log_json(
            "warning",
            event="rate_limited",
            request_id=REQUEST_ID.get(),
            client_ip=ip,
            path=request.url.path,
            rate=rate,
            window_sec=window,
        )
        raise HTTPException(status_code=429, detail="Too many requests")
    dq.append(now)

def rl_read_dep(request: Request):
    _rate_limit(request, _ip_hits_read, settings.RL_READ_RATE)

def rl_mutate_dep(request: Request):
    _rate_limit(request, _ip_hits_mutate, settings.RL_MUTATE_RATE)

# --------- Bearer JWT helper (for user identity from proxy) ---------
# Use this in routers to know "who" called you: current_user_email(request)
import jwt  # PyJWT

def current_user_email(request: Request) -> Optional[str]:
    """Parse Authorization: Bearer <jwt> with APP_JWT_SECRET, return email or None."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    secret = settings.APP_JWT_SECRET
    if not secret:
        return None
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        # we standardize on "email" claim
        return payload.get("email") or payload.get("sub")
    except Exception:
        return None

# -------------------- Windows-safe IO helpers --------------------
ATTEMPTS_LOCK = threading.Lock()  # guard all writers

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

def _replace_with_retry(src: Path, dst: Path, attempts: int = 8, delay: float = 0.2) -> None:
    for i in range(attempts):
        try:
            os.replace(src, dst)  # atomic on same volume
            return
        except PermissionError:
            time.sleep(delay * (i + 1))
    os.replace(src, dst)

# NEW: sha helper
def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]

# -------------------- NEW: Resume Parsing Helpers --------------------
def _parse_resume_text(file: UploadFile) -> str:
    """Extracts text from PDF, DOCX, or TXT file."""
    content_type = file.content_type or ""
    filename = file.filename or ""
    
    try:
        if "pdf" in content_type or filename.endswith(".pdf"):
            if extract_pdf_text:
                pdf_data = file.file.read()
                return extract_pdf_text(io.BytesIO(pdf_data))
            else:
                return "[PDF parsing disabled: 'pdfminer.six' not installed]"
        
        elif "openxmlformats-officedocument.wordprocessingml.document" in content_type or filename.endswith(".docx"):
            if docx:
                doc = docx.Document(file.file)
                return "\n".join([para.text for para in doc.paragraphs if para.text])
            else:
                return "[DOCX parsing disabled: 'python-docx' not installed]"
        
        elif "text/plain" in content_type or filename.endswith(".txt"):
            return file.file.read().decode("utf-8")
            
        else:
            return f"[Unsupported resume file type: {content_type}]"
    except Exception as e:
        return f"[Error parsing resume: {str(e)}]"
    finally:
        file.file.seek(0) # Reset file pointer in case it's read again

# -------------------- NEW: GPT helpers --------------------

# NEW: Helper to get the OpenAI client
def _get_openai_client() -> OpenAI:
    api_key = (settings.OPENAI_API_KEY or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500, detail="OPENAI_API_KEY is missing on the server"
        )
    return OpenAI(api_key=api_key)

# NEW: Helper for AI JSON responses
def _call_ai(client: OpenAI, model: str, messages: List[Dict[str, str]], timeout: int = 20_000) -> Dict[str, Any]:
    """Calls OpenAI and returns the parsed JSON response."""
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.2, # Allow for slight creativity
            timeout=timeout,
        )
        raw = resp.choices[0].message.content if resp.choices else "{}"
        return json.loads(raw or "{}")
    except openai.AuthenticationError as e:
        raise HTTPException(status_code=501, detail=f"OpenAI auth failed: {e}")
    except openai.RateLimitError as e:
        msg = getattr(e, "message", str(e))
        if "insufficient_quota" in msg or "quota" in msg.lower():
            raise HTTPException(status_code=429, detail=f"OpenAI quota exceeded: {msg}")
        raise HTTPException(status_code=429, detail=f"OpenAI rate limit: {msg}")
    except openai.APIConnectionError as e:
        raise HTTPException(status_code=502, detail=f"OpenAI connection error: {e}")
    except openai.APITimeoutError:
        raise HTTPException(status_code=504, detail="OpenAI request timed out")
    except openai.APIError as e:
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")


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

    data = _call_ai(client, model, messages)

    return {
        "score": int(max(0, min(100, int(data.get("score", 0))))),
        "keywords": [k for k in (data.get("keywords") or []) if isinstance(k, str)][:8],
        "key_phrases": [k for k in (data.get("key_phrases") or []) if isinstance(k, str)][:8],
        "summary": str(data.get("summary", ""))[:400],
        "rationale": str(data.get("rationale", ""))[:400],
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
        "- rationale: ≤ 35 words explaining the score. This is the 'review'.\n"
        "- JSON ONLY with keys: relevance_score, matched_points, missed_points, rationale."
    )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"QUESTION:\n{question}\n\nANSWER:\n{answer}"},
    ]

    data = _call_ai(client, model, messages)
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
    return out[::-1][:limit]  # most recent first

def _rewrite_attempts_jsonl(transform: Callable[[dict], Optional[dict]]) -> int:
    p = attempts_path()
    if not p.exists():
        return 0
    tmp = p.with_suffix(".tmp")
    count = 0
    with ATTEMPTS_LOCK:
        with p.open("r", encoding="utf-8") as fin, tmp.open("w", encoding="utf-8", newline="\n") as fout:
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
                    fout.write(json.dumps(new_rec, ensure_ascii=False, separators=(",", ":")) + "\n")
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

# -------------------- NEW: Transcripts (JSONL) --------------------
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


# -------------------- NEW: Analysis (JSONL) --------------------
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
    # NEW: Store the question and answer for the report page
    question_text: Optional[str] = None
    answer_transcript: Optional[str] = None


ANALYSIS_LOCK = threading.Lock()


def _append_analysis_jsonl(a: AnalysisRecord) -> None:
    p = analysis_path()
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
                        question_text=rec.get("question_text"), # NEW
                        answer_transcript=rec.get("answer_transcript"), # NEW
                    )
                )
            except Exception:
                continue
    return out[::-1][:limit]


def _coerce_grouped_questions(raw: Any) -> Dict[str, List[Dict[str, Any]]]:
    """
    Accept either:
      - grouped dict: { "Role": [ {..}, ... ], ... }
      - legacy flat list: [ { role: "Role", ... }, ... ]
    and return grouped dict with role filled.
    """
    if isinstance(raw, dict):
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for role, arr in raw.items():
            bucket: List[Dict[str, Any]] = []
            if isinstance(arr, list):
                for it in arr:
                    if not isinstance(it, dict):
                        continue
                    q = dict(it)
                    q["role"] = role
                    bucket.append(q)
            grouped[str(role)] = bucket
        return grouped

    if isinstance(raw, list):
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for it in raw:
            if not isinstance(it, dict):
                continue
            q = dict(it)
            role = (q.get("role") or "Uncategorized")
            q["role"] = role
            grouped.setdefault(str(role), []).append(q)
        return grouped

    return {}


def load_questions_from_disk() -> None:
    """
    Load questions from disk and tolerate both grouped and legacy flat shapes.
    Keeps the in-memory QUESTIONS as {role: List[Question]}.
    """
    global QUESTIONS, QUESTIONS_MTIME
    path = questions_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        QUESTIONS = {}
        QUESTIONS_MTIME = 0.0
        return

    grouped = _coerce_grouped_questions(raw)
    # Coerce each item into the Pydantic Question model
    QUESTIONS = {
        role: [Question(**q) for q in (arr or []) if isinstance(q, dict)]
        for role, arr in grouped.items()
    }
    QUESTIONS_MTIME = path.stat().st_mtime

# -------------------- Error handlers --------------------
@app.exception_handler(ValidationError)
async def on_validation_error(_: Request, exc: ValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors(), "message": "Validation failed"})

@app.exception_handler(Exception)
async def on_unhandled(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        # let FastAPI handle HTTPExceptions normally
        raise exc
    _log_json(
        "error",
        event="unhandled_exception",
        request_id=REQUEST_ID.get(),
        path=str(request.url.path),
        message=str(exc),
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error", "message": str(exc)})

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

# Put export BEFORE dynamic routes to avoid shadowing.
@app.get("/attempts/export", tags=["attempts"], dependencies=[Depends(rl_read_dep)])
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

@app.get("/attempts/{attempt_id}", response_model=Attempt, tags=["attempts"], dependencies=[Depends(rl_read_dep)])
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
    """
    Create a new attempt; server assigns id and default date if missing.
    Additional guards:
      - non-empty role (after trim)
      - role must exist in current QUESTIONS bank
      - difficulty, if present, must be one of easy|medium|hard
      - duration_min enforced by Pydantic (1..240)
    """
    role = (payload.role or "").strip()
    if not role:
        # Will typically be caught by Pydantic 422, but keep explicit guard for clarity.
        raise HTTPException(status_code=422, detail="Role is required")

    hot_reload_if_changed() # NEW: ensure roles are loaded
    if role not in QUESTIONS:
        raise HTTPException(status_code=400, detail="Unknown role")

    if payload.difficulty and payload.difficulty not in {"easy", "medium", "hard"}:
        raise HTTPException(status_code=400, detail="Invalid difficulty")

    attempt = Attempt(
        id=str(uuid.uuid4()),
        role=role,
        score=payload.score,
        duration_min=payload.duration_min,
        date=payload.date or datetime.now(timezone.utc),  # timezone-aware UTC
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
    """Delete an attempt by id.""" 
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
    """Patch fields of an attempt; ignores invalid field values gracefully."""
    aid = str(attempt_id)
    updated: Optional[Attempt] = None
    
    hot_reload_if_changed() # NEW: ensure roles are loaded

    def transform(rec: dict):
        nonlocal updated
        if not isinstance(rec, dict) or rec.get("id") != aid:
            return rec
        role = patch.role if patch.role is not None else rec.get("role")
        if role not in QUESTIONS:
            role = rec.get("role")
        score = patch.score if patch.score is not None else rec.get("score")
        duration_min = patch.duration_min if patch.duration_min is not None else rec.get("duration_min")
        date_val = patch.date if patch.date is not None else rec.get("date")
        difficulty = patch.difficulty if patch.difficulty is not None else rec.get("difficulty")
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

# -------------------- NEW: Transcripts Endpoints --------------------
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


# -------------------- NEW: Analysis Endpoints --------------------
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

    client = _get_openai_client()
    analyze_model = (
        payload.model
        or settings.OPENAI_ANALYZE_MODEL
        or "gpt-4o-mini"
    ).strip()

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
        question_text=payload.context, # NEW: Store context as question
        answer_transcript=payload.text, # NEW: Store text as answer
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


# -------------------- NEW: Content Analysis (strict relevance) --------------------
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

    client = _get_openai_client()
    analyze_model = (
        payload.model
        or settings.OPENAI_ANALYZE_MODEL
        or "gpt-4o-mini"
    ).strip()

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
        keywords=[], # Not generated by this prompt
        key_phrases=[], # Not generated by this prompt
        summary=data["rationale"],  # brief reasoning stored as summary
        # Store matched/missed in rationale
        rationale=f"Matched: {'; '.join(data['matched_points'])}. Missed: {'; '.join(data['missed_points'])}",
        created=datetime.now(timezone.utc),
        question_text=q, # NEW: Store the question
        answer_transcript=a, # NEW: Store the answer
    )
    _append_analysis_jsonl(rec)

    # Return all fields from the saved AnalysisRecord
    # This ensures the frontend gets the data for the report page
    return rec.model_dump()


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

# -------------------- NEW: Audio / Transcription --------------------
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

    client = _get_openai_client()
    model = (settings.OPENAI_TRANSCRIBE_MODEL or "whisper-1").strip()

    buf = io.BytesIO(data)
    buf.name = file.filename or f"audio{ext}"

    try:
        result = client.audio.transcriptions.create(
            model=model,
            file=buf,
        )
        transcript_text = getattr(result, "text", "") or ""
    except Exception as e:
        # Clean up the saved file if transcription fails
        try:
            out_path.unlink()
        except Exception:
            pass # non-fatal
        
        # Re-raise as specific HTTPExceptions
        if isinstance(e, openai.AuthenticationError):
            raise HTTPException(status_code=500, detail=f"OpenAI auth failed: {e}")
        if isinstance(e, openai.RateLimitError):
            msg = getattr(e, "message", str(e))
            if "insufficient_quota" in msg or "quota" in msg.lower():
                raise HTTPException(status_code=429, detail=f"OpenAI quota exceeded: {msg}")
            raise HTTPException(status_code=429, detail=f"OpenAI rate limit: {msg}")
        if isinstance(e, openai.APIConnectionError):
            raise HTTPException(status_code=502, detail=f"OpenAI connection error: {e}")
        if isinstance(e, openai.APIError):
            raise HTTPException(status_code=502, detail=f"OpenAI API error: {e}")
        
        raise HTTPException(
            status_code=500, detail=f"OpenAI transcription failed: {e}"
        )

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

# -------------------- Auth / Password routers (existing) --------------------
from app.routers import password
from app.routers.auth import router as oauth_router
from app.routers.local_auth import router as local_auth_router

# Guard these with API key + mutate limiter
app.include_router(password.router,    dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)])
app.include_router(oauth_router,       dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)])
app.include_router(local_auth_router,  dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)])

# -------------------- Role/OAuth + Admin + Trainer routers (EXISTING) ------------
# Protect them in the same way (API key + mutate limiter)
app.include_router(admin_router,   dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)])
app.include_router(trainer_router, dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)])

# -------------------- NEW: Interview Router --------------------
interview_router = APIRouter(
    prefix="/interview",
    tags=["interview"],
    dependencies=[Depends(require_api_key), Depends(rl_mutate_dep)],
)

@interview_router.post("/start")
async def interview_start(
    role: str = Form(...),
    interview_type: Literal["technical", "hr"] = Form(...),
    resume_file: UploadFile = File(...),
):
    """
    MODIFIED: Starts a new interview.
    Parses resume, calls AI for a FULL LIST of questions.
    """
    client = _get_openai_client()
    model = settings.OPENAI_ANALYZE_MODEL
    
    # 1. Parse Resume
    resume_text = _parse_resume_text(resume_file)
    if resume_text.startswith("["): # Check for parsing errors
        _log_json("warning", event="interview_start.resume_parse_failed", error=resume_text)
        # Proceed anyway, just with less context
        resume_text = f"Resume could not be parsed ({resume_text})."

    # 2. Generate Session ID
    session_id = str(uuid.uuid4())
    
    # 3. Call AI for a *list* of questions
    # MODIFIED PROMPT: Asks for a list of 5 questions.
    system_prompt = (
        "You are an expert interviewer for a '{role}' position. "
        "You are conducting a '{interview_type}' interview. "
        "The candidate's resume is attached. "
        "Your task is to generate a full list of 5 interview questions. "
        "The questions should be relevant to the role and the resume, starting with an introduction. "
        "Go 2 levels deep on a topic, then move to another. Also talk about projects/certifications. "
        "Classify each question as 'short' (e.g., definition) or 'long' (e.g., behavioral, design). "
        "You MUST respond in the following JSON format: "
        '{{"questions": [ {{"id": "...", "role": "...", "text": "...", "question_type": "short" | "long"}} ]}}'
    ).format(role=role, interview_type=interview_type)
    
    user_prompt = f"RESUME:\n{resume_text[:4000]}" # Truncate to avoid token limits

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    data = _call_ai(client, model, messages)
    
    # 4. Validate and return
    questions_data = data.get("questions", [])
    if not isinstance(questions_data, list) or not questions_data:
        _log_json("error", event="interview_start.ai_malformed_response", response=data)
        raise HTTPException(status_code=502, detail="AI failed to generate a valid question list.")

    # Validate and normalize the list of questions
    validated_questions = []
    for q_data in questions_data:
        if not isinstance(q_data, dict) or not q_data.get("text"):
            continue # Skip malformed question
            
        q_type = q_data.get("question_type")
        if q_type not in ["short", "long"]:
            q_type = "long" # Default to long

        validated_questions.append({
            "id": q_data.get("id") or str(uuid.uuid4()),
            "role": role,
            "text": q_data["text"],
            "question_type": q_type,
        })

    if not validated_questions:
        raise HTTPException(status_code=502, detail="AI failed to generate any valid questions.")

    return {
        "questions": validated_questions, # MODIFIED: Return full list
        "session_id": session_id,
    }

class InterviewNextIn(BaseModel):
    session_id: str
    history: List[Dict[str, Any]] # List of {question, transcript, analysis}
    role: str # Added role for context
    interview_type: Literal["technical", "hr"] # Added type for context

@interview_router.post("/next")
def interview_next(payload: InterviewNextIn):
    """
    DEPRECATED (but kept for compatibility).
    The new flow gets all questions from /start.
    This endpoint will just return an 'end' signal if called.
    """
    _log_json("warning", event="interview_next.deprecated", session_id=payload.session_id)
    return {
        "type": "end",
        "final_summary": "Interview flow has been updated. Please restart.",
        "session_id": payload.session_id,
        "question": {"id": "end", "role": payload.role, "text": "Flow updated.", "question_type": "short"}
    }

# NEW: Endpoint for batch analysis
class HistoryTurn(BaseModel):
    question_text: str
    answer_transcript: str

class GenerateReportIn(BaseModel):
    session_id: str
    history: List[HistoryTurn] # List of { question_text, answer_transcript }

@interview_router.post("/generate_report")
def interview_generate_report(payload: GenerateReportIn):
    """
    NEW: Analyzes the entire interview history in a single batch.
    Saves multiple AnalysisRecord objects and returns an overall summary.
    """
    client = _get_openai_client()
    model = settings.OPENAI_ANALYZE_MODEL
    
    if not payload.history:
        raise HTTPException(status_code=400, detail="Interview history is empty.")

    # 1. Format history for the AI prompt
    full_transcript = []
    for i, turn in enumerate(payload.history):
        full_transcript.append(f"Q{i+1}: {turn.question_text}")
        full_transcript.append(f"A{i+1}: {turn.answer_transcript}\n")
    
    history_text = "\n".join(full_transcript)

    # 2. Call AI for batch analysis
    system_prompt = (
        "You are an expert interview reviewer. "
        "Here is the full transcript of an interview. "
        "Your task is to provide a detailed review for *each* question and answer pair, "
        "and then an 'overall_summary' for the entire performance. "
        "You MUST respond in the following JSON format: "
        '{{'
        '  "overall_summary": "...", '
        '  "reviews": [ '
        '    {{ "question_text": "...", "answer_transcript": "...", "score": 0-100, "rationale": "...", "keywords": [], "key_phrases": [] }}, '
        '    ... '
        '  ] '
        '}}'
    )
    
    user_prompt = f"INTERVIEW TRANSCRIPT:\n{history_text}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # Use a longer timeout for batch analysis
    data = _call_ai(client, model, messages, timeout=60_000)

    # 3. Parse response and save analysis records
    overall_summary = data.get("overall_summary", "Analysis complete.")
    reviews = data.get("reviews", [])
    
    if not isinstance(reviews, list) or not reviews:
        _log_json("error", event="generate_report.ai_malformed_response", response=data)
        raise HTTPException(status_code=502, detail="AI failed to generate a valid report.")

    for review in reviews:
        if not isinstance(review, dict):
            continue
            
        q_text = review.get("question_text", "Unknown Question")
        a_text = review.get("answer_transcript", "")
        
        # Find the original question text from history if AI omits it
        if q_text == "Unknown Question":
             for h in payload.history:
                if h.answer_transcript == a_text:
                    q_text = h.question_text
                    break

        rec = AnalysisRecord(
            id=str(uuid.uuid4()),
            session_id=payload.session_id,
            text_hash=_sha(q_text + "\n" + a_text),
            model=model,
            score=int(review.get("score", 0)),
            keywords=review.get("keywords", []),
            key_phrases=review.get("key_phrases", []),
            summary=review.get("rationale", "")[:300], # Use rationale as summary
            rationale=review.get("rationale", "No rationale provided."),
            created=datetime.now(timezone.utc),
            question_text=q_text,
            answer_transcript=a_text,
        )
        _append_analysis_jsonl(rec)

    return {"ok": True, "overall_summary": overall_summary}


# Include the new router
app.include_router(interview_router)

# -------------------- Public/dev-only endpoints --------------------
# Expose admin_public_router (contains /auth/role) for local/demo clients.
# This is deliberately NOT protected by the API key so signup/localStorage users can fetch role.
# Guard exposure with DEV_MODE environment variable: set DEV_MODE=false to disable.
if str(settings.DEV_MODE).lower() in {"", "1", "true", "yes", "on"}:
    app.include_router(admin_public_router)
    print("[BOOT] Included admin_public_router (dev-only public endpoints)")
else:
    print("[BOOT] Skipped admin_public_router (DEV_MODE disabled)")

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
    hot_reload_if_changed() # NEW: ensure roles are loaded
    rng = random.Random(seed)
    roles = [role] if (role and role in QUESTIONS) else sorted(QUESTIONS.keys()) or ["Frontend Developer"]
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