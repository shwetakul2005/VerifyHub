from fastapi.testclient import TestClient

from health_app import create_health_app


def test_liveness_does_not_load_a_face_model():
    app = create_health_app(lambda: False)
    response = TestClient(app).get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "live"}


def test_readiness_reflects_injected_model_state():
    app = create_health_app(lambda: False)
    response = TestClient(app).get("/health/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "not_ready"}

    ready = TestClient(create_health_app(lambda: True)).get("/health/ready")
    assert ready.status_code == 200
    assert ready.json() == {"status": "ready"}
