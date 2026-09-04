// AI Copilot Interactive Chat
export class AiCopilot {
  constructor(options = {}) {
    this.sessionId = options.sessionId || ('session_' + Date.now());
    this.messagesContainer = document.getElementById('chatMessagesContainer');
    this.inputForm = document.getElementById('chatInputForm');
    this.messageInput = document.getElementById('chatMessageInput');
    this.btnClear = document.getElementById('btnClearChatHistory');
    this.history = [];

    this.initListeners();
  }

  initListeners() {
    if (this.inputForm) {
      this.inputForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const app = window.app;
        this.sendMessage(
          app ? app.sessionTitle : 'Sesión',
          app ? app.transcriptItems.map(i => `[${i.timestamp}] ${i.speaker}: ${i.text}`).join('\n') : '',
          app ? app.ocrItems : []
        );
      });
    }

    if (this.btnClear) {
      this.btnClear.addEventListener('click', () => {
        if (confirm('¿Deseas limpiar la conversación del chat?')) {
          this.history = [];
          if (this.messagesContainer) {
            this.messagesContainer.innerHTML = `
              <div class="flex items-start space-x-3">
                <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md">
                  <i data-lucide="bot" class="w-4 h-4 text-white"></i>
                </div>
                <div class="bg-surface-800 border border-slate-700/80 rounded-2xl rounded-tl-sm p-3.5 max-w-2xl text-xs text-slate-200 leading-relaxed shadow">
                  <p class="font-semibold text-sky-300 mb-1">Chat reiniciado.</p>
                  <p>¿En qué puedo ayudarte con respecto a la reunión o proceso?</p>
                </div>
              </div>
            `;
            if (window.lucide) window.lucide.createIcons();
          }
        }
      });
    }
  }

  async sendMessage(sessionTitle = '', transcriptText = '', ocrItems = []) {
    const text = this.messageInput.value.trim();
    if (!text) return;

    this.messageInput.value = '';
    this.appendUserMessage(text);
    this.history.push({ role: 'user', content: text });

    const loadingId = this.appendLoadingAssistant();

    let reply = '';
    // Try backend proxy
    try {
      const resp = await fetch('/api/chat-copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          chat_history: this.history.slice(-10),
          session_title: sessionTitle || 'Sesión',
          transcript_text: transcriptText || '(Sin transcripción)',
          ocr_items: ocrItems.map(i => ({
            timestamp: i.timestamp,
            title: i.title,
            ocr_text: i.ocrText,
            interpretation: i.interpretation
          }))
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        reply = data.reply;
      }
    } catch (e) {
      // Backend not available (static host)
    }

    // Direct Gemini client fallback
    if (!reply) {
      const apiKey = localStorage.getItem('gemini_api_key') || '';
      if (apiKey) {
        try {
          const contextPrompt = `Eres el Copiloto Experto de Procesos. Explica con total claridad, paciencia y ejemplos en español lo que el usuario pregunte.
Contexto de la reunión (${sessionTitle}):
${transcriptText}

Fotos/OCR:
${JSON.stringify(ocrItems.map(i => ({ timestamp: i.timestamp, title: i.title, ocr: i.ocrText, interp: i.interpretation })))}

Pregunta del usuario: ${text}`;

          const gResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: contextPrompt }] }]
            })
          });

          if (gResp.ok) {
            const gData = await gResp.json();
            reply = gData.candidates?.[0]?.content?.parts?.[0]?.text || 'No obtuve respuesta de Gemini.';
          }
        } catch (gErr) {
          reply = 'Error conectando con Gemini. Verifica tu API Key en Ajustes (⚙️).';
        }
      } else {
        reply = 'Para chatear con el Copiloto, por favor ingresa tu API Key de Gemini en el botón de **Ajustes (⚙️)**.';
      }
    }

    this.history.push({ role: 'assistant', content: reply });
    this.replaceLoadingWithReply(loadingId, reply);
  }

  appendUserMessage(text) {
    if (!this.messagesContainer) return;
    const div = document.createElement('div');
    div.className = 'flex items-start justify-end space-x-2 animate-fade-in';
    div.innerHTML = `
      <div class="bg-indigo-600 text-white rounded-2xl rounded-tr-sm p-3 max-w-xl text-xs leading-relaxed shadow-md">
        ${this.escapeHtml(text)}
      </div>
    `;
    this.messagesContainer.appendChild(div);
    this.scrollToBottom();
  }

  appendLoadingAssistant() {
    if (!this.messagesContainer) return '';
    const id = 'loading_' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'flex items-start space-x-3 animate-fade-in';
    div.innerHTML = `
      <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md">
        <i data-lucide="bot" class="w-4 h-4 text-white"></i>
      </div>
      <div class="bg-surface-800 border border-slate-700/80 rounded-2xl rounded-tl-sm p-3 max-w-2xl text-xs text-slate-300 flex items-center space-x-2 shadow">
        <div class="flex space-x-1">
          <div class="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-delay:0.2s]"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-delay:0.4s]"></div>
        </div>
        <span>El copiloto está analizando la sesión...</span>
      </div>
    `;
    this.messagesContainer.appendChild(div);
    if (window.lucide) window.lucide.createIcons();
    this.scrollToBottom();
    return id;
  }

  replaceLoadingWithReply(loadingId, markdownText) {
    const el = document.getElementById(loadingId);
    if (!el) return;

    const parsedHtml = window.marked ? window.marked.parse(markdownText) : markdownText;
    el.innerHTML = `
      <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md">
        <i data-lucide="bot" class="w-4 h-4 text-white"></i>
      </div>
      <div class="bg-surface-800 border border-slate-700/80 rounded-2xl rounded-tl-sm p-3.5 max-w-2xl text-xs text-slate-200 leading-relaxed shadow markdown-body">
        ${parsedHtml}
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    this.scrollToBottom();
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
