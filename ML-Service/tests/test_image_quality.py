import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import create_app
from services.image_quality import ImageInputError, analyze_image_bytes


def png(image):
    success, encoded = cv2.imencode(".png", image)
    assert success
    return encoded.tobytes()


def patterned_image():
    pattern = np.indices((600, 800)).sum(axis=0) % 2
    return np.repeat((pattern * 255).astype(np.uint8)[:, :, None], 3, axis=2)


def test_usable_document_has_bounded_score_and_individual_checks():
    result = analyze_image_bytes(png(patterned_image()), "document.png", "image/png", "document")
    assert result["schemaVersion"] == "1.0"
    assert result["qualityVersion"] == "image-quality-v1"
    assert result["kind"] == "document"
    assert result["width"] == 800
    assert result["height"] == 600
    assert result["status"] == "usable"
    assert 0 <= result["score"] <= 1
    assert {item["code"] for item in result["checks"]} == {
        "RESOLUTION", "SHARPNESS", "BRIGHTNESS", "CONTRAST", "GLARE"
    }


def test_dark_and_blurred_images_report_actionable_quality_failures():
    dark = analyze_image_bytes(png(np.zeros((600, 800, 3), dtype=np.uint8)), "document.png", "image/png", "document")
    assert dark["status"] == "unusable"
    assert "DOCUMENT_TOO_DARK" in dark["reasonCodes"]

    blurred = cv2.GaussianBlur(patterned_image(), (51, 51), 0)
    result = analyze_image_bytes(png(blurred), "document.png", "image/png", "document")
    assert "DOCUMENT_TOO_BLURRY" in result["reasonCodes"]
    assert result["status"] != "usable"


@pytest.mark.parametrize("content,name,mime,code", [
    (b"%PDF-1.4 fake", "document.pdf", "application/pdf", "UNSUPPORTED_FORMAT"),
    (b"not an image", "document.png", "image/png", "UNSUPPORTED_FORMAT"),
    (b"\x89PNG\r\n\x1a\n" + b"broken", "document.png", "image/png", "CORRUPT_IMAGE"),
    (png(np.zeros((20, 20, 3), dtype=np.uint8)), "document.jpg", "image/jpeg", "FORMAT_MISMATCH")
])
def test_file_envelope_rejects_unsupported_corrupt_and_spoofed_inputs(content, name, mime, code):
    with pytest.raises(ImageInputError) as error:
        analyze_image_bytes(content, name, mime, "document")
    assert error.value.code == code


def test_declared_oversized_dimensions_fail_before_decoding():
    header = bytearray(b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR")
    header.extend((100000).to_bytes(4, "big"))
    header.extend((100000).to_bytes(4, "big"))
    with pytest.raises(ImageInputError) as error:
        analyze_image_bytes(bytes(header), "document.png", "image/png", "document")
    assert error.value.code == "PIXEL_LIMIT_EXCEEDED"


def test_quality_api_returns_structured_scores_without_loading_face_model():
    client = TestClient(create_app(include_rag=False))
    response = client.post(
        "/v1/image-quality/document",
        files={"file": ("document.png", png(patterned_image()), "image/png")}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "usable"
    assert response.json()["score"] <= 1


def test_quality_api_rejects_unsupported_format_with_stable_code():
    client = TestClient(create_app(include_rag=False))
    response = client.post(
        "/v1/image-quality/selfie",
        files={"file": ("selfie.pdf", b"%PDF-1.4", "application/pdf")}
    )
    assert response.status_code == 415
    assert response.json()["code"] == "UNSUPPORTED_FORMAT"
