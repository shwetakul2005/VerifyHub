# PAN Verification Policy

## Accepted Documents
- Physical PAN card (front image)
- e-PAN PDF issued by the Income Tax Department

## Verification Steps
1. **Document Upload**: User uploads a clear image or PDF of the PAN card.
2. **OCR Extraction**: The system extracts the PAN number, name, father's name, and date of birth.
3. **Format Validation**: The PAN number is checked against the standard format (5 letters, 4 digits, 1 letter — e.g., ABCDE1234F). The 4th character is validated against the expected holder-type code (P for individual, C for company, etc.).
4. **Name Cross-Check**: Extracted name is compared against the organization's provided user record using fuzzy string matching (minimum similarity threshold: 90%).

## SLA
PAN OCR verification typically completes within 20 seconds.

## Common Rejection Reasons
- PAN number does not match the required format pattern
- Name similarity score falls below the 90% threshold
- Document is expired, damaged, or the PAN number is not legible
- Duplicate PAN number already verified under a different user in the same organization

## Notes for Verifiers
Unlike Aadhaar, PAN verification does not include a mandatory face-match step, since PAN cards do not reliably carry a clear photo across all issued formats (older PAN cards may have degraded or missing photos).
