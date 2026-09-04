// Claude Master Prompt Exporter & Markdown Downloader
export class ClaudeExporter {
  constructor(options = {}) {
    this.promptTextarea = document.getElementById('claudePromptTextarea');
    this.customGoalInput = document.getElementById('claudeCustomGoalInput');
    this.btnCopy = document.getElementById('btnCopyClaudePrompt');
    this.btnDownload = document.getElementById('btnDownloadMarkdown');
    this.btnQuickExport = document.getElementById('btnExportClaudeQuick');

    this.initListeners();
  }

  initListeners() {
    if (this.btnCopy) {
      this.btnCopy.addEventListener('click', () => this.copyToClipboard());
    }
    if (this.btnDownload) {
      this.btnDownload.addEventListener('click', () => this.downloadMarkdownFile());
    }
  }

  generatePrompt(sessionTitle, transcriptItems, ocrItems) {
    const goal = (this.customGoalInput ? this.customGoalInput.value.trim() : '') || 'Entender el proceso y flujos de trabajo al 100% para dominar mis tareas.';

    let prompt = `# SOLICITUD DE ANÁLISIS DE PROCESO Y ASESORÍA EXPERTA
**Sesión:** ${sessionTitle || 'Sesión de Trabajo'}
**Objetivo del usuario:** ${goal}
**Fecha:** ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

---

## 📌 CONTEXTO DE LA SESIÓN
A continuación se presenta la información capturada en tiempo real durante la reunión de trabajo: fotografías/capturas de pantallas (incluyendo chats de Teams, diapositivas y diagramas) con su texto extraído (OCR) y la transcripción completa de audio con marcas de tiempo.

---

## 📸 FOTOGRAFÍAS, CAPTURAS Y OCR ESTRUCTURADO (${ocrItems.length} capturas)
`;

    if (ocrItems.length > 0) {
      ocrItems.forEach((item, idx) => {
        prompt += `
### Captura #${idx + 1} [Minuto ${item.timestamp || '00:00'}] - ${item.title || 'Sin título'}
- **Tipo de captura:** ${item.detectedType || 'Foto de pantalla'}
- **Texto Extraído (OCR):**
\`\`\`
${item.ocrText || 'N/A'}
\`\`\`
- **Interpretación del contenido:**
${item.interpretation || 'N/A'}
`;
      });
    } else {
      prompt += `
*(No se capturaron imágenes en esta sesión)*
`;
    }

    prompt += `
---

## 🎙️ TRANSCRIPCIÓN CRONOLÓGICA DE LA SESIÓN (${transcriptItems.length} intervenciones)
\`\`\`
`;

    transcriptItems.forEach(item => {
      prompt += `[${item.timestamp || '00:00'}] ${item.speaker || 'Reunión'}: ${item.text}\n`;
    });

    prompt += `\`\`\`

---

## 🎯 INSTRUCCIONES PARA CLAUDE
Por favor, actúa como mi Mentor Senior de Operaciones y Procesos en la empresa. Analiza toda la transcripción y las fotos anteriores con máxima profundidad y entrégame:

1. **Explicación Didáctica del Proceso de Punta a Punta:** Explícame paso a paso cómo funciona este flujo, qué entra, qué se procesa y qué sale.
2. **Diagrama de Flujo (Mermaid.js):** Diseña un diagrama visual en código \`graph TD\` claro y bien estructurado.
3. **Desglose de Pantallas y Mensajes:** Explica qué significa cada instrucción o captura de pantalla de Teams mostrada.
4. **Glosario de Términos de la Empresa:** Define cada término técnico o acrónimo mencionado.
5. **Plan de Acción para Mí:** ¿Cuáles son los pasos específicos que debo realizar en mi trabajo diario para ejecutar este proceso sin errores?
`;

    if (this.promptTextarea) {
      this.promptTextarea.value = prompt;
    }

    return prompt;
  }

  async copyToClipboard() {
    if (!this.promptTextarea) return;
    try {
      await navigator.clipboard.writeText(this.promptTextarea.value);
      if (window.showToast) {
        window.showToast('¡Prompt para Claude copiado al portapapeles!', 'success');
      } else {
        alert('¡Copiado!');
      }
    } catch (err) {
      this.promptTextarea.select();
      document.execCommand('copy');
      alert('¡Copiado al portapapeles!');
    }
  }

  downloadMarkdownFile(sessionTitle = 'Sesion_Trabajo') {
    const text = this.promptTextarea ? this.promptTextarea.value : '';
    if (!text) return;

    const safeTitle = sessionTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeTitle}_PromptClaude.md`;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
