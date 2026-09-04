# SessionFlow AI 🎙️📸✨
### Grabación de Sesiones en Tiempo Real · OCR de Pantallas & Teams · Copiloto y Diagramador de Procesos

Una aplicación web interactiva de escritorio diseñada para capturar reuniones largas (1 hora o más), digitalizar fotos/pantallas de Microsoft Teams, diapositivas y diagramas, estructurar flujos de trabajo de punta a punta con diagramas interactivos (Mermaid.js) y permitir tanto consultas en vivo como exportación optimizada para Claude.

---

## 🚀 Inicio Rápido

1. Haz doble clic en `run.bat` o ejecuta:
   ```bash
   python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
   ```
2. Abre tu navegador en: [http://localhost:8000](http://localhost:8000)

---

## 🌟 Características Principales

### 1. 🎙️ Grabación y Transcripción Continua (1h+)
- **Transcripción en Vivo**: Muestra el texto segundo a segundo en pantalla.
- **Auto-reconexión**: Mantiene la sesión activa sin cortes por límites del navegador.
- **Detección Inteligente de Silencio/Corte**: Si el audio se pausa o se desconecta, te pregunta: *"¿La sesión sigue en curso?"* para reanudar al instante o consolidar el flujo completo.
- **Respaldo Local (IndexedDB)**: Cada palabra y foto se guarda automáticamente en tu navegador.

### 2. 📸 Captura Visual & OCR Inteligente
- **Cámara en Vivo**: Apunta tu cámara web o celular a cualquier monitor o proyección con el botón `Tomar Foto`.
- **Carga de Fotos de Celular**: Sube fotos tomadas a pantallas de Teams, diapositivas o pizarras.
- **Atajo `Ctrl+V`**: Pega capturas de pantalla directamente desde el portapapeles.
- **OCR Semántico**: Extrae participantes de Teams, mensajes, código, diagramas y tablas con su minuto exacto.

### 3. 📊 Flujos de Trabajo y Diagramas Mermaid
- Convierte automáticamente toda la reunión y capturas en diagramas de flujo interactivos (`graph TD` y `sequenceDiagram`).
- Genera la **Guía Paso a Paso** (Entradas -> Procesamiento -> Salidas).
- Glosario de términos internos de tu empresa y lista de decisiones tomadas.

### 4. 🤖 Copiloto Explicativo y Exportador a Claude
- **Chat Copiloto**: Pregúntale cualquier duda: *"¿Qué significa el paso 2 de la imagen 1?"*, *"Explícamelo con peras y manzanas"*.
- **Exportador a Claude con 1 Clic**: Formatea un prompt maestro estructurado con timestamps, transcripciones y fotos listo para copiar en Claude.

---

## ⚙️ Configuración
- Puedes ingresar tu **Google Gemini API Key** o **Claude API Key** directamente desde el botón de Ajustes (⚙️) en la barra superior.
