"""Bounded image decoding and explainable quality analysis. No face or liveness claim."""

from pathlib import Path

import cv2
import numpy as np

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 20_000_000
MAX_SIDE = 8_000
QUALITY_VERSION = "image-quality-v1"


class ImageInputError(ValueError):
    def __init__(self, code, status_code=400):
        self.code = code
        self.status_code = status_code
        super().__init__(code)


def _jpeg_dimensions(content):
    position = 2
    sof_markers = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while position + 4 <= len(content):
        if content[position] != 0xFF:
            break
        while position < len(content) and content[position] == 0xFF:
            position += 1
        if position >= len(content):
            break
        marker = content[position]
        position += 1
        if marker in (0xD8, 0xD9, 0xDA):
            break
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            continue
        if position + 2 > len(content):
            break
        segment_length = int.from_bytes(content[position:position + 2], "big")
        if segment_length < 2 or position + segment_length > len(content):
            break
        if marker in sof_markers and segment_length >= 7:
            height = int.from_bytes(content[position + 3:position + 5], "big")
            width = int.from_bytes(content[position + 5:position + 7], "big")
            return width, height
        position += segment_length
    raise ImageInputError("CORRUPT_IMAGE")


def _envelope(content, filename, content_type):
    if not content or len(content) > MAX_FILE_BYTES:
        raise ImageInputError("FILE_TOO_LARGE" if content else "CORRUPT_IMAGE", 413 if content else 400)
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        image_type = "png"
        if len(content) < 24 or content[12:16] != b"IHDR":
            raise ImageInputError("CORRUPT_IMAGE")
        width = int.from_bytes(content[16:20], "big")
        height = int.from_bytes(content[20:24], "big")
    elif content.startswith(b"\xff\xd8"):
        image_type = "jpeg"
        width, height = _jpeg_dimensions(content)
    else:
        raise ImageInputError("UNSUPPORTED_FORMAT", 415)

    extension = Path(filename or "").suffix.lower()
    allowed_extensions = {"png": {".png"}, "jpeg": {".jpg", ".jpeg"}}
    allowed_mime = {"png": "image/png", "jpeg": "image/jpeg"}
    if extension not in allowed_extensions[image_type] or content_type != allowed_mime[image_type]:
        raise ImageInputError("FORMAT_MISMATCH", 415)
    if width < 1 or height < 1 or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise ImageInputError("PIXEL_LIMIT_EXCEEDED", 413)
    return width, height


def _bounded(value):
    return float(min(1.0, max(0.0, value)))


def analyze_image_bytes(content, filename, content_type, kind):
    if kind not in ("document", "selfie"):
        raise ValueError("Unsupported image kind")
    width, height = _envelope(content, filename, content_type)
    image = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.shape[1] != width or image.shape[0] != height:
        raise ImageInputError("CORRUPT_IMAGE")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    glare_fraction = float(np.mean(gray >= 250))
    minimum_width, minimum_height = (640, 400) if kind == "document" else (320, 320)
    checks = [
        {"code": "RESOLUTION", "passed": width >= minimum_width and height >= minimum_height,
         "score": _bounded(min(width / minimum_width, height / minimum_height))},
        {"code": "SHARPNESS", "passed": sharpness >= 80,
         "score": _bounded(sharpness / 250)},
        {"code": "BRIGHTNESS", "passed": 45 <= brightness <= 210,
         "score": _bounded(1 - abs(brightness - 128) / 128)},
        {"code": "CONTRAST", "passed": contrast >= 35,
         "score": _bounded(contrast / 64)},
        {"code": "GLARE", "passed": glare_fraction < 0.8,
         "score": _bounded(1 - glare_fraction)}
    ]
    weights = {"RESOLUTION": 0.2, "SHARPNESS": 0.3, "BRIGHTNESS": 0.2, "CONTRAST": 0.2, "GLARE": 0.1}
    score = round(sum(check["score"] * weights[check["code"]] for check in checks), 4)
    reason_map = {
        "document": {"RESOLUTION": "DOCUMENT_TOO_SMALL", "SHARPNESS": "DOCUMENT_TOO_BLURRY",
                     "BRIGHTNESS": "DOCUMENT_TOO_DARK" if brightness < 45 else "DOCUMENT_TOO_BRIGHT",
                     "CONTRAST": "DOCUMENT_LOW_CONTRAST", "GLARE": "DOCUMENT_GLARE"},
        "selfie": {"RESOLUTION": "SELFIE_QUALITY_LOW", "SHARPNESS": "SELFIE_TOO_BLURRY",
                   "BRIGHTNESS": "SELFIE_TOO_DARK" if brightness < 45 else "SELFIE_QUALITY_LOW",
                   "CONTRAST": "SELFIE_QUALITY_LOW", "GLARE": "SELFIE_QUALITY_LOW"}
    }
    reason_codes = list(dict.fromkeys(reason_map[kind][check["code"]] for check in checks if not check["passed"]))
    if not checks[0]["passed"] or brightness < 30 or score < 0.4:
        status = "unusable"
    elif reason_codes or score < 0.75:
        status = "borderline"
    else:
        status = "usable"
    return {
        "schemaVersion": "1.0", "qualityVersion": QUALITY_VERSION, "kind": kind,
        "width": width, "height": height, "score": score, "status": status,
        "checks": checks, "reasonCodes": reason_codes
    }
