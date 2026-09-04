// SessionFlow AI Master Client App (Optimized for iPhone Safari & Desktop)
(function() {
  'use strict';

  // --- STATE ---
  let currentSessionId = 'session_' + Date.now();
  let sessionTitle = 'Sesión de Capacitación y Procesos';
  let transcriptItems = [];
  let ocrItems = [];
  let currentAnalysis = null;
  let chatHistory = [];
  let activeTab = 'capture';

  // Audio Recording State
  let isRecording = false;
  let isPaused = false;
  let elapsedSeconds = 0;
  let timerInterval = null;
  let lastSpeechTime = Date.now();
  let silenceCheckInterval = null;
  let mediaStream = null;
  let audioContext = null;
  let analyser = null;
  let speechRecognition = null;

  // --- TOAST NOTIFICATIONS ---
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
      success: 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20',
      error: 'bg-rose-600 text-white border-rose-500 shadow-rose-500/20',
      warning: 'bg-amber-600 text-white border-amber-500 shadow-amber-500/20',
      info: 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/20'
    };

    toast.className = `flex items-center space-x-2 px-4 py-3 rounded-2xl border shadow-xl text-xs font-semibold animate-fade-in pointer-events-auto ${colors[type] || colors.info}`;
    toast.innerHTML = `<span>${escapeHtml(msg)}</span>`;
    container.appendChild(toast);

    if (navigator.vibrate) navigator.vibrate(15);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
  window.showToast = showToast;

  // --- TAB SWITCHING ---
  function switchTab(tabName) {
    activeTab = tabName;

    // Desktop tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.className = 'tab-btn active flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition';
      } else {
        btn.className = 'tab-btn flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition';
      }
    });

    // Mobile Bottom Nav buttons
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      if (panel.id === `panel-${tabName}`) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });

    if (tabName === 'claude-export') {
      generateClaudePrompt();
    }
  }

  // --- AUDIO RECORDING ENGINE ---
  function initSpeechEngine() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Speech) {
      speechRecognition = new Speech();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;
      speechRecognition.lang = 'es-ES';

      speechRecognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += t + ' ';
          else interim += t;
        }

        const interimBox = document.getElementById('liveSpeechInterimBox');
        if (interimBox) {
          if (interim.trim()) {
            interimBox.innerHTML = `<span class="text-indigo-300 font-medium">🎙️ "${escapeHtml(interim)}"</span>`;
            lastSpeechTime = Date.now();
          }
        }

        if (final.trim()) {
          const timestamp = getFormattedTime();
          addTranscriptItem(final.trim(), timestamp);
          if (interimBox) interimBox.innerHTML = `<span class="text-slate-500">Escuchando...</span>`;
          lastSpeechTime = Date.now();
        }
      };

      speechRecognition.onerror = (e) => {
        console.warn('SpeechRecognition error:', e.error);
      };

      speechRecognition.onend = () => {
        if (isRecording && !isPaused) {
          try { speechRecognition.start(); } catch (err) {}
        }
      };
    }
  }

  async function startRecording() {
    if (isRecording) return;

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        const source = audioContext.createMediaStreamSource(mediaStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        drawWaveform();
      }

      initSpeechEngine();
      if (speechRecognition) {
        try { speechRecognition.start(); } catch (err) {}
      }

      isRecording = true;
      isPaused = false;
      lastSpeechTime = Date.now();

      startTimer();
      startSilenceWatchdog();
      updateAudioUI('recording');
      showToast('Micrófono activo y grabando', 'success');

    } catch (err) {
      console.error('Error starting audio:', err);
      showToast('Permiso de micrófono requerido', 'error');
    }
  }

  function pauseRecording() {
    if (!isRecording) return;
    isPaused = !isPaused;
    if (isPaused) {
      if (speechRecognition) try { speechRecognition.stop(); } catch (e) {}
      updateAudioUI('paused');
      showToast('Grabación pausada', 'warning');
    } else {
      if (speechRecognition) try { speechRecognition.start(); } catch (e) {}
      lastSpeechTime = Date.now();
      updateAudioUI('recording');
      showToast('Grabación reanudada', 'info');
    }
  }

  function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    isPaused = false;

    if (speechRecognition) {
      try { speechRecognition.stop(); } catch (e) {}
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (audioContext) {
      try { audioContext.close(); } catch (e) {}
      audioContext = null;
    }

    clearInterval(timerInterval);
    clearInterval(silenceCheckInterval);
    updateAudioUI('idle');
    showToast('Grabación finalizada', 'info');
  }

  function updateAudioUI(state) {
    const btnToggle = document.getElementById('btnToggleRecord');
    const btnPause = document.getElementById('btnPauseRecord');
    const dot = document.getElementById('recordingPulseDot');
    const badge = document.getElementById('sessionStatusBadge');

    if (state === 'recording') {
      if (btnToggle) {
        btnToggle.className = 'col-span-2 py-3 px-4 rounded-xl text-xs md:text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30 active:scale-95 transition flex items-center justify-center space-x-2';
        btnToggle.innerHTML = '<span>⏹️ Detener Grabación</span>';
      }
      if (btnPause) {
        btnPause.disabled = false;
        btnPause.innerHTML = '⏸️ Pausar';
      }
      if (dot) dot.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-ping';
      if (badge) badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-500"></span><span>Grabando</span>';
    } else if (state === 'paused') {
      if (btnPause) {
        btnPause.disabled = false;
        btnPause.innerHTML = '▶️ Reanudar';
      }
      if (dot) dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
      if (badge) badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>Pausado</span>';
    } else {
      if (btnToggle) {
        btnToggle.className = 'col-span-2 py-3 px-4 rounded-xl text-xs md:text-sm font-bold bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg shadow-red-500/20 active:scale-95 transition flex items-center justify-center space-x-2';
        btnToggle.innerHTML = '<span>🔴 Iniciar Grabación</span>';
      }
      if (btnPause) {
        btnPause.disabled = true;
        btnPause.innerHTML = '⏸️ Pausar';
      }
      if (dot) dot.className = 'w-2.5 h-2.5 rounded-full bg-slate-600';
      if (badge) badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span><span>En Espera</span>';
    }
  }

  function drawWaveform() {
    const canvas = document.getElementById('audioVisualizerCanvas');
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function render() {
      if (!isRecording) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        ctx.fillStyle = '#6366f1';
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth + 1;
      }
    }
    render();
  }

  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      elapsedSeconds++;
      const timerEl = document.getElementById('recordingTimer');
      if (timerEl) timerEl.textContent = getFormattedTime();
    }, 1000);
  }

  function startSilenceWatchdog() {
    clearInterval(silenceCheckInterval);
    silenceCheckInterval = setInterval(() => {
      if (!isRecording || isPaused) return;
      const idleSecs = (Date.now() - lastSpeechTime) / 1000;
      if (idleSecs >= 30) {
        const modal = document.getElementById('silenceAlertModal');
        if (modal) modal.classList.remove('hidden');
        lastSpeechTime = Date.now();
      }
    }, 5000);
  }

  function getFormattedTime() {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(mins)}:${pad(secs)}`;
  }

  // --- TRANSCRIPT & TIMELINE ---
  function addTranscriptItem(text, timestamp) {
    const item = {
      id: 'tr_' + Date.now(),
      sessionId: currentSessionId,
      timestamp: timestamp || '00:00',
      speaker: 'Reunión',
      text: text,
      createdAt: new Date().toISOString()
    };
    transcriptItems.push(item);
    renderTimelineItem(item, 'transcript');
    saveDataLocal();
    updateCounters();
  }

  function renderTimelineItem(item, type) {
    const emptyState = document.getElementById('timelineEmptyState');
    const streamList = document.getElementById('timelineStreamList');
    if (emptyState) emptyState.classList.add('hidden');
    if (streamList) {
      streamList.classList.remove('hidden');
      const div = document.createElement('div');
      div.className = 'relative animate-fade-in pl-2';

      if (type === 'transcript') {
        div.innerHTML = `
          <div class="bg-surface-900 border border-slate-800 rounded-2xl p-3 shadow-sm space-y-1">
            <div class="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1">
              <span class="font-mono text-indigo-300 font-bold">[${item.timestamp}] ${item.speaker}</span>
              <span class="text-[10px] text-slate-500">Audio</span>
            </div>
            <p class="text-xs text-slate-200 leading-relaxed">${escapeHtml(item.text)}</p>
          </div>
        `;
      } else {
        div.innerHTML = `
          <div class="bg-surface-900 border border-emerald-900/40 rounded-2xl p-3 shadow-md space-y-2 cursor-pointer hover:border-emerald-500 transition btn-open-photo">
            <div class="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1">
              <span class="font-mono text-emerald-400 font-bold">[${item.timestamp}] 📸 ${escapeHtml(item.title)}</span>
              <span class="text-[10px] px-1.5 py-0.2 bg-emerald-950 text-emerald-300 rounded border border-emerald-800">Foto</span>
            </div>
            <div class="flex items-center space-x-3">
              <img src="${item.imageBase64}" class="w-14 h-14 object-cover rounded-xl bg-black border border-slate-800 shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-xs text-indigo-200 font-medium truncate">${escapeHtml(item.interpretation || 'Procesando visión...')}</p>
                <p class="text-[11px] text-slate-400 truncate">${escapeHtml(item.ocrText || '')}</p>
              </div>
            </div>
          </div>
        `;
        div.querySelector('.btn-open-photo')?.addEventListener('click', () => openImageModal(item));
      }
      streamList.appendChild(div);
    }
  }

  // --- PHOTO & OCR PROCESSING ---
  async function processImageFile(file, title = 'Foto de pantalla') {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result;
      const timestamp = getFormattedTime();
      await processPhotoWithGemini(b64, title, timestamp);
    };
    reader.readAsDataURL(file);
  }

  async function processPhotoWithGemini(imageBase64, title, timestamp) {
    const item = {
      id: 'img_' + Date.now(),
      sessionId: currentSessionId,
      timestamp: timestamp,
      title: title,
      imageBase64: imageBase64,
      ocrText: 'Extrayendo texto...',
      interpretation: 'Analizando contenido...',
      createdAt: new Date().toISOString()
    };

    ocrItems.push(item);
    renderTimelineItem(item, 'image');
    renderPhotoThumbnails();
    updateCounters();
    showToast('Procesando OCR con IA...', 'info');

    const apiKey = localStorage.getItem('gemini_api_key') || '';
    if (!apiKey) {
      item.ocrText = 'Foto guardada. Ingresa tu Gemini API Key en Ajustes (⚙️) para activar el OCR automático.';
      item.interpretation = 'Disponible para exportar a Claude.';
      renderPhotoThumbnails();
      saveDataLocal();
      return;
    }

    try {
      const cleanB64 = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
      const mime = imageBase64.includes('data:') ? imageBase64.split(';')[0].replace('data:', '') : 'image/jpeg';

      const prompt = `Analiza con máxima precisión esta fotografía tomada a una pantalla de trabajo/Teams/diagrama en el minuto ${timestamp}.
