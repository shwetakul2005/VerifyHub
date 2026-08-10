from insightface.app import FaceAnalysis
import cv2
import os
import uuid
class FaceDetector:
    def __init__(self):
        # Load model once
        self.app = FaceAnalysis(name="buffalo_s", providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=0, det_size=(640,640))

    def detect(self, img):
        # Return bounding boxes
        if img is None:
            raise ValueError("Unable to read image.")
        return self.app.get(img)

    def crop_face(self, image, bbox):
        x1, y1, x2, y2 = map(int, bbox)

        # Prevent going outside image boundaries
        h, w = image.shape[:2]

        x1 = max(0, x1)
        y1 = max(0, y1)
        x2 = min(w, x2)
        y2 = min(h, y2)

        return image[y1:y2, x1:x2]
        

    def save_face(self, face_image):
        os.makedirs("faces", exist_ok=True)
        filename = f"{uuid.uuid4().hex}.jpg"
        path = os.path.join("faces", filename)
        cv2.imwrite(path, face_image)
        return path

    def get_embedding(self, image):

        faces = self.detect(image)
        if len(faces) == 0:
            return None
        if len(faces) > 1:
            raise ValueError("Multiple faces detected")
        return faces[0].embedding
    
