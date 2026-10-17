from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import citations, materials, micrograph, steel


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        app.state.http = client
        yield


settings = get_settings()

app = FastAPI(
    title="SMSE AI Toolkit API",
    description="Micrograph recognition, steel property prediction, materials database lookup and citation generation.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(materials.router)
app.include_router(steel.router)
app.include_router(micrograph.router)
app.include_router(citations.router)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "materials_project_configured": bool(settings.mp_api_key),
        "steel_model_ready": steel.model_ready(),
        "micrograph_model_ready": micrograph.model_ready(),
    }
