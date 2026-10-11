"""FastAPI entrypoint. Heavy models are constructed once during startup."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from health_app import create_health_router
from routers.face import router as face_router
from routers.image_quality import router as image_quality_router
from routers.face_v1 import router as face_v1_router


def _load_models():
    from services.face_verification import FaceVerificationService

    verifier = FaceVerificationService()
    return verifier, verifier.detector


def create_app(model_loader=None, include_rag=True):
    load_models = model_loader or _load_models

    @asynccontextmanager
    async def lifespan(application):
        application.state.model_ready = False
        verifier, detector = load_models()
        application.state.verification_service = verifier
        application.state.detector = detector
        application.state.model_ready = True
        try:
            yield
        finally:
            application.state.model_ready = False

    application = FastAPI(title="ML Verification Service", lifespan=lifespan)
    application.state.model_ready = False
    application.include_router(create_health_router(lambda: application.state.model_ready))
    application.include_router(face_router)
    application.include_router(image_quality_router)
    application.include_router(face_v1_router)
    if include_rag:
        from RAG.router import router as rag_router
        application.include_router(rag_router)

    @application.get("/")
    def root():
        return {"message": "ML Service Running"}

    return application


app = create_app()
