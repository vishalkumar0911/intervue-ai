# backend/app/models.py
from __future__ import annotations
from typing import Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field

# ---- Question ----
class Question(BaseModel):
    id: str
    role: str = Field(min_length=1)  # must be non-empty
    text: str = Field(min_length=1)  # must be non-empty
    topic: Optional[str] = None
    # keep optional; do not force default so "no difficulty" stays valid
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None

# ---- Attempts ----
class AttemptCreate(BaseModel):
    role: str = Field(min_length=1)
    score: int = Field(ge=0, le=100)
    # Enforce realistic range: 1..240 minutes
    duration_min: int = Field(ge=1, le=240)
    date: Optional[datetime] = None  # client may omit; server fills
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None

class Attempt(AttemptCreate):
    id: str
    date: datetime  # required after persistence

class AttemptUpdate(BaseModel):
    # Optional fields keep same constraints if provided
    role: Optional[str] = Field(default=None, min_length=1)
    score: Optional[int] = Field(default=None, ge=0, le=100)
    duration_min: Optional[int] = Field(default=None, ge=1, le=240)
    date: Optional[datetime] = None
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None
