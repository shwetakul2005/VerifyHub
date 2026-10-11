"""Evaluate face-similarity thresholds on consented, labelled scores.

This offline report does not update runtime configuration. Low similarity remains a
manual-review signal in the Phase 3 policy until a separately approved calibration
and risk review changes that policy.
"""

import argparse
import json
from pathlib import Path


def evaluate_thresholds(samples, thresholds):
    if not samples or any("similarity" not in row or "is_same_person" not in row for row in samples):
        raise ValueError("Each sample requires similarity and is_same_person.")
    positives = sum(row["is_same_person"] is True for row in samples)
    negatives = sum(row["is_same_person"] is False for row in samples)
    if positives == 0 or negatives == 0:
        raise ValueError("Calibration data must contain both same-person and different-person samples.")

    report = []
    for threshold in sorted(thresholds):
        if not 0 <= threshold <= 1:
            raise ValueError("Thresholds must be between 0 and 1.")
        false_accepts = sum(row["is_same_person"] is False and row["similarity"] >= threshold for row in samples)
        false_rejects = sum(row["is_same_person"] is True and row["similarity"] < threshold for row in samples)
        report.append({
            "threshold": threshold,
            "sample_count": len(samples),
            "false_acceptance_rate": false_accepts / negatives,
            "false_rejection_rate": false_rejects / positives,
            "balanced_error_rate": ((false_accepts / negatives) + (false_rejects / positives)) / 2,
        })
    return report


def main():
    parser = argparse.ArgumentParser(description="Generate an offline face-threshold evaluation report.")
    parser.add_argument("manifest", type=Path, help="JSON file containing labelled similarity scores")
    parser.add_argument("--thresholds", type=float, nargs="+", default=[0.5, 0.6, 0.7, 0.8])
    args = parser.parse_args()
    samples = json.loads(args.manifest.read_text(encoding="utf-8"))
    print(json.dumps(evaluate_thresholds(samples, args.thresholds), indent=2))


if __name__ == "__main__":
    main()
