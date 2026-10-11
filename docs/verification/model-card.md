# VerifyHub Verification Pipeline Model Card

## Release

- Result schema: `1.0`
- Pipeline: `document-face-v1`
- Status: portfolio/research implementation; not certified KYC

## Intended use

The pipeline helps an assigned verifier assess a submitted PAN or Aadhaar image and a selfie. It reports image usability, OCR-derived structured fields and confidence, format/type checks, face presence, and face-embedding similarity. It can approve strong, internally consistent evidence, reject deterministic input failures, or route uncertainty to manual review.

It does not query PAN, UIDAI, or another government source, so format-valid data is not proof that a document is genuine or belongs to the applicant.

## Explicit non-use

- Do not use this release as a certified KYC/AML decision system.
- Do not use it for surveillance, face identification, demographic inference, or eligibility decisions.
- Do not interpret selfie quality as liveness or anti-spoofing. No presentation-attack detector exists in this release.
- Do not use the example thresholds for production without a consented, representative evaluation and legal/risk review.

## Inputs and outputs

Inputs are one supported identity-document image (PAN or Aadhaar) and one applicant selfie. The immutable result contains version identifiers, bounded scores, quality checks, masked extracted values, keyed hashes for supported identifiers, face-detection evidence, face similarity, reason codes, and the automatic decision. Raw images remain in protected evidence storage; raw OCR text and face embeddings are excluded from result and audit records.

An applicant receives only a decision summary and actionable reason codes. An assigned verifier may view the sanitized detailed result. A human final decision is stored separately with the actor, timestamp, and mandatory reason so the automatic result remains unchanged.

## Decision policy

Quality and confidence thresholds are engineering defaults. Deterministic unsupported/corrupt input and configured hard validation failures may reject. Ambiguous type, extraction, face presence, or similarity routes to manual review. In particular, low face similarity does **not** automatically reject an applicant in Phase 3.

## Evaluation and calibration

`ML-Service/calibration/evaluate_thresholds.py` calculates false-acceptance, false-rejection, and balanced-error rates from a labelled JSON manifest. The committed manifest is synthetic and only demonstrates the tooling; it is not evidence of accuracy. A real evaluation must use separately governed, consented data; cover capture devices, lighting, document variants, and relevant populations; publish subgroup/error analysis; and keep identity media outside Git.

Example:

```bash
cd ML-Service
python -m calibration.evaluate_thresholds calibration/fixtures.example.json --thresholds 0.5 0.6 0.7 0.8
```

Runtime thresholds must not be changed merely because the example report looks favorable.

## Known limitations and risks

- OCR confidence and document classification can degrade with glare, crop, blur, rotation, fonts, or language variation.
- Face embeddings can be affected by pose, illumination, occlusion, camera quality, age gap, and model bias.
- A high similarity score is not proof of liveness, consent, authenticity, or government-record validity.
- Automatic thresholds are not calibrated on a production dataset.
- Human reviewers can make mistakes; their reasoned overrides are auditable, not infallible.
- Uploaded evidence retention and deletion require a deployment-specific privacy policy.

## Privacy and security controls

Use synthetic data for development. Configure a private, high-entropy `VERIFICATION_RESULT_DIGEST_KEY`; rotate it only with an explicit migration plan. Restrict evidence files by tenant and assignment, do not log request bodies or images, keep uploads/caches/models out of Git, set retention periods, encrypt production storage, and obtain informed consent before biometric processing.

## Change control

Any model, preprocessing, threshold, reason-code, or decision-policy change requires a new component/pipeline version, regression results, and an updated model card. Adding real anti-spoofing requires a separately evaluated presentation-attack-detection model or provider and accurate UI/API terminology.
