import numpy as np

class FaceMatcher:

    @staticmethod
    def cosine_similarity(embedding1, embedding2):
        left = np.asarray(embedding1, dtype=np.float64)
        right = np.asarray(embedding2, dtype=np.float64)
        if (left.ndim != 1 or right.ndim != 1 or left.size == 0 or
                left.shape != right.shape or not np.isfinite(left).all() or
                not np.isfinite(right).all()):
            raise ValueError("Invalid face embedding.")
        denominator = np.linalg.norm(left) * np.linalg.norm(right)
        if not np.isfinite(denominator) or denominator == 0:
            raise ValueError("Invalid face embedding norm.")
        return float(np.clip(np.dot(left, right) / denominator, -1, 1))

    @staticmethod
    def is_match(score, threshold=0.6):
        return score >= threshold

    def compare(self, embedding1, embedding2, threshold=0.6):
        if not np.isfinite(threshold) or not 0 <= threshold <= 1:
            raise ValueError("Invalid face comparison threshold.")
        score = self.cosine_similarity(embedding1, embedding2)

        return {
            "matched": self.is_match(score, threshold),
            "similarity": round(score, 4),
            "threshold": threshold
        }
