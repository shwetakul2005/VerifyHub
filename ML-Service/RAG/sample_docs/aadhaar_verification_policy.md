# Aadhaar Verification Policy

## Accepted Documents
Aadhaar verification accepts the following document types:
- Original Aadhaar card (front and back)
- e-Aadhaar PDF downloaded from the UIDAI portal
- Masked Aadhaar (last 4 digits visible) — accepted only for identity confirmation, not for KYC-tier verification

## Verification Steps
1. **Document Upload**: User uploads a clear image or PDF of the Aadhaar card.
2. **OCR Extraction**: The system extracts name, Aadhaar number (masked in storage), date of birth, and address using OCR.
3. **Format Validation**: The extracted Aadhaar number is checked against the Verhoeff checksum algorithm to confirm it is a structurally valid number.
4. **Face Match (optional step)**: If liveness detection is enabled in the workflow, the photo on the Aadhaar card is matched against a live selfie capture.

## SLA
Aadhaar OCR-based verification typically completes within 30 seconds. If the face-match step is included, add up to 15 seconds for liveness processing.

## Data Retention
Only the masked Aadhaar number (last 4 digits) is stored in the database. Full Aadhaar numbers are never persisted, in line with UIDAI data minimization guidelines.

## Common Rejection Reasons
- Blurry or low-resolution image preventing OCR extraction
- Aadhaar number fails Verhoeff checksum validation
- Name mismatch between Aadhaar and the organization's provided user record
- Face match confidence score below the configured threshold (default: 85%)
