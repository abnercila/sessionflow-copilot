import os
import json
import base64
import asyncio
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import requests

load_dotenv()

app = FastAPI(title="SessionFlow AI - Meeting & Process Copilot", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory config with fallback to environment
CONFIG = {
    "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
    "claude_api_key": os.getenv("CLAUDE_API_KEY", ""),
    "groq_api_key": os.getenv("GROQ_API_KEY", ""),
    "model_transcribe": "gemini-2.0-flash",
    "model_vision": "gemini-2.0-flash",
    "model_analysis": "gemini-2.0-flash"
}

# Ensure upload directory exists
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class SettingsRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    claude_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    model_preference: Optional[str] = "gemini-2.0-flash"

class VisionAnalyzeRequest(BaseModel):
    image_base64: str
    timestamp: Optional[str] = "00:00"
    source_type: Optional[str] = "screen_photo" # "teams_chat", "diagram", "slide", "screen_photo", "camera"
    context_hint: Optional[str] = ""

class ProcessAnalyzeRequest(BaseModel):
    session_title: str
    transcript_text: str
    transcript_items: Optional[List[Dict[str, Any]]] = []
    ocr_items: Optional[List[Dict[str, Any]]] = []
    custom_instructions: Optional[str] = ""

class ChatCopilotRequest(BaseModel):
    message: str
    chat_history: Optional[List[Dict[str, str]]] = []
    session_title: str
    transcript_text: str
    ocr_items: Optional[List[Dict[str, Any]]] = []

class ClaudeExportRequest(BaseModel):
    session_title: str
    transcript_items: List[Dict[str, Any]]
    ocr_items: List[Dict[str, Any]]
    process_flow: Optional[Dict[str, Any]] = None
    user_goal: Optional[str] = "Entender a fondo el proceso, flujo de trabajo y términos para dominar mis tareas laborales."

def get_active_gemini_key():
    return CONFIG["gemini_api_key"] or os.getenv("GEMINI_API_KEY", "")

def call_gemini_generate(prompt: str, images: Optional[List[Dict[str, str]]] = None, system_instruction: str = "", model: str = "gemini-2.0-flash") -> str:
    """Helper to call Google Gemini API with fallback to direct REST API."""
    api_key = get_active_gemini_key()
    if not api_key:
        raise HTTPException(
            status_code=400, 
            detail="Falta configurar la API Key de Gemini en Ajustes o variable de entorno GEMINI_API_KEY."
        )

    # Use Google Gemini REST API v1beta
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    contents = []
    parts = []
    
    if images:
        for img in images:
            # format: {"mime_type": "image/jpeg", "data": base64_str}
            parts.append({
                "inline_data": {
                    "mime_type": img.get("mime_type", "image/jpeg"),
                    "data": img.get("data", "")
                }
            })
            
    parts.append({"text": prompt})
    contents.append({"parts": parts})
    
    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.3,
            "topP": 0.95,
            "maxOutputTokens": 8192,
        }
    }
    
    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }

    headers = {"Content-Type": "application/json"}
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=90)
        if response.status_code != 200:
            err_msg = response.text
            try:
                err_json = response.json()
                err_msg = err_json.get("error", {}).get("message", response.text)
            except Exception:
                pass
            raise HTTPException(status_code=response.status_code, detail=f"Error en Gemini API: {err_msg}")
            
        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return "No se obtuvo respuesta del modelo."
        
        content = candidates[0].get("content", {})
        parts_resp = content.get("parts", [])
        text_resp = "".join([p.get("text", "") for p in parts_resp])
        return text_resp
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error de conexión con Gemini: {str(e)}")

@app.get("/api/health")
def health_check():
    has_key = bool(get_active_gemini_key())
    return {
        "status": "online",
        "has_gemini_key": has_key,
        "has_claude_key": bool(CONFIG["claude_api_key"]),
        "has_groq_key": bool(CONFIG["groq_api_key"])
    }

@app.post("/api/settings")
def update_settings(req: SettingsRequest):
    if req.gemini_api_key is not None:
        CONFIG["gemini_api_key"] = req.gemini_api_key.strip()
    if req.claude_api_key is not None:
        CONFIG["claude_api_key"] = req.claude_api_key.strip()
    if req.groq_api_key is not None:
        CONFIG["groq_api_key"] = req.groq_api_key.strip()
    if req.model_preference:
        CONFIG["model_analysis"] = req.model_preference
        
    return {
        "status": "success",
        "message": "Configuración actualizada",
        "has_gemini_key": bool(get_active_gemini_key())
    }

