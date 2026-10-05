# Verification result contract v1

The Node backend owns the decision and stores one immutable result per workflow execution attempt. The ML service supplies image-quality and face evidence; OCR supplies text evidence. Neither adapter changes workflow state. The backend validates the assembled result with `Backend/src/domain/verification-result.js` before persistence. The record is internal until the result-read API adds role-specific projections.

## Version and decisions

- `schemaVersion` is `1.0`; `pipelineVersion` is `document-face-v1`.
- `componentVersions` names the OCR, document-quality, selfie-quality, face-matcher, and decision-policy implementations.
- `automaticDecision` and initial `finalDecision` are exactly `approved`, `manual_review`, or `rejected`.
- A later human decision will be a separate audited record referencing this immutable automatic result. It never rewrites evidence or the automatic decision.
- `attempt` is a positive integer. A unique `{ execution, attempt }` index will be added with result persistence.

## Result shape

```json
{
  "schemaVersion": "1.0",
  "pipelineVersion": "document-face-v1",
  "componentVersions": {
    "ocr": "tesseract-v1",
    "documentQuality": "quality-v1",
    "selfieQuality": "quality-v1",
    "faceMatcher": "face-v1",
    "decisionPolicy": "policy-v1"
  },
  "verificationRequest": "request-id",
  "execution": "execution-id",
  "attempt": 1,
  "document": {
    "documentId": "document-id",
    "declaredType": "PAN",
    "detectedType": "PAN",
    "typeConfidence": 0.95,
    "typeMatches": true,
    "quality": { "score": 0.82, "checks": [{ "code": "SHARPNESS", "passed": true, "score": 0.8 }] },
    "fields": {
      "panNumber": { "valueMasked": "ABCDE****F", "valueHash": "keyed-digest", "confidence": 0.9, "source": "ocr", "formatValid": true }
    },
    "face": { "detected": true, "count": 1, "confidence": 0.98 }
  },
  "selfie": {
    "quality": { "score": 0.85, "checks": [{ "code": "BRIGHTNESS", "passed": true, "score": 0.85 }] },
    "face": { "detected": true, "count": 1, "confidence": 0.97 }
  },
  "faceComparison": { "similarity": 0.72, "threshold": 0.6, "matched": true, "model": "face-model", "modelVersion": "1" },
  "thresholds": { "documentQualityMin": 0.7, "selfieQualityMin": 0.7, "fieldConfidenceMin": 0.8 },
  "automaticDecision": "approved",
  "finalDecision": "approved",
  "reasonCodes": [],
  "createdAt": "2026-10-05T00:00:00.000Z"
}
```

Every score and threshold is finite and lies in `[0, 1]`. `detectedType` and face similarity may be `null` when evidence is missing. The example values illustrate the shape; they are not calibrated production thresholds. Quality checks have stable codes, pass/fail values, and bounded scores. Unknown keys are rejected throughout the result so raw OCR, embeddings, image bytes, and unmasked identity numbers cannot be silently added to this record.

## Reason codes

The current catalog is exported as `REASON_CODES` from the validator. It covers unsupported/corrupt/low-quality documents, uncertain or mismatched type, missing/low-confidence fields, Aadhaar/PAN format failures, missing or multiple faces, selfie quality failures, uncertain or mismatched similarity, conflicting evidence, and re-upload exhaustion. Clients should branch on codes and render human-readable guidance. Adding a code within schema 1.x is additive; renaming/removing one requires a new major schema version.

## Privacy and claims

Identifier fields contain masked display values and a server-keyed digest when equality checks are needed. The raw document and selfie remain behind the existing protected file boundary and are not placed in result or audit payloads. Field confidence describes extraction certainty, not government-record verification. The selfie quality score describes image usability; no result claims liveness or anti-spoofing. Ambiguous evidence is intended for `manual_review`.

The separate ML health contract provides `/health/live` without model loading and `/health/ready` backed by an injected readiness probe. Wiring this router into the production app and its model lifecycle is the next implementation task.
