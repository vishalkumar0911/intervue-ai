from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class Attempt(BaseModel):
    id: str
    role: str
    score: int
    date: datetime
    duration_min: int
