from fastapi import APIRouter, UploadFile, File, Request, HTTPException
router = APIRouter(prefix="/face", tags=["Face"])

@router.get("/health")
def health():
    return {"status": "Face service working"}


@router.post("/detect")
async def detect_face(request: Request, file: UploadFile = File(...)):
    import cv2
    import numpy as np
    detector = getattr(request.app.state, "detector", None)
    if detector is None:
        raise HTTPException(status_code=503, detail="Face analysis is not ready.")
    contents = await file.read(5 * 1024 * 1024 + 1)
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image exceeds the 5 MB limit.")
    arr = np.frombuffer(contents, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    faces = detector.detect(image)
    response = []

    for face in faces:

        cropped = detector.crop_face(image, face.bbox)

        path = detector.save_face(cropped)

        response.append({
            "bbox": face.bbox.tolist(),
            "confidence": float(face.det_score),
            "facePath": path
        })

    return {
        "facesDetected": len(response),
        "faces": response
    }
