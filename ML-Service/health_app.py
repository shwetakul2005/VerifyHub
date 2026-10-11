"""Small health router that can be exercised without importing face models."""

from fastapi import APIRouter, FastAPI
from fastapi.responses import JSONResponse


def create_health_router(is_ready):
    router = APIRouter()

    @router.get("/health/live")
    def live():
        return {"status": "live"}

    @router.get("/health/ready")
    def ready():
        if not is_ready():
            return JSONResponse(status_code=503, content={"status": "not_ready"})
        return {"status": "ready"}

    return router


def create_health_app(is_ready):
    app = FastAPI(title="Verification health")
    app.include_router(create_health_router(is_ready))
    return app
