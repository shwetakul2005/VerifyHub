from fastapi import APIRouter, UploadFile, File, HTTPException

from services.face_verification import FaceVerificationService

router = APIRouter(prefix="/face-verification", tags=["Face Verification"])
service = FaceVerificationService()


@router.get("/health")
def health():
    return {"status": "Face verification service working"}


@router.post("/verify")
async def verify_identity(
    document: UploadFile = File(...),
    live: UploadFile = File(...),
):
    try:
        document_bytes = await document.read()
        live_bytes = await live.read()

        document_image = service._read_image(document_bytes)
        live_image = service._read_image(live_bytes)

        result = service.verify_identity(document_image, live_image)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Face verification failed: {str(exc)}")


@router.post("/liveness")
async def liveness_check(file: UploadFile = File(...)):
    try:
        image_bytes = await file.read()
        image = service._read_image(image_bytes)
        return service.estimate_liveness(image)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Liveness check failed: {str(exc)}")
