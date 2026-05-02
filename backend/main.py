"""
SaludPlus – Backend principal
Arranque compatible con Render: uvicorn main:app --host 0.0.0.0 --port $PORT
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from routers import clinica, chat, admin  # noqa: E402  (importar tras load_dotenv)


# ── Lifespan (startup / shutdown) ────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("✅  SaludPlus API arrancando...")
    yield
    print("🛑  SaludPlus API apagando...")


# ── Aplicación ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="SaludPlus API",
    description="Backend para la clínica SaludPlus – Chiclayo, Perú",
    version="1.0.0",
    lifespan=lifespan,
    # Deshabilitar docs en producción es opcional; los dejamos activos para el portafolio
    docs_url="/docs",
    redoc_url="/redoc",
)


# ── CORS ─────────────────────────────────────────────────────────────────────
_raw_origins = os.getenv("CORS_ORIGINS", "*")
origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(clinica.router, prefix="/api", tags=["Clínica (público)"])
app.include_router(chat.router,   prefix="/api", tags=["Chatbot"])
app.include_router(admin.router,  prefix="/api/admin", tags=["Admin (protegido)"])


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {
        "status": "ok",
        "app": "SaludPlus API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
