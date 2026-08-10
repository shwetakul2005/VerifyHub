import numpy as np

class FaceMatcher:

    @staticmethod
    def cosine_similarity(embedding1, embedding2):
        return float(
            np.dot(embedding1, embedding2)
            / (np.linalg.norm(embedding1) * np.linalg.norm(embedding2))
        )

    @staticmethod
    def is_match(score, threshold=0.6):
        return score >= threshold

    def compare(self, embedding1, embedding2, threshold=0.6):

        score = self.cosine_similarity(embedding1, embedding2)

        return {
            "matched": self.is_match(score, threshold),
            "similarity": round(score, 4),
            "threshold": threshold
        }