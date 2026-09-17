import cv2
import numpy as np

from services.face_detector import FaceDetector
from services.face_matcher import FaceMatcher


class FaceVerificationService:
    def __init__(self, match_threshold=0.6, liveness_threshold=0.55):
        self.detector = FaceDetector()
        self.matcher = FaceMatcher()
        self.match_threshold = match_threshold
        self.liveness_threshold = liveness_threshold

    def _read_image(self, image_bytes):
        array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(array, cv2.IMREAD_COLOR)

        if image is None:
            raise ValueError("Unable to decode image.")

        return image

    def _get_single_face(self, image, image_label):
        faces = self.detector.detect(image)

        if len(faces) == 0:
            raise ValueError(f"No face detected in {image_label} image.")

        if len(faces) > 1:
            raise ValueError(f"Multiple faces detected in {image_label} image.")

        return faces[0]

    def _extract_embedding(self, image, image_label):
        face = self._get_single_face(image, image_label)

        embedding = getattr(face, "embedding", None)

        if embedding is None or np.asarray(embedding).size == 0:
            face_crop = self.detector.crop_face(image, face.bbox)
            embedding = self.detector.get_embedding(face_crop)

        if embedding is None or np.asarray(embedding).size == 0:
            raise ValueError(f"Could not generate embedding for {image_label} image.")

        return embedding, face

    def _image_quality_score(self, image):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blur = cv2.Laplacian(gray, cv2.CV_64F).var()
        brightness = float(np.mean(gray))

        blur_score = min(1.0, max(0.0, blur / 180.0))
        brightness_score = min(1.0, max(0.0, 1.0 - abs(brightness - 128) / 128.0))
        return float((blur_score * 0.6) + (brightness_score * 0.4))

    def estimate_liveness(self, image):
        try:
            face = self._get_single_face(image, "live selfie")
        except ValueError as exc:
            return {
                "liveness": False,
                "score": 0.0,
                "reason": str(exc),
            }

        quality_score = self._image_quality_score(image)

        landmarks = getattr(face, "kps", None)
        eye_score = 0.5

        if landmarks is not None and len(landmarks) >= 2:
            left_eye = landmarks[0]
            right_eye = landmarks[1]

            eye_distance = float(np.linalg.norm(left_eye - right_eye))
            eye_score = min(1.0, max(0.0, eye_distance / 50.0))

        final_score = float((quality_score * 0.6) + (eye_score * 0.4))
        passed = final_score >= self.liveness_threshold

        return {
            "liveness": bool(passed),
            "score": round(final_score, 4),
            "threshold": self.liveness_threshold,
            "reason": "Live selfie appears valid." if passed else "Live selfie quality or eye landmarks are insufficient.",
        }

    def verify_identity(self, document_image, live_image):
        doc_embedding, _ = self._extract_embedding(document_image, "document")
        live_embedding, _ = self._extract_embedding(live_image, "live")

        comparison = self.matcher.compare(
            doc_embedding,
            live_embedding,
            threshold=self.match_threshold,
        )

        liveness = self.estimate_liveness(live_image)

        passed = bool(comparison["matched"] and liveness["liveness"])

        return {
            "verified": passed,
            "match": comparison,
            "liveness": liveness,
            "thresholds": {
                "faceMatch": self.match_threshold,
                "liveness": self.liveness_threshold,
            },
            "decision": "approved" if passed else "rejected",
            "message": (
                "Document face matches live selfie and liveness check passed."
                if passed
                else "Identity verification failed. Please retry with a clearer live selfie and ensure it matches the document photo."
            ),
        }
