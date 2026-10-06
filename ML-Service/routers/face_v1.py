"""Versioned face-evidence endpoint with no liveness claim."""

import logging
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from routers.face_verification import _read_limited

router = APIRouter(prefix="/v1/face", tags=["Face Evidence"])
logger = logging.getLogger(__name__)


class FaceSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    count: Literal[1]
    confidence: float = Field(ge=0, le=1)
    faceAreaRatio: float = Field(ge=0, le=1)
    poseAngles: list[float] | None = None


class SelfieQuality(BaseModel):
    model_config = ConfigDict(extra="forbid")
    score: float = Field(ge=0, le=1)
    threshold: float = Field(ge=0, le=1)
    passed: bool


class FaceComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")
    similarity: float = Field(ge=-1, le=1)
    threshold: float = Field(ge=0, le=1)
    matched: bool


class ModelMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    version: str


class FaceEvidenceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal["1.0"]
    pipelineVersion: Literal["face-analysis-v1"]
    model: ModelMetadata
    documentFace: FaceSummary
    selfieFace: FaceSummary
    selfieQuality: SelfieQuality
    faceComparison: FaceComparison


@router.post("/compare", response_model=FaceEvidenceResponse)
async def compare_faces(request: Request, document: UploadFile = File(...), selfie: UploadFile = File(...)):
    service = getattr(request.app.state, "verification_service", None)
    if service is None:
        return JSONResponse(status_code=503, content={"code": "MODEL_NOT_READY", "message": "Face analysis is not ready."})
    try:
        document_image = service._read_image(await _read_limited(document))
        selfie_image = service._read_image(await _read_limited(selfie))
        return FaceEvidenceResponse.model_validate(service.compare_faces(document_image, selfie_image))
    except ValidationError:
        correlation_id = uuid4().hex
        logger.error("Face evidence returned an invalid result; correlationId=%s", correlation_id)
        return JSONResponse(status_code=500, content={
            "code": "INTERNAL_ERROR", "message": "Face analysis failed.", "correlationId": correlation_id
        })
    except ValueError as error:
        if str(error) == "FILE_TOO_LARGE":
            return JSONResponse(status_code=413, content={"code": "FILE_TOO_LARGE", "message": "Image exceeds the 5 MB limit."})
        return JSONResponse(status_code=422, content={"code": "FACE_EVIDENCE_INVALID", "message": "A single usable face is required in each image."})
    except Exception:
        correlation_id = uuid4().hex
        logger.error("Face evidence failed; correlationId=%s", correlation_id)
        return JSONResponse(status_code=500, content={
            "code": "INTERNAL_ERROR", "message": "Face analysis failed.", "correlationId": correlation_id
        })
