from fastapi.testclient import TestClient

from app import create_app


FACE_RESULT = {
    "schemaVersion": "1.0",
    "pipelineVersion": "face-analysis-v1",
    "model": {"name": "test-model", "version": "1"},
    "documentFace": {"count": 1, "confidence": 0.9, "faceAreaRatio": 0.2, "poseAngles": None},
    "selfieFace": {"count": 1, "confidence": 0.9, "faceAreaRatio": 0.2, "poseAngles": None},
    "selfieQuality": {"score": 0.8, "threshold": 0.55, "passed": True},
    "faceComparison": {"matched": True, "similarity": 0.75, "threshold": 0.6},
}


class FakeVerifier:
    def _read_image(self, content):
        return content

    def compare_faces(self, document, selfie):
        assert document == b"document-image"
        assert selfie == b"selfie-image"
        return FACE_RESULT


def test_app_import_and_health_checks_need_no_model_download():
    client = TestClient(create_app(include_rag=False))
    assert client.get("/health/live").json() == {"status": "live"}
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "not_ready"}


def test_versioned_face_route_uses_injected_verifier_and_legacy_route_is_absent():
    with TestClient(create_app(model_loader=lambda: (FakeVerifier(), object()), include_rag=False)) as client:
        assert client.get("/health/ready").json() == {"status": "ready"}
        response = client.post(
            "/v1/face/compare",
            files={
                "document": ("document.jpg", b"document-image", "image/jpeg"),
                "selfie": ("selfie.jpg", b"selfie-image", "image/jpeg"),
            },
        )
        legacy = client.post("/face-verification/liveness")
    assert response.status_code == 200
    assert response.json()["schemaVersion"] == "1.0"
    assert legacy.status_code == 404


def test_upload_limit_rejects_oversized_input_before_inference():
    with TestClient(create_app(model_loader=lambda: (FakeVerifier(), object()), include_rag=False)) as client:
        response = client.post(
            "/v1/face/compare",
            files={
                "document": ("document.jpg", b"x" * (5 * 1024 * 1024 + 1), "image/jpeg"),
                "selfie": ("selfie.jpg", b"selfie-image", "image/jpeg"),
            },
        )
    assert response.status_code == 413
    assert response.json()["code"] == "FILE_TOO_LARGE"


def test_internal_errors_hide_exception_text_and_expose_correlation_id():
    class BrokenVerifier(FakeVerifier):
        def compare_faces(self, document, selfie):
            raise RuntimeError("private path C:/secret/model.bin")

    with TestClient(create_app(model_loader=lambda: (BrokenVerifier(), object()), include_rag=False)) as client:
        response = client.post(
            "/v1/face/compare",
            files={
                "document": ("document.jpg", b"document-image", "image/jpeg"),
                "selfie": ("selfie.jpg", b"selfie-image", "image/jpeg"),
            },
        )
    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_ERROR"
    assert response.json()["correlationId"]
    assert "secret" not in response.text


def test_invalid_model_output_is_an_internal_error_not_a_bad_user_image():
    class InvalidVerifier(FakeVerifier):
        def compare_faces(self, document, selfie):
            return {**super().compare_faces(document, selfie), "pipelineVersion": "unknown"}

    with TestClient(create_app(model_loader=lambda: (InvalidVerifier(), object()), include_rag=False)) as client:
        response = client.post(
            "/v1/face/compare",
            files={
                "document": ("document.jpg", b"document-image", "image/jpeg"),
                "selfie": ("selfie.jpg", b"selfie-image", "image/jpeg"),
            },
        )
    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_ERROR"


def test_model_loader_runs_once_per_app_lifespan():
    calls = []

    def load():
        calls.append("loaded")
        return FakeVerifier(), object()

    with TestClient(create_app(model_loader=load, include_rag=False)) as client:
        assert client.get("/health/ready").status_code == 200
        assert client.get("/health/ready").status_code == 200
    assert calls == ["loaded"]
