"""Legacy face routes backed by a versioned, testable API boundary."""

import logging
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

router = APIRouter(prefix="/face-verification", tags=["Face Verification"])
logger = logging.getLogger(__name__)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


class MatchResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    matched: bool
    similarity: float = Field(ge=-1, le=1)
    threshold: float = Field(ge=0, le=1)


class LegacyQualityResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    liveness: bool
    score: float = Field(ge=0, le=1)
    threshold: float = Field(ge=0, le=1)
    reason: str


class LegacyThresholds(BaseModel):
    model_config = ConfigDict(extra="forbid")
    faceMatch: float = Field(ge=0, le=1)
    liveness: float = Field(ge=0, le=1)


class FaceVerifyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal["1.0"] = "1.0"
    pipelineVersion: Literal["face-analysis-v1"] = "face-analysis-v1"
    verified: bool
    match: MatchResult
    liveness: LegacyQualityResult
    thresholds: LegacyThresholds
    decision: Literal["approved", "manual_review", "rejected"]
    message: str


def _error(status, code, message):
    return JSONResponse(status_code=status, content={"code": code, "message": message})


async def _read_limited(upload):
    content = await upload.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("FILE_TOO_LARGE")
    if not content:
        raise ValueError("INVALID_IMAGE")
    return content


@router.get("/health")
def health():
    return {"status": "Face verification service working"}


@router.post("/verify", response_model=FaceVerifyResponse)
async def verify_identity(request: Request, document: UploadFile = File(...), live: UploadFile = File(...)):
    service = getattr(request.app.state, "verification_service", None)
    if service is None:
        return _error(503, "MODEL_NOT_READY", "Face analysis is not ready.")
    try:
        document_bytes = await _read_limited(document)
        selfie_bytes = await _read_limited(live)
        document_image = service._read_image(document_bytes)
        selfie_image = service._read_image(selfie_bytes)
        return FaceVerifyResponse.model_validate(service.verify_identity(document_image, selfie_image))
    except ValidationError:
        correlation_id = uuid4().hex
        logger.error("Face analysis returned an invalid result; correlationId=%s", correlation_id)
        return JSONResponse(status_code=500, content={
            "code": "INTERNAL_ERROR", "message": "Face analysis failed.", "correlationId": correlation_id
        })
    except ValueError as error:
        if str(error) == "FILE_TOO_LARGE":
            return _error(413, "FILE_TOO_LARGE", "Image exceeds the 5 MB limit.")
        return _error(400, "INVALID_IMAGE", "The image could not be processed.")
    except Exception:
        correlation_id = uuid4().hex
        logger.error("Face analysis failed; correlationId=%s", correlation_id)
        return JSONResponse(status_code=500, content={
            "code": "INTERNAL_ERROR", "message": "Face analysis failed.", "correlationId": correlation_id
        })


@router.post("/liveness", deprecated=True)
async def legacy_quality_check(request: Request, file: UploadFile = File(...)):
    service = getattr(request.app.state, "verification_service", None)
    if service is None:
        return _error(503, "MODEL_NOT_READY", "Face analysis is not ready.")
    try:
        image = service._read_image(await _read_limited(file))
        return LegacyQualityResult.model_validate(service.estimate_liveness(image))
    except ValueError as error:
        if str(error) == "FILE_TOO_LARGE":
            return _error(413, "FILE_TOO_LARGE", "Image exceeds the 5 MB limit.")
        return _error(400, "INVALID_IMAGE", "The image could not be processed.")
    except Exception:
        correlation_id = uuid4().hex
        logger.error("Legacy image quality failed; correlationId=%s", correlation_id)
        return JSONResponse(status_code=500, content={
            "code": "INTERNAL_ERROR", "message": "Image analysis failed.", "correlationId": correlation_id
        })
