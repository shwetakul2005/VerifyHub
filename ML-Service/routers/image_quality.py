"""Versioned image-quality endpoints; scores describe usability only."""

from typing import Literal

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from services.image_quality import ImageInputError, MAX_FILE_BYTES, analyze_image_bytes

router = APIRouter(prefix="/v1/image-quality", tags=["Image Quality"])


class QualityCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str
    passed: bool
    score: float = Field(ge=0, le=1)


class QualityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal["1.0"]
    qualityVersion: Literal["image-quality-v1"]
    kind: Literal["document", "selfie"]
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    score: float = Field(ge=0, le=1)
    status: Literal["usable", "borderline", "unusable"]
    checks: list[QualityCheck]
    reasonCodes: list[str]


async def _analyze(file, kind):
    content = await file.read(MAX_FILE_BYTES + 1)
    try:
        return QualityResponse.model_validate(analyze_image_bytes(content, file.filename, file.content_type, kind))
    except ImageInputError as error:
        return JSONResponse(status_code=error.status_code, content={
            "code": error.code, "message": "The image file cannot be used."
        })


@router.post("/document", response_model=QualityResponse)
async def document_quality(file: UploadFile = File(...)):
    return await _analyze(file, "document")


@router.post("/selfie", response_model=QualityResponse)
async def selfie_quality(file: UploadFile = File(...)):
    return await _analyze(file, "selfie")