Extrae TODO el texto legible (OCR completo, participantes, mensajes, pasos, código) y explica qué significa el flujo o solicitud en español claro.
Responde estrictamente en JSON con este formato:
{
  "title_summary": "Título breve descriptivo",
  "full_ocr_text": "Texto exacto extraído de la foto",
  "process_interpretation": "Explicación clara del proceso o mensaje para entender mi trabajo"
}`;

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mime, data: cleanB64 } },
              { text: prompt }
            ]
          }]
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        let clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        try {
          const parsed = JSON.parse(clean);
          item.title = parsed.title_summary || item.title;
          item.ocrText = parsed.full_ocr_text || rawText;
          item.interpretation = parsed.process_interpretation || 'Foto analizada.';
        } catch (je) {
          item.ocrText = rawText;
          item.interpretation = 'Texto extraído correctamente.';
        }
        showToast('¡OCR y análisis de foto completado!', 'success');
      } else {
        const err = await resp.json();
        item.ocrText = 'Error en Gemini: ' + (err.error?.message || resp.statusText);
        showToast('Error procesando imagen', 'error');
      }
    } catch (exc) {
      item.ocrText = 'Foto guardada localmente.';
      item.interpretation = 'Disponible para Claude.';
    }

    renderPhotoThumbnails();
    saveDataLocal();
  }

  function renderPhotoThumbnails() {
    const listEl = document.getElementById('photosThumbnailList');
    if (!listEl) return;

    if (ocrItems.length === 0) {
      listEl.innerHTML = `
        <div id="emptyPhotosPlaceholder" class="col-span-full text-center py-6 text-xs text-slate-400">
          No hay fotos añadidas aún. Toca <strong>Tomar Foto</strong> para fotografiar una pantalla.
        </div>
      `;
      return;
    }

    listEl.innerHTML = ocrItems.map(img => `
      <div class="flex items-center space-x-2 bg-surface-950 p-2 rounded-2xl border border-slate-800 hover:border-slate-700 cursor-pointer transition btn-thumb" data-id="${img.id}">
        <img src="${img.imageBase64}" class="w-12 h-12 object-cover rounded-xl bg-black shrink-0 border border-slate-800" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-200 truncate">${escapeHtml(img.title)}</span>
            <span class="text-[10px] text-indigo-400 font-mono">[${img.timestamp}]</span>
          </div>
          <p class="text-[10px] text-slate-400 truncate">${escapeHtml(img.interpretation || '')}</p>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.btn-thumb').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const item = ocrItems.find(i => i.id === id);
        if (item) openImageModal(item);
      });
    });
  }

  function openImageModal(item) {
    const modal = document.getElementById('imageDetailModal');
    if (!modal) return;
    document.getElementById('imageModalImg').src = item.imageBase64;
    document.getElementById('imageModalTitle').textContent = item.title;
    document.getElementById('imageModalTimestamp').textContent = `Minuto [${item.timestamp}]`;
    document.getElementById('imageModalInterpretation').textContent = item.interpretation;
    document.getElementById('imageModalOcrText').value = item.ocrText;
    modal.classList.remove('hidden');
  }

  // --- PROCESS ANALYZER & MERMAID ---
  async function runProcessAnalysis() {
    if (transcriptItems.length === 0 && ocrItems.length === 0) {
      showToast('Graba audio o agrega fotos para armar el análisis.', 'warning');
      return;
    }

    switchTab('workflow');
    showToast('Analizando reunión y modelando flujos...', 'info');

    const apiKey = localStorage.getItem('gemini_api_key') || '';
    if (!apiKey) {
      showToast('Por favor ingresa tu API Key de Gemini en Ajustes (⚙️)', 'warning');
      return;
    }

    const fullTranscript = transcriptItems.map(i => `[${i.timestamp}] ${i.speaker}: ${i.text}`).join('\n');
    const ocrSummary = ocrItems.map(i => `[Min ${i.timestamp}] ${i.title}:\nOCR: ${i.ocrText}\nInterpretación: ${i.interpretation}`).join('\n\n');

    const prompt = `Actúa como Consultor Senior de Procesos. Analiza esta reunión y fotografías y devuelve un JSON estrictamente válido con esta estructura:
{
  "executive_summary": "Resumen ejecutivo claro de lo tratado",
  "workflow_diagram_mermaid": "graph TD\n  A[Inicio: Solicitud] --> B{Validación}\n  B -->|OK| C[Procesamiento]\n  B -->|Error| D[Notificar]\n  C --> E[Fin]",
  "process_steps": [
    { "step_number": 1, "name": "Nombre Paso", "description": "Descripción", "actors": ["Responsable"], "tools_or_systems": ["Teams/SAP"], "inputs": ["Datos"], "outputs": ["Resultado"], "tips_and_pitfalls": "Consejo" }
  ],
  "glossary": [ { "term": "Término/Acrónimo", "definition": "Definición clara" } ],
  "key_decisions": ["Decisión 1"],
  "action_items": [ { "task": "Tarea a realizar", "responsible": "Nombre" } ],
  "master_learning_guide": "Guía didáctica completa en markdown para dominar el trabajo"
}

Reunión: ${sessionTitle}
Transcripción:
${fullTranscript || '(Sin transcripción)'}

Fotos/OCR de Pantallas:
${ocrSummary || '(Sin fotos)'}
`;

    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error?.message || resp.statusText);
      }

      const data = await resp.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);

      currentAnalysis = parsed;
      await renderAnalysis(parsed);
      saveDataLocal();
      showToast('¡Flujo de procesos y diagramas listos!', 'success');

      if (window.confetti) {
        window.confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      }
    } catch (e) {
      console.error('Error en análisis:', e);
      showToast('Error en análisis: ' + e.message, 'error');
    }
  }

  async function renderAnalysis(data) {
    if (!data) return;

    const sumEl = document.getElementById('processExecutiveSummary');
    if (sumEl && data.executive_summary) sumEl.textContent = data.executive_summary;

    const mermaidBox = document.getElementById('mermaidRenderBox');
    if (mermaidBox && data.workflow_diagram_mermaid && window.mermaid) {
      try {
        window.mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        const id = 'mermaid_' + Date.now();
        const { svg } = await window.mermaid.render(id, data.workflow_diagram_mermaid);
        mermaidBox.innerHTML = svg;
      } catch (me) {
        mermaidBox.innerHTML = `<pre class="text-xs text-indigo-300 font-mono p-3 bg-slate-900 rounded-xl overflow-x-auto">${escapeHtml(data.workflow_diagram_mermaid)}</pre>`;
      }
    }

    const stepsEl = document.getElementById('processStepsList');
    if (stepsEl && Array.isArray(data.process_steps)) {
      stepsEl.innerHTML = data.process_steps.map((s, idx) => `
        <div class="bg-surface-900 border border-slate-800 rounded-2xl p-3.5 space-y-2">
          <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span class="text-xs font-bold text-white">#${s.step_number || idx + 1} ${escapeHtml(s.name || '')}</span>
            <span class="text-[10px] px-2 py-0.5 bg-indigo-950 text-indigo-300 rounded">${escapeHtml(Array.isArray(s.actors) ? s.actors.join(', ') : (s.actors || ''))}</span>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed">${escapeHtml(s.description || '')}</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px] text-slate-400">
            <div class="bg-slate-950 p-2 rounded-lg">📥 Entradas: <span class="text-slate-200">${escapeHtml(Array.isArray(s.inputs) ? s.inputs.join(', ') : (s.inputs || 'N/A'))}</span></div>
            <div class="bg-slate-950 p-2 rounded-lg">⚙️ Sistema: <span class="text-sky-300">${escapeHtml(Array.isArray(s.tools_or_systems) ? s.tools_or_systems.join(', ') : (s.tools_or_systems || 'N/A'))}</span></div>
            <div class="bg-slate-950 p-2 rounded-lg">📤 Salida: <span class="text-emerald-300">${escapeHtml(Array.isArray(s.outputs) ? s.outputs.join(', ') : (s.outputs || 'N/A'))}</span></div>
          </div>
        </div>
      `).join('');
    }

    const glossEl = document.getElementById('glossaryGrid');
    if (glossEl && Array.isArray(data.glossary)) {
      glossEl.innerHTML = data.glossary.map(g => `
        <div class="bg-surface-950 border border-slate-800 rounded-xl p-2.5">
          <span class="text-xs font-bold text-sky-400 font-mono block">${escapeHtml(g.term)}</span>
          <p class="text-[11px] text-slate-300 leading-relaxed">${escapeHtml(g.definition)}</p>
        </div>
      `).join('');
    }

    const decEl = document.getElementById('keyDecisionsList');
    if (decEl && Array.isArray(data.key_decisions)) {
      decEl.innerHTML = data.key_decisions.map(d => `<li class="text-xs text-slate-200">${escapeHtml(d)}</li>`).join('');
    }

    const actEl = document.getElementById('actionItemsList');
    if (actEl && Array.isArray(data.action_items)) {
      actEl.innerHTML = data.action_items.map(a => `
        <div class="bg-surface-950 p-2 rounded-xl border border-slate-800 text-xs text-slate-200 flex justify-between">
          <span>${escapeHtml(a.task || a)}</span>
          <span class="text-[10px] text-slate-400">${escapeHtml(a.responsible || '')}</span>
        </div>
      `).join('');
    }

    const guideEl = document.getElementById('masterLearningGuideContent');
    if (guideEl && data.master_learning_guide && window.marked) {
      guideEl.innerHTML = window.marked.parse(data.master_learning_guide);
    }
  }

  // --- COPILOT CHAT ---
  async function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    appendUserChat(text);
    chatHistory.push({ role: 'user', content: text });

    const loadingId = appendLoadingChat();
    const apiKey = localStorage.getItem('gemini_api_key') || '';

    if (!apiKey) {
      replaceLoadingChat(loadingId, '⚠️ Ingresa tu API Key de Gemini en **Ajustes (⚙️)** para chatear con el Copiloto.');
      return;
    }

    const transcriptText = transcriptItems.map(i => `[${i.timestamp}] ${i.speaker}: ${i.text}`).join('\n');
    const ocrSummary = ocrItems.map(i => `[Min ${i.timestamp}] ${i.title}: ${i.ocrText} (${i.interpretation})`).join('\n');

    const prompt = `Eres el Copiloto Experto de Procesos. Explica de forma muy didáctica, clara y con ejemplos en español lo que el usuario pregunte.
Contexto de la reunión (${sessionTitle}):
${transcriptText}

Fotos/OCR de Pantallas:
${ocrSummary}

Pregunta del usuario: ${text}`;

    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (resp.ok) {
        const data = await resp.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No pude generar respuesta.';
        chatHistory.push({ role: 'assistant', content: reply });
        replaceLoadingChat(loadingId, reply);
      } else {
        replaceLoadingChat(loadingId, 'Error conectando con Gemini.');
      }
    } catch (err) {
      replaceLoadingChat(loadingId, 'Error: ' + err.message);
    }
  }

  function appendUserChat(text) {
    const box = document.getElementById('chatMessagesContainer');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'flex justify-end animate-fade-in';
    div.innerHTML = `<div class="bg-indigo-600 text-white rounded-2xl rounded-tr-sm p-3 max-w-sm text-xs leading-relaxed shadow">${escapeHtml(text)}</div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function appendLoadingChat() {
    const box = document.getElementById('chatMessagesContainer');
    if (!box) return '';
    const id = 'loading_' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'flex items-start space-x-2 animate-fade-in';
    div.innerHTML = `
      <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shrink-0 text-xs">🤖</div>
      <div class="bg-surface-800 border border-slate-700/80 rounded-2xl rounded-tl-sm p-3 max-w-sm text-xs text-slate-300">
        El copiloto está pensando...
      </div>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return id;
  }

  function replaceLoadingChat(loadingId, markdownText) {
    const el = document.getElementById(loadingId);
    if (!el) return;
    const html = window.marked ? window.marked.parse(markdownText) : escapeHtml(markdownText);
    el.innerHTML = `
      <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shrink-0 text-xs">🤖</div>
      <div class="bg-surface-800 border border-slate-700/80 rounded-2xl rounded-tl-sm p-3 max-w-lg text-xs text-slate-200 leading-relaxed shadow markdown-body">
        ${html}
      </div>
    `;
    const box = document.getElementById('chatMessagesContainer');
    if (box) box.scrollTop = box.scrollHeight;
  }

  // --- CLAUDE EXPORTER ---
  function generateClaudePrompt() {
    let prompt = `# SOLICITUD DE ANÁLISIS DE PROCESO Y ASESORÍA EXPERTA
**Sesión:** ${sessionTitle}
**Fecha:** ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

---

## 📸 FOTOGRAFÍAS, CAPTURAS Y OCR ESTRUCTURADO (${ocrItems.length} capturas)
`;

    if (ocrItems.length > 0) {
      ocrItems.forEach((img, idx) => {
        prompt += `
### Captura #${idx + 1} [Minuto ${img.timestamp}] - ${img.title}
- **Texto Extraído (OCR):**
\`\`\`
${img.ocrText || 'N/A'}
\`\`\`
- **Interpretación del contenido:**
${img.interpretation || 'N/A'}
`;
      });
    } else {
      prompt += `\n*(No se capturaron imágenes en esta sesión)*\n`;
    }

    prompt += `
---

## 🎙️ TRANSCRIPCIÓN CRONOLÓGICA DE LA SESIÓN (${transcriptItems.length} intervenciones)
\`\`\`
`;

    transcriptItems.forEach(item => {
      prompt += `[${item.timestamp}] ${item.speaker}: ${item.text}\n`;
    });

    prompt += `\`\`\`

---

## 🎯 INSTRUCCIONES PARA CLAUDE
Por favor, actúa como mi Mentor Senior de Operaciones y Procesos en la empresa. Analiza toda la información anterior y entrégame:
1. **Explicación Clara del Proceso de Punta a Punta.**
2. **Diagrama de Flujo (Mermaid.js \`graph TD\`).**
3. **Desglose de Mensajes y Pantallas de Teams.**
4. **Glosario de Términos Internos.**
5. **Plan de Acción para Mí.**
`;

    const tx = document.getElementById('claudePromptTextarea');
    if (tx) tx.value = prompt;
  }

  async function copyClaudePrompt() {
    const tx = document.getElementById('claudePromptTextarea');
    if (!tx) return;
    try {
      await navigator.clipboard.writeText(tx.value);
      showToast('¡Prompt copiado al portapapeles!', 'success');
    } catch (e) {
      tx.select();
      document.execCommand('copy');
      showToast('¡Prompt copiado!', 'success');
    }
  }

  // --- LOCAL PERSISTENCE ---
  function saveDataLocal() {
    try {
      const data = {
        currentSessionId,
        sessionTitle,
        transcriptItems,
        ocrItems,
        currentAnalysis,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem('sessionflow_current', JSON.stringify(data));
      
      let historyList = JSON.parse(localStorage.getItem('sessionflow_history') || '[]');
      const existingIdx = historyList.findIndex(h => h.id === currentSessionId);
      const summaryItem = {
        id: currentSessionId,
        title: sessionTitle,
        transcriptsCount: transcriptItems.length,
        photosCount: ocrItems.length,
        updatedAt: new Date().toISOString()
      };
      if (existingIdx >= 0) historyList[existingIdx] = summaryItem;
      else historyList.unshift(summaryItem);
      localStorage.setItem('sessionflow_history', JSON.stringify(historyList.slice(0, 30)));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  function loadSavedData() {
    try {
      const savedKey = localStorage.getItem('gemini_api_key');
      if (savedKey) {
        const input = document.getElementById('settingGeminiKey');
        if (input) input.value = savedKey;
      }

      const saved = localStorage.getItem('sessionflow_current');
      if (saved) {
        const data = JSON.parse(saved);
        currentSessionId = data.currentSessionId || currentSessionId;
        sessionTitle = data.sessionTitle || sessionTitle;
        transcriptItems = data.transcriptItems || [];
        ocrItems = data.ocrItems || [];
        currentAnalysis = data.currentAnalysis || null;

        const titleEl = document.getElementById('sessionTitleInput');
        if (titleEl) titleEl.value = sessionTitle;

        transcriptItems.forEach(item => renderTimelineItem(item, 'transcript'));
        ocrItems.forEach(item => renderTimelineItem(item, 'image'));
        renderPhotoThumbnails();
        updateCounters();
        if (currentAnalysis) renderAnalysis(currentAnalysis);
      }
    } catch (e) {}
  }

  function updateCounters() {
    const tabCount = document.getElementById('tabCountTimeline');
    if (tabCount) tabCount.textContent = `${transcriptItems.length + ocrItems.length}`;
    const ocrCount = document.getElementById('ocrCountBadge');
    if (ocrCount) ocrCount.textContent = `${ocrItems.length} fotos`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- ATTACH ALL DOM LISTENERS ON LOAD ---
  function initApp() {
    loadSavedData();

    // 1. Navigation Tabs
    document.querySelectorAll('.tab-btn, .mobile-nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = btn.dataset.tab;
        if (tab) switchTab(tab);
      });
    });

    // 2. Audio Buttons
    const btnToggleRecord = document.getElementById('btnToggleRecord');
    if (btnToggleRecord) {
      btnToggleRecord.addEventListener('click', () => {
        if (!isRecording) startRecording();
        else stopRecording();
      });
    }

    const btnPauseRecord = document.getElementById('btnPauseRecord');
    if (btnPauseRecord) {
      btnPauseRecord.addEventListener('click', () => pauseRecording());
    }

    // 3. Camera & Photo Buttons (Magical iOS native trigger)
    const nativeCam = document.getElementById('nativeCameraInput');
    const nativeGal = document.getElementById('nativeGalleryInput');
    const btnOpenCam = document.getElementById('btnOpenCamera');
    const btnUploadImg = document.getElementById('btnUploadImage');

    if (btnOpenCam && nativeCam) {
      btnOpenCam.addEventListener('click', (e) => {
        e.preventDefault();
        nativeCam.click();
      });
      nativeCam.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) processImageFile(file, 'Foto tomada con cámara');
        nativeCam.value = '';
      });
    }

    if (btnUploadImg && nativeGal) {
      btnUploadImg.addEventListener('click', (e) => {
        e.preventDefault();
        nativeGal.click();
      });
      nativeGal.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files) {
          for (let i = 0; i < files.length; i++) {
            processImageFile(files[i], files[i].name || 'Foto del celular');
          }
        }
        nativeGal.value = '';
      });
    }

    // Direct paste handler
    window.addEventListener('paste', (e) => {
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) processImageFile(blob, 'Captura pegada');
        }
      }
    });

    // 4. Analysis buttons
    const btnQuick = document.getElementById('btnQuickProcessAnalysis');
    const btnMobileQuick = document.getElementById('btnMobileQuickAnalysis');
    const btnRegen = document.getElementById('btnRegenerateDiagram');
    if (btnQuick) btnQuick.addEventListener('click', () => runProcessAnalysis());
    if (btnMobileQuick) btnMobileQuick.addEventListener('click', () => runProcessAnalysis());
    if (btnRegen) btnRegen.addEventListener('click', () => runProcessAnalysis());

    // 5. Claude buttons
    const btnCopyClaude = document.getElementById('btnCopyClaudePrompt');
    if (btnCopyClaude) btnCopyClaude.addEventListener('click', () => copyClaudePrompt());

    const btnDownloadMd = document.getElementById('btnDownloadMarkdown');
    if (btnDownloadMd) {
      btnDownloadMd.addEventListener('click', () => {
        const text = document.getElementById('claudePromptTextarea')?.value || '';
        if (!text) return;
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sessionTitle.replace(/\s+/g, '_')}_PromptClaude.md`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // 6. Chat form
    const chatForm = document.getElementById('chatInputForm');
    if (chatForm) {
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendChatMessage();
      });
    }

    const btnClearChat = document.getElementById('btnClearChatHistory');
    if (btnClearChat) {
      btnClearChat.addEventListener('click', () => {
        chatHistory = [];
        const box = document.getElementById('chatMessagesContainer');
        if (box) {
          box.innerHTML = `
            <div class="flex items-start space-x-2.5">
              <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shrink-0 text-xs">🤖</div>
              <div class="bg-surface-800 border border-slate-700/80 rounded-2xl rounded-tl-sm p-3 max-w-xl text-xs text-slate-200 leading-relaxed shadow">
                Chat reiniciado. ¿En qué te ayudo?
              </div>
            </div>
          `;
        }
      });
    }

    // 7. Modals
    const btnOpenSettings = document.getElementById('btnOpenSettings');
    const btnCloseSettings = document.getElementById('btnCloseSettingsModal');
    const settingsModal = document.getElementById('settingsModal');
    if (btnOpenSettings && settingsModal) btnOpenSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    if (btnCloseSettings && settingsModal) btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));

    const btnCloseImg = document.getElementById('btnCloseImageModal');
    const imgModal = document.getElementById('imageDetailModal');
    if (btnCloseImg && imgModal) btnCloseImg.addEventListener('click', () => imgModal.classList.add('hidden'));

    // Test Gemini Key Button
    const btnTestKey = document.getElementById('btnTestGeminiKey');
    if (btnTestKey) {
      btnTestKey.addEventListener('click', async () => {
        const key = document.getElementById('settingGeminiKey')?.value.trim();
        const badge = document.getElementById('testKeyResultBadge');
        if (!key) {
          if (badge) badge.innerHTML = '<span class="text-rose-400">Ingresa una clave primero</span>';
          return;
        }
        if (badge) badge.innerHTML = '<span class="text-indigo-400 animate-pulse">Probando...</span>';

        try {
          const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Hola' }] }] })
          });
          if (resp.ok) {
            if (badge) badge.innerHTML = '<span class="text-emerald-400 font-bold">✅ API Key Válida</span>';
            showToast('¡API Key verificada y funcionando!', 'success');
            localStorage.setItem('gemini_api_key', key);
          } else {
            const err = await resp.json();
            if (badge) badge.innerHTML = '<span class="text-rose-400">❌ Clave Inválida</span>';
            showToast('API Key no válida: ' + (err.error?.message || ''), 'error');
          }
        } catch (e) {
          if (badge) badge.innerHTML = '<span class="text-rose-400">❌ Error de conexión</span>';
        }
      });
    }

    // Save Settings button
    const btnSaveSettings = document.getElementById('btnSaveSettings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => {
        const key = document.getElementById('settingGeminiKey')?.value.trim() || '';
        localStorage.setItem('gemini_api_key', key);
        showToast('Ajustes guardados correctamente', 'success');
        if (settingsModal) settingsModal.classList.add('hidden');
      });
    }

    // Silence modal actions
    const btnResumeModal = document.getElementById('btnResumeSessionModal');
    const btnFinishModal = document.getElementById('btnFinishAndAnalyzeModal');
    const silenceModal = document.getElementById('silenceAlertModal');
    if (btnResumeModal && silenceModal) {
      btnResumeModal.addEventListener('click', () => {
        silenceModal.classList.add('hidden');
        if (!isRecording) startRecording();
      });
    }
    if (btnFinishModal && silenceModal) {
      btnFinishModal.addEventListener('click', () => {
        silenceModal.classList.add('hidden');
        stopRecording();
        runProcessAnalysis();
      });
    }

    // Session Title change
    const titleInput = document.getElementById('sessionTitleInput');
    if (titleInput) {
      titleInput.addEventListener('change', (e) => {
        sessionTitle = e.target.value.trim() || 'Sesión';
        saveDataLocal();
      });
    }

    // New Session
    const btnNew = document.getElementById('btnNewSession');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        if (confirm('¿Iniciar nueva sesión? La actual quedará guardada.')) {
          stopRecording();
          currentSessionId = 'session_' + Date.now();
          sessionTitle = 'Nueva Sesión de Trabajo';
          transcriptItems = [];
          ocrItems = [];
          currentAnalysis = null;
          elapsedSeconds = 0;
          if (titleInput) titleInput.value = sessionTitle;
          const stream = document.getElementById('timelineStreamList');
          if (stream) stream.innerHTML = '';
          const empty = document.getElementById('timelineEmptyState');
          if (empty) empty.classList.remove('hidden');
          renderPhotoThumbnails();
          updateCounters();
          saveDataLocal();
          switchTab('capture');
          showToast('Nueva sesión lista', 'info');
        }
      });
    }

    // Download transcript .txt
    const btnDownTxt = document.getElementById('btnDownloadTranscript');
    if (btnDownTxt) {
      btnDownTxt.addEventListener('click', () => {
        if (transcriptItems.length === 0) {
          showToast('No hay transcripción aún', 'warning');
          return;
        }
        const text = transcriptItems.map(i => `[${i.timestamp}] ${i.speaker}: ${i.text}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sessionTitle.replace(/\s+/g, '_')}_Transcripcion.txt`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // History Modal
    const btnHist = document.getElementById('btnOpenHistory');
    const btnCloseHist = document.getElementById('btnCloseHistoryModal');
    const histModal = document.getElementById('historyModal');
    if (btnHist && histModal) {
      btnHist.addEventListener('click', () => {
        histModal.classList.remove('hidden');
        renderHistoryList();
      });
    }
    if (btnCloseHist && histModal) btnCloseHist.addEventListener('click', () => histModal.classList.add('hidden'));

    function renderHistoryList() {
      const container = document.getElementById('historyListContainer');
      if (!container) return;
      const historyList = JSON.parse(localStorage.getItem('sessionflow_history') || '[]');
      if (historyList.length === 0) {
        container.innerHTML = '<div class="text-center py-6 text-xs text-slate-400">No hay sesiones en el historial</div>';
        return;
      }
      container.innerHTML = historyList.map(h => `
        <div class="bg-surface-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-slate-200">${escapeHtml(h.title)}</div>
            <div class="text-[10px] text-slate-400">${h.transcriptsCount || 0} intervenciones · ${h.photosCount || 0} fotos</div>
          </div>
          <span class="text-[10px] text-indigo-400 font-mono">${new Date(h.updatedAt).toLocaleDateString()}</span>
        </div>
      `).join('');
    }

    console.log('SessionFlow AI Mobile & Desktop initialized successfully!');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
