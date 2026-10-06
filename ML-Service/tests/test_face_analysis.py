from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import create_app
from services.face_matcher import FaceMatcher
from services.face_verification import FaceVerificationService


class FakeDetector:
    def __init__(self, faces):
        self.faces = list(faces)

    def detect(self, image):
        return self.faces.pop(0)


def face(embedding):
    return SimpleNamespace(
        embedding=np.asarray(embedding, dtype=np.float32),
        bbox=np.asarray([40, 40, 160, 160], dtype=np.float32),
        det_score=0.98,
        pose=np.asarray([-2, 1, 0], dtype=np.float32),
        kps=np.asarray([[65, 85], [130, 85]], dtype=np.float32)
    )


def test_cosine_similarity_rejects_zero_nonfinite_and_mismatched_embeddings():
    matcher = FaceMatcher()
    for left, right in [
        ([0, 0], [1, 0]),
        ([float("nan"), 1], [1, 0]),
        ([1, 0], [1, 0, 0])
    ]:
        with pytest.raises(ValueError):
            matcher.compare(left, right)


def test_face_comparison_returns_bounded_evidence_and_selfie_quality():
    detector = FakeDetector([[face([1, 0])], [face([1, 0])], [face([1, 0])]])
    service = FaceVerificationService(detector=detector)
    image = np.full((200, 200, 3), 127, dtype=np.uint8)
    result = service.compare_faces(image, image)
    assert result["schemaVersion"] == "1.0"
    assert result["model"]["name"]
    assert result["model"]["version"]
    assert result["documentFace"]["count"] == 1
    assert 0 < result["documentFace"]["faceAreaRatio"] < 1
    assert result["documentFace"]["poseAngles"] == [-2.0, 1.0, 0.0]
    assert result["faceComparison"]["matched"] is True
    assert 0 <= result["selfieQuality"]["score"] <= 1
    assert "liveness" not in str(result).lower()


def test_missing_or_multiple_faces_cannot_produce_comparison():
    image = np.zeros((200, 200, 3), dtype=np.uint8)
    for faces in [[], [face([1, 0]), face([1, 0])]]:
        service = FaceVerificationService(detector=FakeDetector([faces]))
        with pytest.raises(ValueError):
            service.compare_faces(image, image)


def test_v1_face_route_exposes_quality_and_similarity_without_liveness_claim():
    class FakeService:
        def _read_image(self, content):
            return content

        def compare_faces(self, document, selfie):
            return {
                "schemaVersion": "1.0", "pipelineVersion": "face-analysis-v1",
                "model": {"name": "synthetic", "version": "1"},
                "documentFace": {"count": 1, "confidence": 0.98, "faceAreaRatio": 0.2},
                "selfieFace": {"count": 1, "confidence": 0.97, "faceAreaRatio": 0.25},
                "selfieQuality": {"score": 0.85, "threshold": 0.55, "passed": True},
                "faceComparison": {"similarity": 0.75, "threshold": 0.6, "matched": True}
            }

    with TestClient(create_app(model_loader=lambda: (FakeService(), object()), include_rag=False)) as client:
        response = client.post(
            "/v1/face/compare",
            files={"document": ("document.jpg", b"document", "image/jpeg"),
                   "selfie": ("selfie.jpg", b"selfie", "image/jpeg")}
        )
    assert response.status_code == 200
    assert response.json()["faceComparison"]["matched"] is True
    assert "liveness" not in response.text.lower()


def test_v1_face_route_hides_invalid_model_output():
    class InvalidService:
        def _read_image(self, content):
            return content

        def compare_faces(self, document, selfie):
            return {"schemaVersion": "1.0", "privatePath": "C:/secret/model.bin"}

    with TestClient(create_app(model_loader=lambda: (InvalidService(), object()), include_rag=False)) as client:
        response = client.post(
            "/v1/face/compare",
            files={"document": ("document.jpg", b"document", "image/jpeg"),
                   "selfie": ("selfie.jpg", b"selfie", "image/jpeg")}
        )
    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_ERROR"
    assert "secret" not in response.text
