# Liveness Detection Policy

## Purpose
Liveness detection confirms that a face verification request comes from a live person present at the time of capture, not a photo, video replay, or mask.

## Workflow Step Configuration
Organizations can enable liveness detection as an optional step within any verification workflow that includes a face-match component (e.g., Aadhaar verification, standalone identity confirmation).

## Detection Method
The current implementation uses **passive liveness detection**:
- Analyzes a single selfie capture for texture, depth cues, and reflection patterns consistent with a live face
- Does not require the user to perform actions (blinking, head turns), reducing friction compared to active liveness methods

## Thresholds
- Liveness confidence threshold: 90% (configurable per organization)
- Face-match confidence threshold: 85% (configurable per organization)
- A request must pass both thresholds to be marked as verified

## SLA
Liveness detection adds approximately 10-15 seconds to the overall verification flow.

## Common Rejection Reasons
- Liveness confidence score below threshold (possible spoofing attempt: photo-of-photo, screen replay)
- Poor lighting conditions reducing detection confidence
- Face not fully visible in frame (partial occlusion, extreme angle)

## Escalation
Requests that fail liveness detection twice in a row are flagged for manual review rather than automatically rejected, to avoid penalizing users with genuine capture issues (e.g., poor camera quality, low light).
