from fastapi import FastAPI
from routers.face import router as face_router

app = FastAPI(title="ML Verification Service")

app.include_router(face_router)

@app.get("/")
def root():
    return {"message": "ML Service Running"}