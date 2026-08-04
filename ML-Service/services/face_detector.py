from insightface.app import FaceAnalysis
import cv2

class FaceDetector:
    def __init__(self):
        # Load model once
        self.app = FaceAnalysis(name="buffalo_s", providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=0, det_size=(640,640))

    def detect(self, img):
        # Return bounding boxes
        if img is None:
            raise ValueError("Unable to read image.")
        
        # img = cv2.imread(image_path)
        faces = self.app.get(img)

        if not faces:
            return {"faceFound": False}
        face = faces[0]
        return {
            "bbox": face.bbox.tolist(),
            "confidence": float(face.det_score)
        }

    # def crop_face(self, image_path, bbox):
    #     # Return cropped image    
        

    # def save_face(self, face, output_path):
    #     # Save cropped face