@app.post("/api/vision-ocr")
async def process_vision_ocr(req: VisionAnalyzeRequest):
    """
    Analyzes an image (photo of screen, Teams chat, diagram, slide, camera capture)
    Extracts text cleanly and provides structured interpretation of the workflow/diagram.
    """
    raw_b64 = req.image_base64
    mime_type = "image/jpeg"
    if "data:" in raw_b64 and ";base64," in raw_b64:
        header, raw_b64 = raw_b64.split(";base64,", 1)
        mime_type = header.replace("data:", "")
        
    system_prompt = """Eres un experto analista de procesos empresariales y especialista en OCR visual y visión por computadora.
Tu objetivo es analizar fotografías o capturas de pantallas de trabajo (como chats de Microsoft Teams, diagramas de flujo, diapositivas, código, pantallas de sistemas o fotos tomadas con el celular a monitores).

Debes devolver SIEMPRE una respuesta en formato JSON estrictamente válido con la siguiente estructura:
{
  "detected_type": "teams_chat" | "diagram_workflow" | "slide_presentation" | "system_ui" | "document_table" | "other",
  "title_summary": "Título descriptivo breve de lo que muestra la imagen",
  "full_ocr_text": "Texto exacto y completo extraído de la imagen (mantén participantes de Teams, fechas, código y pasos)",
  "structured_elements": [
    {
      "element_type": "chat_message" | "process_step" | "system_component" | "key_data",
      "author_or_label": "Nombre de persona o etiqueta del paso",
      "content": "Descripción o mensaje"
    }
  ],
  "process_interpretation": "Explicación clara, didáctica y en español de qué significa este contenido dentro del proceso o flujo de trabajo del usuario. Explícalo paso a paso para que alguien nuevo en el trabajo lo entienda perfectamente.",
  "suggested_mermaid_node": "Fragmento opcional de código Mermaid que represente esta parte (ej: StepA[Paso X] --> StepB[Paso Y])"
}
Solo responde con el objeto JSON, sin bloques de markdown adicionales ni texto fuera del JSON."""

    user_prompt = f"""Analiza con máxima precisión esta imagen capturada en el minuto {req.timestamp} de la sesión de trabajo.
Contexto adicional del usuario: {req.context_hint if req.context_hint else 'Foto de pantalla de trabajo / reunión / Teams / flujo de procesos.'}

Asegúrate de:
1. Extraer absolutamente TODO el texto legible (incluso si la foto fue tomada con celular a un monitor o pantalla de Teams).
2. Si es un chat de Teams, identifica quién escribió qué y la orden o proceso solicitado.
3. Si es un diagrama o diapositiva, explica la secuencia de pasos y componentes.
4. Genera la interpretación explicativa para que el usuario aprenda a dominar su trabajo."""

    try:
        raw_response = call_gemini_generate(
            prompt=user_prompt,
            images=[{"mime_type": mime_type, "data": raw_b64}],
            system_instruction=system_prompt,
            model=CONFIG["model_vision"]
        )
        
        # Clean JSON markdown fences if present
        clean_json = raw_response.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        elif clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        clean_json = clean_json.strip()
        
        parsed = json.loads(clean_json)
        return {"status": "success", "data": parsed, "timestamp": req.timestamp}
    except json.JSONDecodeError:
        # Fallback if json parse fails
        return {
            "status": "partial",
            "data": {
                "detected_type": "screen_photo",
                "title_summary": "Extracción de imagen",
                "full_ocr_text": raw_response,
                "process_interpretation": "Se extrajo el texto de la imagen.",
                "structured_elements": []
            },
            "timestamp": req.timestamp
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando imagen: {str(e)}")

@app.post("/api/analyze-process")
async def analyze_full_process(req: ProcessAnalyzeRequest):
    """
    Synthesizes the entire session:
    - Chronological transcript + all captured photos & OCR texts
    - Builds interactive Mermaid flowchart
    - Creates a step-by-step business process guide (Inputs -> Processing -> Outputs)
    - Creates glossary of internal company terms/acronyms
    - Lists key decisions & action items
    """
    system_prompt = """Eres un consultor senior de arquitectura de procesos empresariales y tutor de capacitación para nuevos empleados.
Tu misión es transformar transcripciones de reuniones y notas/fotos de pantallas en una GUÍA MAESTRA DE PROCESOS Y FLUJOS DE TRABAJO.
El usuario necesita entender a la perfección qué tiene que hacer en su trabajo, cómo funcionan los sistemas, qué pasos seguir y qué significan los términos técnicos.

Debes responder SIEMPRE en formato JSON estrictamente válido con la siguiente estructura:
{
  "executive_summary": "Resumen ejecutivo de alto nivel de lo tratado en la sesión",
  "workflow_diagram_mermaid": "graph TD\\n  A[Inicio: Entrada de Solicitud] --> B{Validación}\\n  B -->|Aprobado| C[Procesamiento en Sistema]\\n  B -->|Rechazado| D[Notificar a Usuario]\\n  C --> E[Fin del Proceso]",
  "sequence_diagram_mermaid": "sequenceDiagram\\n  autonumber\\n  actor U as Usuario\\n  participant S as Sistema/Teams\\n  participant B as Base de Datos\\n  U->>S: Envía solicitud\\n  S->>B: Valida registro\\n  B-->>S: Confirmación\\n  S-->>U: Proceso Completado",
  "process_steps": [
    {
      "step_number": 1,
      "name": "Nombre del paso",
      "description": "Explicación detallada de lo que se hace",
      "actors": ["Rol o Persona encargada"],
      "tools_or_systems": ["Teams", "SAP", "Excel", "Base de datos", etc.],
      "inputs": ["Datos o archivos que se necesitan"],
      "outputs": ["Resultado que se genera"],
      "tips_and_pitfalls": "Consejos clave para no equivocarse"
    }
  ],
  "glossary": [
    {
      "term": "Término o Acrónimo de la empresa",
      "definition": "Significado claro y qué representa en la operación diaria"
    }
  ],
  "key_decisions": [
    "Decisión o acuerdo tomado en la reunión"
  ],
  "action_items": [
    {
      "task": "Tarea a realizar",
      "responsible": "Responsable o 'Por definir'",
      "priority": "Alta | Media | Baja"
    }
  ],
  "master_learning_guide": "Explicación didáctica completa estilo manual para que el usuario domine el tema al 100%."
}
Solo devuelve el JSON sin formato markdown exterior ni explicaciones extra."""

    # Build comprehensive context
    images_context = ""
    if req.ocr_items:
        images_context = "\n\n--- CAPTURAS Y FOTOS PROCESADAS DURANTE LA SESIÓN ---\n"
        for i, item in enumerate(req.ocr_items, 1):
            t = item.get("timestamp", "00:00")
            title = item.get("title", f"Foto #{i}")
            ocr = item.get("ocr_text", "")
            interp = item.get("interpretation", "")
            images_context += f"\n[Foto {i} - Minuto {t}] {title}\nTexto/Chat extraído:\n{ocr}\nInterpretación de la imagen:\n{interp}\n"

    user_prompt = f"""TITULO DE LA SESIÓN: {req.session_title}

TRANSCRIPCIÓN COMPLETA DE LA SESIÓN DE AUDIO:
{req.transcript_text}

{images_context}

INSTRUCCIONES ADICIONALES DEL USUARIO:
{req.custom_instructions if req.custom_instructions else 'Explica el flujo de procesos con total detalle, diagrama Mermaid, glosario y guía de aprendizaje paso a paso.'}

Genera el análisis integral en formato JSON."""

    try:
        raw_response = call_gemini_generate(
            prompt=user_prompt,
            system_instruction=system_prompt,
            model=CONFIG["model_analysis"]
        )
        
        clean_json = raw_response.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        elif clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        clean_json = clean_json.strip()
        
        parsed = json.loads(clean_json)
        return {"status": "success", "data": parsed}
    except json.JSONDecodeError:
        return {
            "status": "partial",
            "data": {
                "executive_summary": "Análisis completado",
                "master_learning_guide": raw_response,
                "workflow_diagram_mermaid": "graph TD\n  A[Reunión] --> B[Análisis]",
                "process_steps": [],
                "glossary": [],
                "key_decisions": [],
                "action_items": []
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analizando sesión: {str(e)}")

@app.post("/api/chat-copilot")
async def chat_copilot(req: ChatCopilotRequest):
    """
    In-session interactive Q&A assistant to clarify any part of the meeting,
    process, screenshot, or technical jargon.
    """
    system_prompt = """Eres el Copiloto Experto de Procesos y Sesiones del usuario.
Tu trabajo es responder cualquier pregunta, duda o aclaración sobre la reunión que acaba de tener o está teniendo.
Tienes acceso a toda la transcripción de audio y a todas las fotos/capturas tomadas durante la sesión.

Tu estilo:
- Muy didáctico, empático, claro y pedagógico (explica conceptos complejos de forma sencilla).
- Usa analogías si un proceso empresarial o técnico es confuso.
- Haz referencia a los minutos exactos o a las fotos correspondientes cuando expliques algo.
- Da ejemplos prácticos de cómo el usuario debe actuar o qué debe responder en su trabajo."""

    context = f"""--- CONTEXTO DE LA SESIÓN ACTUAL: {req.session_title} ---
TRANSCRIPCIÓN:
{req.transcript_text}

FOTOS / OCR DE LA SESIÓN:
"""
    if req.ocr_items:
        for idx, item in enumerate(req.ocr_items, 1):
            context += f"\n[Foto {idx} @ {item.get('timestamp', '00:00')} - {item.get('title', '')}]: {item.get('ocr_text', '')}\nExplicación: {item.get('interpretation', '')}"
    else:
        context += "(No se han agregado fotos aún)\n"

    # Format conversation history
    history_formatted = ""
    if req.chat_history:
        history_formatted = "\n--- HISTORIAL DE CONVERSACIÓN PREVIO ---\n"
        for msg in req.chat_history:
            role = "Usuario" if msg.get("role") == "user" else "Copiloto"
            history_formatted += f"{role}: {msg.get('content', '')}\n"

    user_prompt = f"""{context}
{history_formatted}
PREGUNTA DEL USUARIO:
{req.message}

Responde de manera completa, estructurada y muy clara."""

    try:
        response_text = call_gemini_generate(
            prompt=user_prompt,
            system_instruction=system_prompt,
            model=CONFIG["model_analysis"]
        )
        return {"status": "success", "reply": response_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en chat copiloto: {str(e)}")

@app.post("/api/export-claude")
async def export_for_claude(req: ClaudeExportRequest):
    """
    Constructs a master structured prompt ready for Claude 3.5 Sonnet / Claude 3.7.
    """
    prompt = f"""# SOLICITUD DE ANÁLISIS DE PROCESO Y ASESORÍA EXPERTA
**Sesión:** {req.session_title}
**Objetivo del usuario:** {req.user_goal}

---

## 📌 CONTEXTO DE LA SESIÓN
Se adjunta a continuación la transcripción completa de la reunión de trabajo junto con la extracción de texto y diagramas de las fotografías/capturas de pantalla tomadas durante la sesión.

---

## 📸 FOTOGRAFÍAS, CAPTURAS Y OCR ESTRUCTURADO ({len(req.ocr_items)} capturas)
"""
    if req.ocr_items:
        for i, item in enumerate(req.ocr_items, 1):
            prompt += f"""
### Captura #{i} [Minuto {item.get('timestamp', '00:00')}] - {item.get('title', 'Sin título')}
- **Tipo detectado:** {item.get('type', 'Foto de pantalla')}
- **Texto Extraído (OCR):**
```
{item.get('ocr_text', 'N/A')}
```
- **Interpretación del contenido:**
{item.get('interpretation', 'N/A')}
"""
    else:
        prompt += "\n*(No se capturaron imágenes en esta sesión)*\n"

    prompt += f"""
---

## 🎙️ TRANSCRIPCIÓN CRONOLÓGICA DE LA SESIÓN ({len(req.transcript_items)} segmentos)
```
"""
    for item in req.transcript_items:
        t = item.get("timestamp", "00:00")
        speaker = item.get("speaker", "Voz")
        text = item.get("text", "")
        prompt += f"[{t}] {speaker}: {text}\n"
        
    prompt += f"""```

---

## 🎯 INSTRUCCIONES PARA CLAUDE
Por favor, actúa como mi Mentor Senior de Operaciones y Procesos en la empresa. Analiza toda la información anterior y entrégame:

1. **Explicación Clara del Proceso de Punta a Punta:** ¿Qué es lo que se espera que haga, cuáles son las entradas, validaciones y salidas?
2. **Diagrama de Flujo (Mermaid.js):** Genera un diagrama visual con `graph TD` que resuma la lógica y toma de decisiones.
3. **Desglose de Mensajes y Diapositivas Clave:** Explica qué significa cada instrucción o captura de pantalla mostrada.
4. **Glosario de Términos Internos:** Define los conceptos y acrónimos mencionados en la sesión.
5. **Plan de Acción para Mí:** ¿Cuáles son mis próximos pasos inmediatos para dominar esta tarea con éxito?
"""
    return {
        "status": "success",
        "claude_prompt": prompt,
        "filename": f"Sesion_{req.session_title.replace(' ', '_')}_ClaudePrompt.md"
    }

# Mount static files
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    print("Iniciando SessionFlow Copilot en http://localhost:8000...")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
