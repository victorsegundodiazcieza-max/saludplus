"""
routers/admin.py
Endpoints protegidos con JWT para el panel de administración de SaludPlus.

Autenticación:
  - POST /api/admin/login  → devuelve JWT
  - Todos los demás endpoints requieren: Authorization: Bearer <token>

Operaciones disponibles:
  - Servicios: GET, POST, PUT, DELETE
  - FAQs:      GET, POST, PUT, DELETE

Usa la SERVICE_ROLE key de Supabase (bypasea RLS).
"""

import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from supabase import create_client, Client

router = APIRouter()

# ── Seguridad ──────────────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


def _jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET no configurado")
    return secret


def _create_access_token(data: dict) -> str:
    expire_minutes = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    return jwt.encode(payload, _jwt_secret(), algorithm=os.getenv("JWT_ALGORITHM", "HS256"))


def _verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            _jwt_secret(),
            algorithms=[os.getenv("JWT_ALGORITHM", "HS256")],
        )
        if payload.get("sub") is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )


# Dependencia reutilizable
AdminDep = Depends(_verify_token)


# ── Cliente Supabase (service_role — acceso total) ────────────────────────────

def get_supabase_admin() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridos")
    return create_client(url, key)


# ── Schemas ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


# ─ Servicios ─
class ServicioCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    descripcion: Optional[str] = None
    descripcion_larga: Optional[str] = None
    icono: Optional[str] = None
    imagen_url: Optional[str] = None
    color_hex: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    orden: int = 0
    activo: bool = True


class ServicioUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=100)
    slug: Optional[str] = Field(None, min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    descripcion: Optional[str] = None
    descripcion_larga: Optional[str] = None
    icono: Optional[str] = None
    imagen_url: Optional[str] = None
    color_hex: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    orden: Optional[int] = None
    activo: Optional[bool] = None


# ─ FAQs ─
class FaqCreate(BaseModel):
    pregunta: str = Field(..., min_length=5, max_length=300)
    respuesta: str = Field(..., min_length=5)
    categoria: Optional[str] = None
    servicio_id: Optional[str] = None
    orden: int = 0
    activo: bool = True


class FaqUpdate(BaseModel):
    pregunta: Optional[str] = Field(None, min_length=5, max_length=300)
    respuesta: Optional[str] = Field(None, min_length=5)
    categoria: Optional[str] = None
    servicio_id: Optional[str] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


# ── LOGIN ──────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    """
    Autentica al administrador con email y contraseña.
    Devuelve un JWT para usar en los endpoints protegidos.
    """
    admin_email = os.getenv("ADMIN_EMAIL", "")
    admin_password = os.getenv("ADMIN_PASSWORD", "")

    # Comparación de email (case-insensitive)
    if body.email.lower() != admin_email.lower():
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    # Intentar comparación bcrypt primero; si la contraseña en .env
    # es texto plano (modo dev), comparar directamente.
    try:
        # Si ADMIN_PASSWORD comienza con $2b$ o $2a$, es un hash bcrypt
        if admin_password.startswith("$2"):
            password_ok = pwd_context.verify(body.password, admin_password)
        else:
            # Desarrollo: comparación simple (no recomendado en producción)
            password_ok = body.password == admin_password
    except Exception:
        password_ok = False

    if not password_ok:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    token = _create_access_token({"sub": admin_email, "role": "admin"})
    return LoginResponse(access_token=token, email=admin_email)


# ── SERVICIOS ─────────────────────────────────────────────────────────────────

@router.get("/servicios")
async def admin_list_servicios(_: dict = AdminDep):
    """Lista todos los servicios (incluye inactivos)."""
    sb = get_supabase_admin()
    try:
        res = sb.table("servicios").select("*").order("orden").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return res.data


@router.post("/servicios", status_code=201)
async def admin_create_servicio(body: ServicioCreate, _: dict = AdminDep):
    """Crea un nuevo servicio / especialidad."""
    sb = get_supabase_admin()
    try:
        res = sb.table("servicios").insert(body.model_dump()).execute()
    except Exception as e:
        # Detectar slug duplicado
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"El slug '{body.slug}' ya existe")
        raise HTTPException(status_code=500, detail=str(e))

    if not res.data:
        raise HTTPException(status_code=500, detail="No se pudo crear el servicio")
    return res.data[0]


@router.put("/servicios/{servicio_id}")
async def admin_update_servicio(
    servicio_id: str,
    body: ServicioUpdate,
    _: dict = AdminDep,
):
    """Actualiza un servicio existente. Solo los campos enviados son modificados."""
    sb = get_supabase_admin()

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    try:
        res = (
            sb.table("servicios")
            .update(update_data)
            .eq("id", servicio_id)
            .execute()
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="El slug ya está en uso")
        raise HTTPException(status_code=500, detail=str(e))

    if not res.data:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return res.data[0]


@router.delete("/servicios/{servicio_id}", status_code=204)
async def admin_delete_servicio(servicio_id: str, _: dict = AdminDep):
    """
    Elimina un servicio.
    Precaución: los doctores con este servicio quedarán sin especialidad (SET NULL por FK).
    """
    sb = get_supabase_admin()
    try:
        sb.table("servicios").delete().eq("id", servicio_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return None


# ── FAQs ──────────────────────────────────────────────────────────────────────

@router.get("/faqs")
async def admin_list_faqs(_: dict = AdminDep):
    """Lista todas las FAQs (incluye inactivas)."""
    sb = get_supabase_admin()
    try:
        res = (
            sb.table("faqs")
            .select("*, servicios(nombre, slug)")
            .order("orden")
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return res.data


@router.post("/faqs", status_code=201)
async def admin_create_faq(body: FaqCreate, _: dict = AdminDep):
    """Crea una nueva pregunta frecuente."""
    sb = get_supabase_admin()
    try:
        res = sb.table("faqs").insert(body.model_dump()).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not res.data:
        raise HTTPException(status_code=500, detail="No se pudo crear la FAQ")
    return res.data[0]


@router.put("/faqs/{faq_id}")
async def admin_update_faq(faq_id: str, body: FaqUpdate, _: dict = AdminDep):
    """Actualiza una FAQ existente."""
    sb = get_supabase_admin()

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    try:
        res = (
            sb.table("faqs")
            .update(update_data)
            .eq("id", faq_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not res.data:
        raise HTTPException(status_code=404, detail="FAQ no encontrada")
    return res.data[0]


@router.delete("/faqs/{faq_id}", status_code=204)
async def admin_delete_faq(faq_id: str, _: dict = AdminDep):
    """Elimina una FAQ."""
    sb = get_supabase_admin()
    try:
        sb.table("faqs").delete().eq("id", faq_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return None


# ── Dashboard stats (bonus) ────────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(_: dict = AdminDep):
    """
    Resumen rápido para el dashboard del admin:
    total de servicios, doctores y FAQs activos.
    """
    sb = get_supabase_admin()
    try:
        servicios = sb.table("servicios").select("id", count="exact").eq("activo", True).execute()
        doctores  = sb.table("doctores").select("id", count="exact").eq("activo", True).execute()
        faqs      = sb.table("faqs").select("id", count="exact").eq("activo", True).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "servicios_activos": servicios.count,
        "doctores_activos":  doctores.count,
        "faqs_activas":      faqs.count,
    }
