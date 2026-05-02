"""
routers/chat.py
Endpoint POST /chat — Chatbot de SaludPlus.

Flujo:
  1. Carga datos reales de Supabase (clínica, servicios, doctores, FAQs).
  2. Construye un system prompt detallado con esos datos.
  3. Llama a claude-haiku-4-5-20251001 con el historial completo de la conversación.
  4. Devuelve la respuesta y el historial actualizado.
"""

import os
from typing import List, Optional

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from supabase import create_client, Client

router = APIRouter()

# ── Modelo de datos ────────────────────────────────────────────────────────────

class MensajeChat(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    mensaje: str = Field(..., min_length=1, max_length=1000)
    historial: List[MensajeChat] = Field(default_factory=list)


class ChatResponse(BaseModel):
    respuesta: str
    historial: List[MensajeChat]


# ── Helpers Supabase ───────────────────────────────────────────────────────────

def _supabase_anon() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("Faltan variables de Supabase")
    return create_client(url, key)


def _cargar_contexto_clinica() -> dict:
    """
    Trae de Supabase toda la información necesaria para el system prompt.
    Devuelve un dict con: clinica, servicios, doctores, faqs.
    """
    sb = _supabase_anon()

    clinica_res = sb.table("config_clinica").select("*").limit(1).execute()
    clinica = clinica_res.data[0] if clinica_res.data else {}

    servicios_res = (
        sb.table("servicios")
        .select("nombre, slug, descripcion")
        .eq("activo", True)
        .order("orden")
        .execute()
    )

    doctores_res = (
        sb.table("doctores")
        .select(
            "nombres, apellidos, titulo, especialidades, "
            "atencion_online, precio_consulta, "
            "servicios(nombre)"
        )
        .eq("activo", True)
        .order("orden")
        .execute()
    )

    faqs_res = (
        sb.table("faqs")
        .select("pregunta, respuesta")
        .eq("activo", True)
        .order("orden")
        .execute()
    )

    return {
        "clinica": clinica,
        "servicios": servicios_res.data,
        "doctores": doctores_res.data,
        "faqs": faqs_res.data,
    }


# ── Construcción del system prompt ────────────────────────────────────────────

def _build_system_prompt(ctx: dict) -> str:
    clinica = ctx.get("clinica", {})
    servicios = ctx.get("servicios", [])
    doctores = ctx.get("doctores", [])
    faqs = ctx.get("faqs", [])

    # ── Sección: datos de la clínica ──
    horario = clinica.get("horario_atencion", {})
    horario_str = ""
    if isinstance(horario, dict):
        horario_str = ", ".join(f"{k}: {v}" for k, v in horario.items())
    elif isinstance(horario, str):
        horario_str = horario

    seguros = clinica.get("seguros_aceptados", [])
    seguros_str = ", ".join(seguros) if seguros else "consultar directamente"

    redes = clinica.get("redes_sociales", {})
    redes_str = ""
    if isinstance(redes, dict):
        redes_str = ", ".join(f"{k}: {v}" for k, v in redes.items())

    clinica_section = f"""
DATOS DE LA CLÍNICA:
- Nombre: {clinica.get('nombre', 'SaludPlus')}
- Slogan: {clinica.get('slogan', '')}
- Dirección: {clinica.get('direccion', '')}, {clinica.get('distrito', '')}, {clinica.get('ciudad', 'Chiclayo')}
- Teléfono 1: {clinica.get('telefono_1', '')}
- Teléfono 2: {clinica.get('telefono_2', '')}
- WhatsApp: {clinica.get('whatsapp', '')}
- Email contacto: {clinica.get('email_contacto', '')}
- Email citas: {clinica.get('email_citas', '')}
- Horario de atención: {horario_str}
- Seguros aceptados: {seguros_str}
- Redes sociales: {redes_str}
""".strip()

    # ── Sección: servicios ──
    servicios_lines = []
    for s in servicios:
        servicios_lines.append(f"  • {s['nombre']}: {s.get('descripcion', '')}")
    servicios_section = "ESPECIALIDADES DISPONIBLES:\n" + "\n".join(servicios_lines)

    # ── Sección: doctores ──
    doctores_lines = []
    for d in doctores:
        nombre = f"Dr./Dra. {d['nombres']} {d['apellidos']}"
        especialidad = ""
        if d.get("servicios") and isinstance(d["servicios"], dict):
            especialidad = d["servicios"].get("nombre", "")
        online = "Atiende online" if d.get("atencion_online") else "Solo presencial"
        precio = f"S/ {d['precio_consulta']:.0f}" if d.get("precio_consulta") else "consultar"
        doctores_lines.append(
            f"  • {nombre} — {d.get('titulo', '')} ({especialidad}) | {online} | Consulta desde {precio}"
        )
    doctores_section = "MÉDICOS DISPONIBLES:\n" + "\n".join(doctores_lines)

    # ── Sección: FAQs ──
    faqs_lines = []
    for f in faqs:
        faqs_lines.append(f"  P: {f['pregunta']}\n  R: {f['respuesta']}")
    faqs_section = "PREGUNTAS FRECUENTES:\n" + "\n\n".join(faqs_lines)

    # ── System prompt completo ──
    system_prompt = f"""Eres el asistente virtual de {clinica.get('nombre', 'SaludPlus')}, una clínica médica ubicada en Chiclayo, Perú.
Tu rol es ayudar a los pacientes y visitantes del sitio web con información sobre la clínica, sus servicios, médicos, horarios y el proceso de agendamiento de citas.

PERSONALIDAD Y TONO:
- Amable, profesional y empático.
- Respuestas concisas (máximo 3-4 oraciones por respuesta, salvo que se pida más detalle).
- Usa español neutro con términos peruanos naturales (no uses "vosotros", sí "usted" o "tú").
- Siempre ofrece como siguiente paso agendar una cita o contactar por WhatsApp.

---

{clinica_section}

---

{servicios_section}

---

{doctores_section}

---

{faqs_section}

---

LÍMITES ESTRICTOS — NUNCA hagas lo siguiente:
1. NO hagas diagnósticos médicos ni interpretes síntomas.
2. NO recomiendes medicamentos ni dosis.
3. NO interpretes resultados de exámenes o análisis clínicos.
4. NO des precios exactos de procedimientos quirúrgicos o estudios especiales (solo de consulta).
5. NO inventes información que no esté en los datos anteriores.
6. NO respondas preguntas que no tengan relación con la clínica (política, entretenimiento, etc.).

Si alguien pregunta algo fuera de tus límites, responde: "Esa es una consulta médica que solo un especialista puede responder con seguridad. ¿Te agendamos una cita con alguno de nuestros médicos?"

FLUJO DE AGENDAMIENTO:
Si el usuario quiere una cita, guíalo así:
  1. Pregunta qué especialidad necesita.
  2. Menciona los médicos disponibles de esa área.
  3. Indica que puede agendar en: {clinica.get('email_citas', 'citas@saludplus.pe')} o WhatsApp {clinica.get('whatsapp', '')}.
  4. Si el sitio tiene formulario web, redirige a la sección "Agendar Cita".
"""
    return system_prompt


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest):
    """
    Recibe un mensaje y el historial de la conversación.
    Devuelve la respuesta del chatbot y el historial actualizado.

    - El historial debe ser una lista de objetos {role, content} alternando user/assistant.
    - Máximo 20 turnos de historial para evitar tokens excesivos.
    """
    # Limitar historial a los últimos 20 turnos (40 mensajes)
    historial_recortado = body.historial[-40:]

    # Cargar contexto real de Supabase
    try:
        ctx = _cargar_contexto_clinica()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al cargar contexto: {e}")

    system_prompt = _build_system_prompt(ctx)

    # Construir lista de mensajes para la API de Anthropic
    messages = [
        {"role": m.role, "content": m.content}
        for m in historial_recortado
    ]
    messages.append({"role": "user", "content": body.mensaje})

    # Llamar a Claude Haiku
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY no configurada")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=system_prompt,
            messages=messages,
        )
    except anthropic.APIStatusError as e:
        raise HTTPException(status_code=502, detail=f"Error de API Anthropic: {e.message}")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=503, detail="No se pudo conectar con Anthropic")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inesperado: {e}")

    respuesta_texto = response.content[0].text

    # Historial actualizado para devolver al frontend
    historial_nuevo = list(historial_recortado) + [
        MensajeChat(role="user", content=body.mensaje),
        MensajeChat(role="assistant", content=respuesta_texto),
    ]

    return ChatResponse(
        respuesta=respuesta_texto,
        historial=historial_nuevo,
    )
