from fastapi.testclient import TestClient

from app import create_app


class FakeVerifier:
    def _read_image(self, content):
        return content

    def verify_identity(self, document, selfie):
        assert document == b"document-image"
        assert selfie == b"selfie-image"
        return {
            "verified": True,
            "match": {"matched": True, "similarity": 0.75, "threshold": 0.6},
            "liveness": {"liveness": True, "score": 0.8, "threshold": 0.55, "reason": "Usable image"},
            "thresholds": {"faceMatch": 0.6, "liveness": 0.55},
            "decision": "approved",
            "message": "Verification complete"
        }


def test_app_import_and_liveness_need_no_model_download():
    client = TestClient(create_app(include_rag=False))
    assert client.get("/health/live").json() == {"status": "live"}
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "not_ready"}


def test_legacy_face_route_uses_injected_verifier_and_returns_versioned_response():
    with TestClient(create_app(model_loader=lambda: (FakeVerifier(), object()), include_rag=False)) as client:
        assert client.get("/health/ready").json() == {"status": "ready"}
        response = client.post(
            "/face-verification/verify",
            files={
                "document": ("document.jpg", b"document-image", "image/jpeg"),
                "live": ("selfie.jpg", b"selfie-image", "image/jpeg")
            }
        )
    assert response.status_code == 200
    assert response.json()["schemaVersion"] == "1.0"
    assert response.json()["verified"] is True


def test_upload_limit_rejects_oversized_input_before_inference():
    with TestClient(create_app(model_loader=lambda: (FakeVerifier(), object()), include_rag=False)) as client:
        response = client.post(
            "/face-verification/verify",
            files={
                "document": ("document.jpg", b"x" * (5 * 1024 * 1024 + 1), "image/jpeg"),
                "live": ("selfie.jpg", b"selfie-image", "image/jpeg")
            }
        )
    assert response.status_code == 413
    assert response.json()["code"] == "FILE_TOO_LARGE"


def test_internal_errors_hide_exception_text_and_expose_correlation_id():
    class BrokenVerifier(FakeVerifier):
        def verify_identity(self, document, selfie):
            raise RuntimeError("private path C:/secret/model.bin")

    with TestClient(create_app(model_loader=lambda: (BrokenVerifier(), object()), include_rag=False)) as client:
        response = client.post(
            "/face-verification/verify",
            files={
                "document": ("document.jpg", b"document-image", "image/jpeg"),
                "live": ("selfie.jpg", b"selfie-image", "image/jpeg")
            }
        )
    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_ERROR"
    assert response.json()["correlationId"]
    assert "secret" not in response.text


def test_invalid_model_output_is_an_internal_error_not_a_bad_user_image():
    class InvalidVerifier(FakeVerifier):
        def verify_identity(self, document, selfie):
            result = super().verify_identity(document, selfie)
            result["decision"] = "maybe"
            return result

    with TestClient(create_app(model_loader=lambda: (InvalidVerifier(), object()), include_rag=False)) as client:
        response = client.post(
            "/face-verification/verify",
            files={
                "document": ("document.jpg", b"document-image", "image/jpeg"),
                "live": ("selfie.jpg", b"selfie-image", "image/jpeg")
            }
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
