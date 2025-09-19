from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import uuid
from .deps import require_trainer

router = APIRouter(prefix="/trainer", tags=["trainer"])

QUESTIONS: dict[str, dict] = {}  # id -> question

class Question(BaseModel):
  id: str
  role: str
  text: str
  topic: Optional[str] = None
  difficulty: Optional[str] = None

class QuestionCreate(BaseModel):
  role: str
  text: str
  topic: Optional[str] = None
  difficulty: Optional[str] = None

class QuestionPatch(BaseModel):
  role: Optional[str] = None
  text: Optional[str] = None
  topic: Optional[str] = None
  difficulty: Optional[str] = None

@router.get("/questions", response_model=List[Question])
def list_questions(role: Optional[str]=None, topic: Optional[str]=None, difficulty: Optional[str]=None, _t=Depends(require_trainer)):
  rows = list(QUESTIONS.values())
  if role: rows = [q for q in rows if q["role"] == role]
  if topic: rows = [q for q in rows if (q.get("topic") or "") == topic]
  if difficulty: rows = [q for q in rows if (q.get("difficulty") or "") == difficulty]
  return [Question(**q) for q in rows]

@router.post("/questions", response_model=Question)
def create_question(q: QuestionCreate, _t=Depends(require_trainer)):
  qid = str(uuid.uuid4())
  rec = {"id": qid, **q.model_dump()}
  QUESTIONS[qid] = rec
  return Question(**rec)

@router.patch("/questions/{qid}", response_model=Question)
def update_question(qid: str, patch: QuestionPatch, _t=Depends(require_trainer)):
  if qid not in QUESTIONS: raise HTTPException(404, "Not found")
  QUESTIONS[qid].update({k:v for k,v in patch.model_dump().items() if v is not None})
  return Question(**QUESTIONS[qid])

@router.delete("/questions/{qid}")
def delete_question(qid: str, _t=Depends(require_trainer)):
  if qid not in QUESTIONS: raise HTTPException(404, "Not found")
  del QUESTIONS[qid]
  return {"ok": True, "id": qid}
