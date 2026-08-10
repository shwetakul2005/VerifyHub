from fastapi import APIRouter, UploadFile, File
from services.face_detector import FaceDetector
import cv2
import numpy as np
router = APIRouter(prefix="/face", tags=["Face"])

@router.get("/health")
def health():
    return {"status": "Face service working"}


detector = FaceDetector()
@router.post("/detect")
async def detect_face(file: UploadFile = File(...)):
    contents = await file.read()
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
    