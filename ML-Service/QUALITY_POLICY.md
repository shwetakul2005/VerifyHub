# Image-quality policy v1

`image-quality-v1` reports document and selfie image usability. It is not liveness or anti-spoofing detection. Scores are engineering defaults, not calibrated identity-decision thresholds.

JPEG and PNG uploads must match their extension and MIME type, decode successfully, be at most 5 MB, have sides no longer than 8,000 pixels, and contain at most 20 megapixels. Dimensions are inspected from the file header before decoding. Documents need at least 640 × 400 pixels; selfies need at least 320 × 320.

| Check | Pass rule | Score contribution |
| --- | --- | ---: |
| Resolution | Meets minimum dimensions | 20% |
| Sharpness | Laplacian variance ≥ 80 | 30% |
| Brightness | Mean grayscale intensity 45–210 | 20% |
| Contrast | Grayscale standard deviation ≥ 35 | 20% |
| Glare | Less than 80% of pixels near white | 10% |

Each check exposes a bounded score and pass flag. A critical resolution failure, extreme darkness, or aggregate score below 0.4 is `unusable`. Other failed checks or a score below 0.75 are `borderline`. Remaining images are `usable`. The coarse glare measure and these numerical thresholds require calibration on a consented fixture set before they drive automatic identity decisions. A usable image says nothing about document authenticity or whether the person is physically present.
