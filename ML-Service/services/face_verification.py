"""Face evidence and selfie image quality. This does not detect liveness."""

import cv2
import numpy as np

from services.face_matcher import FaceMatcher


class FaceVerificationService:
    def __init__(self, match_threshold=0.6, selfie_quality_threshold=0.55, detector=None, matcher=None):
        if detector is None:
            from services.face_detector import FaceDetector
            detector = FaceDetector()
        self.detector = detector
        self.matcher = matcher or FaceMatcher()
        self.match_threshold = match_threshold
        self.selfie_quality_threshold = selfie_quality_threshold

    def _read_image(self, image_bytes):
        image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
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

    @staticmethod
    def _image_quality_score(image):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness = float(np.mean(gray))
        blur_score = min(1.0, max(0.0, blur / 180.0))
        brightness_score = min(1.0, max(0.0, 1.0 - abs(brightness - 128) / 128.0))
        return float((blur_score * 0.6) + (brightness_score * 0.4))

    def analyze_selfie_quality(self, image):
        try:
            face = self._get_single_face(image, "selfie")
        except ValueError as error:
            return {"passed": False, "score": 0.0, "threshold": self.selfie_quality_threshold,
                    "reason": str(error)}
        quality_score = self._image_quality_score(image)
        landmarks = getattr(face, "kps", None)
        eye_score = 0.5
        if landmarks is not None and len(landmarks) >= 2:
            eye_distance = float(np.linalg.norm(np.asarray(landmarks[0]) - np.asarray(landmarks[1])))
            eye_score = min(1.0, max(0.0, eye_distance / 50.0))
        final_score = float((quality_score * 0.6) + (eye_score * 0.4))
        passed = final_score >= self.selfie_quality_threshold
        return {"passed": bool(passed), "score": round(final_score, 4),
                "threshold": self.selfie_quality_threshold,
                "reason": "Selfie image is usable." if passed else "Selfie image quality is insufficient."}

    @staticmethod
    def _face_summary(face, image):
        x1, y1, x2, y2 = np.asarray(face.bbox, dtype=np.float64)
        height, width = image.shape[:2]
        area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        confidence = float(getattr(face, "det_score", 0))
        raw_pose = getattr(face, "pose", None)
        pose = np.asarray(raw_pose, dtype=np.float64) if raw_pose is not None else None
        pose_angles = pose.tolist() if pose is not None and pose.shape == (3,) and np.isfinite(pose).all() else None
        return {"count": 1, "confidence": float(np.clip(confidence, 0, 1)),
                "faceAreaRatio": float(np.clip(area / (width * height), 0, 1)),
                "poseAngles": pose_angles}

    def compare_faces(self, document_image, selfie_image):
        document_embedding, document_face = self._extract_embedding(document_image, "document")
        selfie_embedding, selfie_face = self._extract_embedding(selfie_image, "selfie")
        comparison = self.matcher.compare(document_embedding, selfie_embedding, threshold=self.match_threshold)
        quality = self.analyze_selfie_quality(selfie_image)
        return {
            "schemaVersion": "1.0", "pipelineVersion": "face-analysis-v1",
            "model": {"name": "insightface", "version": "buffalo_s"},
            "documentFace": self._face_summary(document_face, document_image),
            "selfieFace": self._face_summary(selfie_face, selfie_image),
            "selfieQuality": {"score": quality["score"], "threshold": quality["threshold"], "passed": quality["passed"]},
            "faceComparison": comparison
        }
