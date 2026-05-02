"""
routers/clinica.py
Endpoints públicos GET — conectados a Supabase con la anon key.
No requieren autenticación.
"""

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from supabase import create_client, Client

router = APIRouter()


# ── Cliente Supabase (anon key — solo lectura pública) ───────────────────────
def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL y SUPABASE_ANON_KEY son requeridos")
    return create_client(url, key)


# ── /api/clinica ─────────────────────────────────────────────────────────────
@router.get("/clinica")
async def get_clinica():
    """
    Devuelve la configuración general de la clínica:
    nombre, dirección, teléfonos, horarios, redes sociales, seguros aceptados.
    """
    sb = get_supabase()
    try:
        res = sb.table("config_clinica").select("*").limit(1).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar Supabase: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail="Configuración de clínica no encontrada")

    return res.data[0]


# ── /api/servicios ────────────────────────────────────────────────────────────
@router.get("/servicios")
async def get_servicios(activo: bool = True):
    """
    Lista todos los servicios (especialidades) de la clínica.
    Ordenados por el campo `orden`.
    """
    sb = get_supabase()
    try:
        query = (
            sb.table("servicios")
            .select("id, nombre, slug, descripcion, descripcion_larga, icono, color_hex, orden")
            .eq("activo", activo)
            .order("orden")
        )
        res = query.execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar servicios: {e}")

    return res.data


@router.get("/servicios/{slug}")
async def get_servicio_por_slug(slug: str):
    """
    Detalle de un servicio por su slug.
    Incluye la lista de doctores activos de esa especialidad.
    """
    sb = get_supabase()
    try:
        res = (
            sb.table("servicios")
            .select("*")
            .eq("slug", slug)
            .eq("activo", True)
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar servicio: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail=f"Servicio '{slug}' no encontrado")

    servicio = res.data[0]

    # Doctores de esta especialidad
    try:
        docs = (
            sb.table("doctores")
            .select(
                "id, nombres, apellidos, slug, titulo, foto_url, bio, "
                "especialidades, idiomas, atencion_online, precio_consulta"
            )
            .eq("servicio_id", servicio["id"])
            .eq("activo", True)
            .order("orden")
            .execute()
        )
        servicio["doctores"] = docs.data
    except Exception:
        servicio["doctores"] = []

    return servicio


# ── /api/doctores ─────────────────────────────────────────────────────────────
@router.get("/doctores")
async def get_doctores(
    servicio_slug: Optional[str] = Query(None, description="Filtrar por slug de servicio"),
    online: Optional[bool] = Query(None, description="Solo doctores con atención online"),
):
    """
    Lista de doctores activos.
    Acepta filtros opcionales: servicio_slug y online.
    """
    sb = get_supabase()

    select_cols = (
        "id, nombres, apellidos, slug, titulo, foto_url, bio, "
        "especialidades, idiomas, atencion_online, precio_consulta, orden, "
        "servicio_id, servicios(nombre, slug, color_hex)"
    )

    try:
        query = sb.table("doctores").select(select_cols).eq("activo", True)

        if online is not None:
            query = query.eq("atencion_online", online)

        if servicio_slug:
            # Necesitamos resolver el slug al id primero
            srv = (
                sb.table("servicios")
                .select("id")
                .eq("slug", servicio_slug)
                .limit(1)
                .execute()
            )
            if not srv.data:
                raise HTTPException(status_code=404, detail=f"Servicio '{servicio_slug}' no encontrado")
            query = query.eq("servicio_id", srv.data[0]["id"])

        res = query.order("orden").execute()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar doctores: {e}")

    return res.data


@router.get("/doctores/{slug}")
async def get_doctor_por_slug(slug: str):
    """
    Perfil completo de un doctor, incluyendo horarios activos.
    """
    sb = get_supabase()

    select_cols = (
        "id, nombres, apellidos, slug, titulo, cmp, rne, foto_url, bio, "
        "educacion, especialidades, idiomas, atencion_online, precio_consulta, "
        "servicio_id, servicios(nombre, slug, color_hex, icono)"
    )

    try:
        res = (
            sb.table("doctores")
            .select(select_cols)
            .eq("slug", slug)
            .eq("activo", True)
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar doctor: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail=f"Doctor '{slug}' no encontrado")

    doctor = res.data[0]

    # Horarios del doctor
    try:
        horarios = (
            sb.table("horarios")
            .select("dia_semana, hora_inicio, hora_fin, duracion_min, max_citas, notas")
            .eq("doctor_id", doctor["id"])
            .eq("activo", True)
            .order("dia_semana")
            .order("hora_inicio")
            .execute()
        )
        doctor["horarios"] = horarios.data
    except Exception:
        doctor["horarios"] = []

    return doctor


# ── /api/faqs ─────────────────────────────────────────────────────────────────
@router.get("/faqs")
async def get_faqs(
    categoria: Optional[str] = Query(None, description="Filtrar por categoría"),
    servicio_slug: Optional[str] = Query(None, description="FAQs de una especialidad"),
):
    """
    Lista de preguntas frecuentes activas.
    Filtros opcionales: categoria, servicio_slug.
    """
    sb = get_supabase()

    select_cols = "id, pregunta, respuesta, categoria, orden, servicio_id"

    try:
        query = sb.table("faqs").select(select_cols).eq("activo", True)

        if categoria:
            query = query.eq("categoria", categoria)

        if servicio_slug:
            srv = (
                sb.table("servicios")
                .select("id")
                .eq("slug", servicio_slug)
                .limit(1)
                .execute()
            )
            if srv.data:
                query = query.eq("servicio_id", srv.data[0]["id"])

        res = query.order("orden").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar FAQs: {e}")

    return res.data
