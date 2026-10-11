from calibration.evaluate_thresholds import evaluate_thresholds


def test_threshold_report_uses_labelled_scores_without_changing_decision_policy():
    samples = [
        {"similarity": 0.92, "is_same_person": True},
        {"similarity": 0.81, "is_same_person": True},
        {"similarity": 0.44, "is_same_person": False},
        {"similarity": 0.27, "is_same_person": False},
    ]

    report = evaluate_thresholds(samples, [0.5, 0.8, 0.9])

    assert report[0]["threshold"] == 0.5
    assert report[0]["false_acceptance_rate"] == 0
    assert report[0]["false_rejection_rate"] == 0
    assert report[2]["false_rejection_rate"] == 0.5


def test_threshold_report_rejects_unlabelled_or_one_class_data():
    try:
        evaluate_thresholds([{"similarity": 0.8}], [0.5])
        assert False, "expected invalid calibration data"
    except ValueError as error:
        assert "is_same_person" in str(error)

    try:
        evaluate_thresholds([{"similarity": 0.8, "is_same_person": True}], [0.5])
        assert False, "expected both classes to be required"
    except ValueError as error:
        assert "both" in str(error)
