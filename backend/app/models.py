from __future__ import annotations
from typing import Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field

# ---- Question ----
class Question(BaseModel):
    id: str
    role: str
    text: str
    topic: Optional[str] = None
    difficulty: Optional[Literal["easy", "medium", "hard"]] = "easy"

# ---- Attempts ----
class AttemptCreate(BaseModel):
    role: str
    score: int = Field(ge=0, le=100)
    duration_min: int = Field(ge=0)
    date: Optional[datetime] = None  # client may omit; server fills
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None

class Attempt(AttemptCreate):
    id: str
    date: datetime  # required after persistence

class AttemptUpdate(BaseModel):
    role: Optional[str] = None
    score: Optional[int] = Field(default=None, ge=0, le=100)
    duration_min: Optional[int] = Field(default=None, ge=0)
    date: Optional[datetime] = None
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None
