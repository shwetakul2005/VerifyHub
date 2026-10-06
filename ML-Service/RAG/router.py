"""
FastAPI router for the Policy Assistant. Mount this into your existing
ML-Service app (see README.md for the one-line integration).
"""

from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


router = APIRouter(prefix="/rag", tags=["Policy Assistant (RAG)"])


class QueryRequest(BaseModel):
    question: str


class QueryResponse(BaseModel):
    answer: str
    sources: List[str]


@router.post("/query", response_model=QueryResponse)
def query_policy(request: QueryRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        from .qa_chain import answer_question
        result = answer_question(request.question)
    except RuntimeError:
        # Index not built yet
        raise HTTPException(status_code=503, detail="Policy index is not ready.")
    except Exception:
        raise HTTPException(status_code=500, detail="Policy lookup failed.")

    return QueryResponse(**result)
