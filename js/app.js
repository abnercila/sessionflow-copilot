/**
 * ==========================================================================
 * SESSIONFLOW AI v2.6 - MASTER ENGINE (REAL-TIME STREAM & SAVE NAMING)
 * Zero-Dependency, Direct Global Bindings, iPhone Safari & Desktop Infallible
 * ==========================================================================
 */

(function() {
  'use strict';

  // --- APPLICATION STATE ---
  const state = {
    sessionId: 'session_' + Date.now(),
    title: 'Sesión de Capacitación y Procesos',
    transcripts: [],
    photos: [],
    analysis: null,
    chatHistory: [],
    activeTab: 'capture',
    
    // Recording
    isRecording: false,
    isPaused: false,
    elapsedSeconds: 0,
    timerInterval: null,
    silenceTimer: null,
    lastSpeechTimestamp: Date.now(),
    speechEngine: null,
    audioStream: null,
    audioContext: null,
    audioAnalyser: null,
    animFrameId: null,
    totalWordCount: 0,
    
    geminiKey: localStorage.getItem('sessionflow_gemini_key') || '',
    speechLang: localStorage.getItem('sessionflow_speech_lang') || 'es-MX'
  };

  let selectedPhotoForModal = null;

  // --- HAPTICS & TOAST ---
  function haptic(duration = 15) {
    try {
      if (navigator.vibrate) navigator.vibrate(duration);
    } catch (e) {}
  }

  function showToast(message, type = 'info') {
    haptic(15);
    const shelf = document.getElementById('toastShelf');
    if (!shelf) return;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: '✨' };
    const colors = {
      success: 'rgba(16, 185, 129, 0.95)',
      error: 'rgba(244, 63, 94, 0.95)',
      warning: 'rgba(245, 158, 11, 0.95)',
      info: 'rgba(30, 41, 59, 0.95)'
    };

    toast.style.background = colors[type] || colors.info;
    toast.innerHTML = `<span>${icons[type] || '✨'}</span><span>${escapeHtml(message)}</span>`;
    shelf.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTimer(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  }

  function getCurrentTimeString() {
    return new Date().toTimeString().split(' ')[0];
  }

  // --- TAB NAVIGATION ---
  function switchTab(tabId) {
    haptic(10);
    state.activeTab = tabId;

    document.querySelectorAll('.nav-tab-item').forEach(btn => {
      if (btn.dataset.tab === tabId) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    document.querySelectorAll('.nav-dock-item').forEach(btn => {
      if (btn.dataset.tab === tabId) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
      if (panel.id === `panel-${tabId}`) panel.classList.add('active');
      else panel.classList.remove('active');
    });

    if (tabId === 'claude') {
      generateClaudePrompt();
    }
  }

  // --- AUDIO RECORDING & REAL-TIME VISUALIZER ---
  async function startRecording() {
    haptic(30);

    // 1. Request microphone hardware stream for visualizer & iOS permission
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        state.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          state.audioContext = new AudioCtx();
          if (state.audioContext.state === 'suspended') {
            await state.audioContext.resume();
          }
          const source = state.audioContext.createMediaStreamSource(state.audioStream);
          state.audioAnalyser = state.audioContext.createAnalyser();
          state.audioAnalyser.fftSize = 64;
          source.connect(state.audioAnalyser);
          startWaveformVisualizer();
        }
      }
    } catch (e) {
      console.warn('Microphone hardware permission info:', e);
    }

    // 2. Initialize Speech Recognition
    if (!state.speechEngine) {
      state.speechEngine = initSpeechRecognition();
    }

    state.isRecording = true;
    state.isPaused = false;
    state.lastSpeechTimestamp = Date.now();

    // UI Updates
    const btn = document.getElementById('btnBigRecord');
    if (btn) {
      btn.classList.add('recording');
      const icon = document.getElementById('recordBtnIcon');
      if (icon) icon.textContent = '⏹️';
    }

    const dot = document.getElementById('pulseDot');
    if (dot) dot.className = 'pulse-dot recording';

    const liveDot = document.getElementById('liveStatusDot');
    if (liveDot) liveDot.style.background = '#10b981';

    const statusLabel = document.getElementById('recordStatusLabel');
    if (statusLabel) statusLabel.textContent = 'Grabando y transcribiendo en vivo...';

    const streamingBox = document.getElementById('liveSpeechStreamingText');
    if (streamingBox) streamingBox.textContent = '🎙️ Escuchando... habla y verás las palabras aquí en tiempo real.';

    const pauseBtn = document.getElementById('btnPauseAudio');
    if (pauseBtn) {
      pauseBtn.style.display = 'inline-flex';
      pauseBtn.textContent = '⏸️ Pausar';
    }

    const finishBtn = document.getElementById('btnFinishAndSave');
    if (finishBtn) finishBtn.style.display = 'inline-flex';

    // Start timer
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      state.elapsedSeconds++;
      const timeStr = formatTimer(state.elapsedSeconds);
      const topTimer = document.getElementById('sessionTimer');
      if (topTimer) topTimer.textContent = timeStr;
      const bigTimer = document.getElementById('recordTimeLarge');
      if (bigTimer) bigTimer.textContent = timeStr;
    }, 1000);

    // Silence detector
    if (state.silenceTimer) clearInterval(state.silenceTimer);
    state.silenceTimer = setInterval(() => {
      if (state.isRecording && !state.isPaused) {
        const silentForMs = Date.now() - state.lastSpeechTimestamp;
        if (silentForMs > 25000 && state.transcripts.length > 0) {
          openSilenceModal();
        }
      }
    }, 8000);

    // Start recognition
    if (state.speechEngine) {
      try { state.speechEngine.start(); } catch (e) {}
    }

    showToast('🎙️ Grabación y transcripción en vivo iniciada', 'success');
  }

  function startWaveformVisualizer() {
    const bars = document.querySelectorAll('#waveformBars .wave-bar');
    if (!bars || bars.length === 0 || !state.audioAnalyser) return;

    const dataArray = new Uint8Array(state.audioAnalyser.frequencyBinCount);
    function updateVisualizer() {
      if (!state.isRecording || state.isPaused) {
        bars.forEach(b => b.style.height = '6px');
        return;
      }

      state.audioAnalyser.getByteFrequencyData(dataArray);
      for (let i = 0; i < bars.length; i++) {
        const val = dataArray[i * 2] || 0;
        const height = Math.max(6, Math.min(28, (val / 255) * 32));
        bars[i].style.height = `${height}px`;
      }

      state.animFrameId = requestAnimationFrame(updateVisualizer);
    }
    updateVisualizer();
  }

  function initSpeechRecognition() {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechClass) {
      const badge = document.getElementById('audioEngineBadge');
      if (badge) badge.textContent = 'Audio Local';
      return null;
    }

    const recognition = new SpeechClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = state.speechLang || 'es-MX';

    recognition.onresult = (event) => {
      state.lastSpeechTimestamp = Date.now();
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += text;
        else interim += text;
      }

      // Real-time live streaming text display
      const streamText = document.getElementById('liveSpeechStreamingText');
      if (streamText) {
        if (interim) {
          streamText.textContent = `▶️ "${interim.trim()}"`;
          streamText.style.display = 'block';
        } else if (final) {
          streamText.textContent = `✓ "${final.trim()}"`;
        }
      }

      // Live word count update
      if (interim || final) {
        const words = (interim + ' ' + final).trim().split(/\s+/).filter(Boolean).length;
        updateLiveWordCount(words);
      }

      // When final sentence completes
      if (final.trim().length > 1) {
        addTranscriptItem(final.trim(), 'Participante');
        addLiveTranscriptSnippet(final.trim());
      }
    };

    recognition.onerror = (err) => {
      console.warn('Speech engine:', err.error);
    };

    recognition.onend = () => {
      if (state.isRecording && !state.isPaused) {
        try { recognition.start(); } catch (e) {}
      }
    };

    return recognition;
  }

  function addLiveTranscriptSnippet(text) {
    const list = document.getElementById('recentLiveTranscriptList');
    if (!list) return;

    const item = document.createElement('div');
    item.className = 'live-history-pill';
    item.innerHTML = `<strong style="color:var(--accent-indigo); font-family:var(--font-mono); font-size:10px;">[${getCurrentTimeString()}]</strong> ${escapeHtml(text)}`;
    list.prepend(item);

    // Limit live preview stack to 5 most recent
    if (list.children.length > 5) {
      list.removeChild(list.lastChild);
    }
  }

  function updateLiveWordCount(currentSentenceWords = 0) {
    let total = 0;
    state.transcripts.forEach(t => {
      total += (t.text || '').trim().split(/\s+/).filter(Boolean).length;
    });
    total += currentSentenceWords;
    state.totalWordCount = total;

    const countBadge = document.getElementById('liveWordCount');
    if (countBadge) countBadge.textContent = `${total} palabras`;
  }

  function pauseRecording() {
    haptic(20);
    if (!state.isRecording) return;

    state.isPaused = !state.isPaused;
    const pauseBtn = document.getElementById('btnPauseAudio');
    const dot = document.getElementById('pulseDot');
    const liveDot = document.getElementById('liveStatusDot');
    const statusLabel = document.getElementById('recordStatusLabel');

    if (state.isPaused) {
      if (state.speechEngine) {
        try { state.speechEngine.stop(); } catch (e) {}
      }
      if (pauseBtn) pauseBtn.textContent = '▶️ Reanudar';
      if (dot) dot.className = 'pulse-dot paused';
      if (liveDot) liveDot.style.background = '#f59e0b';
      if (statusLabel) statusLabel.textContent = 'Sesión en pausa';
      showToast('Pausa activada', 'warning');
    } else {
      if (state.speechEngine) {
        try { state.speechEngine.start(); } catch (e) {}
      }
      state.lastSpeechTimestamp = Date.now();
      if (pauseBtn) pauseBtn.textContent = '⏸️ Pausar';
      if (dot) dot.className = 'pulse-dot recording';
      if (liveDot) liveDot.style.background = '#10b981';
      if (statusLabel) statusLabel.textContent = 'Grabando...';
      showToast('Grabación reanudada', 'info');
    }
  }

  function stopRecording() {
    haptic(25);
    state.isRecording = false;
    state.isPaused = false;

    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    if (state.silenceTimer) {
      clearInterval(state.silenceTimer);
      state.silenceTimer = null;
    }

    if (state.speechEngine) {
      try { state.speechEngine.stop(); } catch (e) {}
    }

    if (state.audioStream) {
      state.audioStream.getTracks().forEach(track => track.stop());
      state.audioStream = null;
    }

    // UI Reset
    const btn = document.getElementById('btnBigRecord');
    if (btn) {
      btn.classList.remove('recording');
      const icon = document.getElementById('recordBtnIcon');
      if (icon) icon.textContent = '🎙️';
    }

    const dot = document.getElementById('pulseDot');
    if (dot) dot.className = 'pulse-dot';

    const liveDot = document.getElementById('liveStatusDot');
    if (liveDot) liveDot.style.background = '#64748b';

    const statusLabel = document.getElementById('recordStatusLabel');
    if (statusLabel) statusLabel.textContent = 'Toca el botón para Grabar';

    const pauseBtn = document.getElementById('btnPauseAudio');
    if (pauseBtn) pauseBtn.style.display = 'none';

    const finishBtn = document.getElementById('btnFinishAndSave');
    if (finishBtn) finishBtn.style.display = 'none';

    saveSessionData();
  }

  function toggleRecord() {
    if (!state.isRecording) startRecording();
    else {
      stopRecording();
      openSaveSessionModal();
    }
  }

  function stopAndPromptSave() {
    stopRecording();
    openSaveSessionModal();
  }

  function addTranscriptItem(text, speaker = 'Participante') {
    const item = {
      id: 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: getCurrentTimeString(),
      speaker: speaker,
      text: text
    };
    state.transcripts.push(item);
    renderTimelineBubble(item, 'speech');
    updateBadges();
    updateLiveWordCount(0);
    saveSessionData();
  }

  // --- SAVE SESSION MODAL (CUSTOM NAME) ---
  function openSaveSessionModal() {
    haptic(25);
    const modal = document.getElementById('modalSaveSession');
    const inputTitle = document.getElementById('saveModalSessionTitle');
    const durBadge = document.getElementById('saveModalDuration');
    const txBadge = document.getElementById('saveModalTranscripts');
    const photoBadge = document.getElementById('saveModalPhotos');

    // Generate smart default name with date & time if title is still default
    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}`;
    const timeStr = getCurrentTimeString().slice(0, 5);
    
    let defaultName = state.title;
    if (!defaultName || defaultName === 'Sesión de Capacitación y Procesos' || defaultName === 'Nueva Sesión de Trabajo') {
      defaultName = `Sesión Grabada - ${dateStr} ${timeStr}`;
    }

    if (inputTitle) inputTitle.value = defaultName;
    if (durBadge) durBadge.textContent = `⏱️ Duración: ${formatTimer(state.elapsedSeconds)}`;
    if (txBadge) txBadge.textContent = `📝 ${state.transcripts.length} frases (${state.totalWordCount} palabras)`;
    if (photoBadge) photoBadge.textContent = `📸 ${state.photos.length} fotos`;

    if (modal) modal.classList.add('active');
  }

  function closeSaveSessionModal() {
    const modal = document.getElementById('modalSaveSession');
    if (modal) modal.classList.remove('active');
  }

  function confirmSaveOnly() {
    const inputTitle = document.getElementById('saveModalSessionTitle');
    if (inputTitle && inputTitle.value.trim()) {
      state.title = inputTitle.value.trim();
      const mainTitleInput = document.getElementById('sessionTitleInput');
      if (mainTitleInput) mainTitleInput.value = state.title;
    }
    closeSaveSessionModal();
    saveSessionData();
    showToast(`💾 Sesión "${state.title}" guardada en el historial`, 'success');
  }

  function confirmSaveAndAnalyze() {
    const inputTitle = document.getElementById('saveModalSessionTitle');
    if (inputTitle && inputTitle.value.trim()) {
      state.title = inputTitle.value.trim();
      const mainTitleInput = document.getElementById('sessionTitleInput');
      if (mainTitleInput) mainTitleInput.value = state.title;
    }
    closeSaveSessionModal();
    saveSessionData();
    generateWorkflowAnalysis();
  }

  // --- CAMERA & OCR INTELLIGENCE ---
  async function handleImageFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    haptic(25);
    showToast(`Procesando ${fileList.length} imagen(es)...`, 'info');

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type.startsWith('image/')) continue;

      const dataUrl = await readFileAsBase64(file);
      const photoItem = {
        id: 'p_' + Date.now() + '_' + i,
        timestamp: getCurrentTimeString(),
        dataUrl: dataUrl,
        ocrText: 'Extrayendo texto con Gemini Vision...',
        interpretation: 'Analizando contenido visual...'
      };

      state.photos.push(photoItem);
      renderPhotoGalleryThumb(photoItem);
      renderTimelineBubble(photoItem, 'photo');
      updateBadges();
      saveSessionData();

      performGeminiVisionOCR(photoItem);
    }
  }

  function readFileAsBase64(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  async function performGeminiVisionOCR(photoItem) {
    const key = state.geminiKey || localStorage.getItem('sessionflow_gemini_key');
    const base64Data = photoItem.dataUrl.split(',')[1];
    const mimeType = photoItem.dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';

    if (!key) {
      photoItem.ocrText = "[OCR Local]: Foto de pantalla capturada correctamente. Para extracción en tiempo real con Gemini 2.0 Flash, agrega tu API Key gratuita en Ajustes ⚙️.";
      photoItem.interpretation = "Captura de pantalla / conversación de Teams registrada en el flujo.";
      updatePhotoInUI(photoItem);
      saveSessionData();
      return;
    }

    try {
      const prompt = `Analiza esta captura de pantalla de trabajo (Teams, software empresarial, diagrama o presentación).
1. Realiza OCR completo y exacto de todo el texto, nombres, botones, mensajes y menús visibles.
2. Explica en 2 oraciones qué proceso o acción se está mostrando aquí.
Devuelve tu respuesta estrictamente en este formato JSON:
{
  "ocrText": "todo el texto extraído aquí...",
  "interpretation": "explicación clara del proceso mostrado..."
}`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }]
        })
      });

      if (response.ok) {
        const result = await response.json();
        const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        try {
          const jsonMatch = textContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            photoItem.ocrText = parsed.ocrText || textContent;
            photoItem.interpretation = parsed.interpretation || 'Captura analizada con éxito.';
          } else {
            photoItem.ocrText = textContent;
            photoItem.interpretation = 'Texto y pantalla procesados.';
          }
        } catch (e) {
          photoItem.ocrText = textContent;
          photoItem.interpretation = 'Texto extraído correctamente.';
        }
        showToast('📸 OCR de pantalla completado', 'success');
      } else {
        photoItem.ocrText = 'Foto capturada.';
        photoItem.interpretation = 'Verifica tu clave en ajustes.';
      }
    } catch (err) {
      photoItem.ocrText = 'Foto capturada localmente.';
      photoItem.interpretation = 'Listo para el prompt de Claude.';
    }

    updatePhotoInUI(photoItem);
    saveSessionData();
  }

  function updatePhotoInUI(photoItem) {
    const bubbleEl = document.getElementById(`bubble_${photoItem.id}`);
    if (bubbleEl) {
      const descEl = bubbleEl.querySelector('.bubble-ocr-text');
      if (descEl) descEl.textContent = photoItem.interpretation || photoItem.ocrText;
    }
  }

  // --- WORKFLOW GENERATOR ---
  async function generateWorkflowAnalysis() {
    haptic(30);
    if (state.transcripts.length === 0 && state.photos.length === 0) {
      showToast('Graba audio o toma fotos antes de armar el flujo', 'warning');
      return;
    }

    showToast('⚡ Sintetizando flujo con IA...', 'info');
    switchTab('workflow');

    const summaryEl = document.getElementById('workflowSummaryText');
    if (summaryEl) summaryEl.textContent = 'Analizando todas las intervenciones de voz y fotos de pantalla...';

    const key = state.geminiKey || localStorage.getItem('sessionflow_gemini_key');
    const sessionTranscriptText = state.transcripts.map(t => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n');
    const photosText = state.photos.map((p, idx) => `[Foto #${idx+1} a las ${p.timestamp}]: OCR: ${p.ocrText} | Contexto: ${p.interpretation}`).join('\n');

    if (!key) {
      const localAnalysis = buildLocalWorkflow(sessionTranscriptText, photosText);
      renderWorkflow(localAnalysis);
      showToast('Flujo estructurado generado', 'success');
      return;
    }

    try {
      const prompt = `Eres un Arquitecto de Procesos y Tutor Senior de Negocio.
Analiza la siguiente información de una sesión de trabajo:
=== TRANSCRIPCIÓN DE AUDIO ===
${sessionTranscriptText || '(Sin audio)'}

=== FOTOS DE PANTALLA Y TEAMS ===
${photosText || '(Sin fotos)'}

Genera una guía paso a paso ultra clara y estructurada.
Devuelve ÚNICAMENTE este formato JSON válido:
{
  "summary": "Resumen ejecutivo claro del objetivo de este proceso.",
  "steps": [
    {
      "number": 1,
      "title": "Nombre del paso",
      "role": "Quién lo hace",
      "description": "Explicación detallada y clara.",
      "keyAction": "Acción o botón clave que se debe presionar",
      "tool": "Herramienta (ej. Teams, Excel, Portal)"
    }
  ],
  "glossary": [
    { "term": "Término/Sigla", "definition": "Significado claro" }
  ],
  "tips": [
    "Consejo clave o error frecuente que se debe evitar"
  ]
}`;

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysisObj = JSON.parse(jsonMatch[0]);
          state.analysis = analysisObj;
          renderWorkflow(analysisObj);
          saveSessionData();
          showToast('✨ ¡Flujo generado exitosamente!', 'success');
          return;
        }
      }
    } catch (e) {
      console.warn('Gemini workflow error:', e);
    }

    const local = buildLocalWorkflow(sessionTranscriptText, photosText);
    renderWorkflow(local);
  }

  function buildLocalWorkflow(transcripts, photos) {
    const steps = [];
    if (state.transcripts.length > 0) {
      state.transcripts.forEach((t, i) => {
        if (i < 6) {
          steps.push({
            number: i + 1,
            title: `Paso ${i + 1}: ${t.text.slice(0, 35)}...`,
            role: t.speaker || 'Responsable',
            description: t.text,
            keyAction: 'Revisar y ejecutar acción acordada',
            tool: 'Sistema de Trabajo'
          });
        }
      });
    } else {
      steps.push({
        number: 1,
        title: 'Revisión de Pantallas y Capturas',
        role: 'Usuario',
        description: 'Se revisan las capturas de pantalla de Teams y la información registrada.',
        keyAction: 'Verificar datos en pantalla',
        tool: 'Teams / Sistema'
      });
    }

    const analysis = {
      summary: `Sesión de trabajo: "${state.title}". Se registraron ${state.transcripts.length} intervenciones de voz y ${state.photos.length} fotos de pantalla.`,
      steps: steps,
      glossary: [
        { term: 'Teams', definition: 'Plataforma de comunicación y reuniones del equipo de trabajo.' },
        { term: 'Proceso Operativo', definition: 'Flujo de pasos secuenciales para completar la tarea.' }
      ],
      tips: [
        'Asegúrate de seguir los pasos en el orden indicado.',
        'Si tienes dudas sobre una pantalla, consulta la foto correspondiente en la pestaña de fotos.'
      ]
    };

    state.analysis = analysis;
    saveSessionData();
    return analysis;
  }

  function renderWorkflow(analysis) {
    if (!analysis) return;

    const summaryEl = document.getElementById('workflowSummaryText');
    if (summaryEl) summaryEl.textContent = analysis.summary || 'Resumen del proceso.';

    const stepsContainer = document.getElementById('workflowStepsList');
    if (stepsContainer) {
      if (!analysis.steps || analysis.steps.length === 0) {
        stepsContainer.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">No se identificaron pasos específicos aún.</div>';
      } else {
        stepsContainer.innerHTML = analysis.steps.map(s => `
          <div class="step-card">
            <div class="step-number">${s.number || 1}</div>
            <div class="step-details">
              <div class="step-title">${escapeHtml(s.title)}</div>
              <div class="step-desc">${escapeHtml(s.description)}</div>
              <div class="step-meta">
                ${s.role ? `<span class="badge-tag" style="color:var(--accent-indigo);">👤 ${escapeHtml(s.role)}</span>` : ''}
                ${s.tool ? `<span class="badge-tag" style="color:var(--accent-cyan);">💻 ${escapeHtml(s.tool)}</span>` : ''}
                ${s.keyAction ? `<span class="badge-tag" style="color:var(--accent-emerald);">⚡ ${escapeHtml(s.keyAction)}</span>` : ''}
              </div>
            </div>
          </div>
        `).join('');
      }
    }

    // Glossary
    const glossaryCard = document.getElementById('workflowGlossaryCard');
    const glossaryList = document.getElementById('glossaryList');
    if (glossaryCard && glossaryList) {
      if (analysis.glossary && analysis.glossary.length > 0) {
        glossaryCard.style.display = 'block';
        glossaryList.innerHTML = analysis.glossary.map(g => `
          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); padding:8px 10px; border-radius:10px;">
            <strong style="color:var(--accent-indigo); display:block; margin-bottom:2px;">${escapeHtml(g.term)}</strong>
            <span style="color:var(--text-muted);">${escapeHtml(g.definition)}</span>
          </div>
        `).join('');
      } else {
        glossaryCard.style.display = 'none';
      }
    }

    // Tips
    const tipsCard = document.getElementById('workflowTipsCard');
    const tipsList = document.getElementById('tipsList');
    if (tipsCard && tipsList) {
      if (analysis.tips && analysis.tips.length > 0) {
        tipsCard.style.display = 'block';
        tipsList.innerHTML = analysis.tips.map(t => `
          <div style="display:flex; align-items:flex-start; gap:6px; margin-bottom:6px;">
            <span style="color:var(--accent-amber);">⚠️</span>
            <span>${escapeHtml(t)}</span>
          </div>
        `).join('');
      } else {
        tipsCard.style.display = 'none';
      }
    }
  }

  // --- CLAUDE SUPER PROMPT GENERATOR ---
  function generateClaudePrompt() {
    const tx = document.getElementById('claudePromptTextarea');
    if (!tx) return;

    let transcriptText = state.transcripts.map(t => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n');
    if (!transcriptText) transcriptText = "(No se registraron audios en esta sesión)";

    let ocrText = state.photos.map((p, idx) => `--- FOTO #${idx+1} (${p.timestamp}) ---
Contexto: ${p.interpretation || 'Captura de pantalla'}
Texto OCR Extraído:
${p.ocrText || 'Sin texto'}
`).join('\n\n');
    if (!ocrText) ocrText = "(No se agregaron capturas de pantalla)";

    const prompt = `# ROL Y OBJETIVO
Actúa como mi mentor y tutor experto de negocio y procesos. Tu meta es explicarme de forma cristalina, paso a paso y con ejemplos prácticos todo lo que se habló y mostró en esta reunión de trabajo ("${state.title}").

Aún estoy aprendiendo los flujos de mi trabajo, así que por favor:
1. Explícame de qué trata este proceso como si tuviera que explicárselo a alguien nuevo.
2. Desglosa los pasos exactos que debo seguir cuando me toque hacerlo a mí.
3. Traduce las siglas o términos técnicos que se mencionaron a español claro y comprensible.
4. Señala qué botones debo presionar o qué acciones debo tomar según el texto extraído de las capturas de pantalla de Teams.
5. Dame una lista de 3 preguntas de repaso para asegurarme de que dominé el tema.

---

## 🎙️ TRANSCRIPCIÓN COMPLETA DE LA SESIÓN DE AUDIO
\`\`\`text
${transcriptText}
\`\`\`

---

## 📸 FOTOS Y TEXTO EXTRAÍDO DE PANTALLAS (TEAMS / SISTEMAS)
${ocrText}

---

Por favor, comienza estructurando la explicación de forma amigable, profesional y extremadamente clara.`;

    tx.value = prompt;
  }

  // --- COPILOTO CHAT ---
  async function sendChatMessage() {
    const input = document.getElementById('chatInputText');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    haptic(15);
    input.value = '';
    appendChatBubble(text, 'user');

    const key = state.geminiKey || localStorage.getItem('sessionflow_gemini_key');
    const sessionContext = state.transcripts.map(t => `${t.speaker}: ${t.text}`).join('\n');
    const photoContext = state.photos.map((p, i) => `Foto ${i+1}: ${p.ocrText}`).join('\n');

    if (!key) {
      setTimeout(() => {
        appendChatBubble(`Entendido sobre "${text}". Tengo registradas ${state.transcripts.length} intervenciones de voz y ${state.photos.length} fotos de Teams. Para que pueda responderte con análisis profundo en vivo, agrega tu clave gratuita de Gemini en el botón ⚙️ Ajustes arriba a la derecha. También puedes ir a la pestaña "Claude" y copiar el prompt completo para preguntárselo a Claude.`, 'ai');
      }, 500);
      return;
    }

    try {
      const prompt = `Eres el copiloto de trabajo del usuario. Tienes acceso al registro de su reunión actual:
CONTEXTO DE LA REUNIÓN ("${state.title}"):
${sessionContext || 'Sin audio'}

TEXTO DE PANTALLAS / TEAMS:
${photoContext || 'Sin fotos'}

PREGUNTA DEL USUARIO:
${text}

Responde de forma concisa, útil, motivadora y clara en español.`;

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (resp.ok) {
        const data = await resp.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No pude procesar la respuesta.';
        appendChatBubble(reply, 'ai');
      } else {
        appendChatBubble('Hubo un inconveniente al consultar a la IA. Verifica tu clave en Ajustes ⚙️.', 'ai');
      }
    } catch (e) {
      appendChatBubble('Error de conexión al consultar el Copiloto.', 'ai');
    }
  }

  function appendChatBubble(text, sender = 'user') {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}`;
    bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br/>');
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  // --- UI RENDERING HELPERS ---
  function renderTimelineBubble(item, type) {
    const container = document.getElementById('timelineContainer');
    const emptyNotice = document.getElementById('timelineEmptyNotice');
    if (emptyNotice) emptyNotice.style.display = 'none';
    if (!container) return;

    const bubble = document.createElement('div');
    bubble.id = `bubble_${item.id}`;
    bubble.className = `timeline-bubble ${type === 'photo' ? 'photo-bubble' : 'user-bubble'}`;

    if (type === 'speech') {
      bubble.innerHTML = `
        <div class="bubble-header">
          <span class="bubble-speaker">🎙️ ${escapeHtml(item.speaker)}</span>
          <span class="bubble-time">${item.timestamp}</span>
        </div>
        <div class="bubble-content">${escapeHtml(item.text)}</div>
      `;
    } else {
      bubble.innerHTML = `
        <div class="bubble-header">
          <span class="bubble-speaker" style="color:var(--accent-cyan);">📸 Foto de Pantalla</span>
          <span class="bubble-time">${item.timestamp}</span>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <img src="${item.dataUrl}" style="width:60px; height:60px; border-radius:8px; object-fit:cover; border:1px solid var(--border-subtle);" />
          <div class="bubble-ocr-text" style="font-size:12px; color:#cbd5e1; line-height:1.4;">
            ${escapeHtml(item.interpretation || item.ocrText)}
          </div>
        </div>
      `;
      bubble.style.cursor = 'pointer';
      bubble.onclick = () => openPhotoDetail(item);
    }

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  function renderPhotoGalleryThumb(photoItem) {
    const strip = document.getElementById('photoGalleryStrip');
    if (!strip) return;

    if (state.photos.length === 1) {
      strip.innerHTML = '';
    }

    const thumb = document.createElement('div');
    thumb.className = 'photo-thumb-card';
    thumb.innerHTML = `
      <img src="${photoItem.dataUrl}" alt="Captura" />
      <span class="photo-thumb-tag">${photoItem.timestamp}</span>
    `;
    thumb.onclick = () => openPhotoDetail(photoItem);
    strip.appendChild(thumb);
  }

  function updateBadges() {
    const totalItems = state.transcripts.length + state.photos.length;
    const badgeTimeline = document.getElementById('badgeTimelineCount');
    if (badgeTimeline) badgeTimeline.textContent = totalItems.toString();

    const photoBadge = document.getElementById('photoCountBadge');
    if (photoBadge) photoBadge.textContent = `${state.photos.length} fotos`;
  }

  // --- MODAL CONTROLLERS ---
  function openSilenceModal() {
    haptic(35);
    const modal = document.getElementById('modalSilenceAlert');
    if (modal) modal.classList.add('active');
  }

  function closeSilenceModal() {
    const modal = document.getElementById('modalSilenceAlert');
    if (modal) modal.classList.remove('active');
  }

  function openPhotoDetail(photoItem) {
    haptic(15);
    selectedPhotoForModal = photoItem;
    const modal = document.getElementById('modalPhotoDetail');
    const img = document.getElementById('photoDetailImg');
    const interp = document.getElementById('photoDetailInterpretation');
    const ocrTx = document.getElementById('photoDetailOcrText');
    const title = document.getElementById('photoDetailTitle');

    if (title) title.textContent = `Captura de las ${photoItem.timestamp}`;
    if (img) img.src = photoItem.dataUrl;
    if (interp) interp.textContent = photoItem.interpretation || 'Procesando pantalla...';
    if (ocrTx) ocrTx.value = photoItem.ocrText || '';

    if (modal) modal.classList.add('active');
  }

  function closePhotoDetail() {
    const modal = document.getElementById('modalPhotoDetail');
    if (modal) modal.classList.remove('active');
  }

  function openSettingsModal() {
    haptic(15);
    const inputKey = document.getElementById('inputGeminiKey');
    if (inputKey) inputKey.value = state.geminiKey || '';
    const modal = document.getElementById('modalSettings');
    if (modal) modal.classList.add('active');
  }

  function closeSettingsModal() {
    const modal = document.getElementById('modalSettings');
    if (modal) modal.classList.remove('active');
  }

  function openHistoryModal() {
    haptic(15);
    const modal = document.getElementById('modalHistory');
    const list = document.getElementById('historyListContainer');
    if (list) {
      const history = JSON.parse(localStorage.getItem('sessionflow_saved_sessions') || '[]');
      if (history.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim); font-size:12px;">No hay sesiones guardadas aún.</div>';
      } else {
        list.innerHTML = history.map(h => `
          <div style="background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); padding:10px 12px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:13px; font-weight:700; color:#fff;">${escapeHtml(h.title)}</div>
              <div style="font-size:10px; color:var(--text-dim);">${h.transcriptsCount} audios · ${h.photosCount} fotos · ${new Date(h.date).toLocaleDateString()}</div>
            </div>
            <span style="font-size:10px; color:var(--accent-indigo); font-family:var(--font-mono);">${h.duration || '00:00'}</span>
          </div>
        `).join('');
      }
    }
    if (modal) modal.classList.add('active');
  }

  function closeHistoryModal() {
    const modal = document.getElementById('modalHistory');
    if (modal) modal.classList.remove('active');
  }

  // --- STORAGE & SESSION ---
  function saveSessionData() {
    try {
      const current = {
        sessionId: state.sessionId,
        title: state.title,
        transcripts: state.transcripts,
        photos: state.photos,
        analysis: state.analysis,
        elapsedSeconds: state.elapsedSeconds,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem('sessionflow_current_state', JSON.stringify(current));

      let history = JSON.parse(localStorage.getItem('sessionflow_saved_sessions') || '[]');
      const idx = history.findIndex(h => h.sessionId === state.sessionId);
      const summary = {
        sessionId: state.sessionId,
        title: state.title,
        transcriptsCount: state.transcripts.length,
        photosCount: state.photos.length,
        duration: formatTimer(state.elapsedSeconds),
        date: new Date().toISOString()
      };

      if (idx >= 0) history[idx] = summary;
      else history.unshift(summary);

      localStorage.setItem('sessionflow_saved_sessions', JSON.stringify(history.slice(0, 25)));
    } catch (e) {}
  }

  function restoreSavedSession() {
    try {
      const savedKey = localStorage.getItem('sessionflow_gemini_key');
      if (savedKey) state.geminiKey = savedKey;

      const raw = localStorage.getItem('sessionflow_current_state');
      if (!raw) return;

      const data = JSON.parse(raw);
      state.sessionId = data.sessionId || state.sessionId;
      state.title = data.title || state.title;
      state.transcripts = data.transcripts || [];
      state.photos = data.photos || [];
      state.analysis = data.analysis || null;
      state.elapsedSeconds = data.elapsedSeconds || 0;

      const titleInput = document.getElementById('sessionTitleInput');
      if (titleInput) titleInput.value = state.title;

      const topTimer = document.getElementById('sessionTimer');
      if (topTimer) topTimer.textContent = formatTimer(state.elapsedSeconds);

      state.transcripts.forEach(t => {
        renderTimelineBubble(t, 'speech');
        addLiveTranscriptSnippet(t.text);
      });
      state.photos.forEach(p => {
        renderPhotoGalleryThumb(p);
        renderTimelineBubble(p, 'photo');
      });

      updateBadges();
      updateLiveWordCount(0);
      if (state.analysis) renderWorkflow(state.analysis);
    } catch (e) {}
  }

  function startNewSession() {
    haptic(30);
    if (confirm('¿Deseas iniciar una nueva sesión? La actual quedará guardada.')) {
      stopRecording();
      state.sessionId = 'session_' + Date.now();
      state.title = 'Nueva Sesión de Trabajo';
      state.transcripts = [];
      state.photos = [];
      state.analysis = null;
      state.elapsedSeconds = 0;
      state.totalWordCount = 0;

      const titleInput = document.getElementById('sessionTitleInput');
      if (titleInput) titleInput.value = state.title;

      const topTimer = document.getElementById('sessionTimer');
      if (topTimer) topTimer.textContent = '00:00:00';

      const bigTimer = document.getElementById('recordTimeLarge');
      if (bigTimer) bigTimer.textContent = '00:00:00';

      const streamText = document.getElementById('liveSpeechStreamingText');
      if (streamText) streamText.textContent = 'Presiona Grabar y habla; el texto irá apareciendo aquí en tiempo real...';

      const recentList = document.getElementById('recentLiveTranscriptList');
      if (recentList) recentList.innerHTML = '';

      const timeline = document.getElementById('timelineContainer');
      if (timeline) timeline.innerHTML = '<div id="timelineEmptyNotice" style="text-align: center; padding: 40px 20px; color: var(--text-dim); font-size: 13px;">No hay transcripciones todavía.</div>';

      const photoStrip = document.getElementById('photoGalleryStrip');
      if (photoStrip) photoStrip.innerHTML = '<div style="font-size: 11px; color: var(--text-dim); padding: 10px; font-style: italic;">No hay fotos aún. Toca "Tomar Foto".</div>';

      const stepsList = document.getElementById('workflowStepsList');
      if (stepsList) stepsList.innerHTML = '';

      updateBadges();
      updateLiveWordCount(0);
      saveSessionData();
      switchTab('capture');
      showToast('Nueva sesión creada', 'success');
    }
  }

  // --- EXPOSE GLOBAL WINDOW.APP OBJECT ---
  window.app = {
    toggleRecord,
    startRecording,
    pauseRecording,
    stopRecording,
    stopAndPromptSave,
    openSaveSessionModal,
    closeSaveSessionModal,
    confirmSaveOnly,
    confirmSaveAndAnalyze,
    processNow: () => {
      stopRecording();
      generateWorkflowAnalysis();
    },
    switchTab,
    startNewSession,
    openSettingsModal,
    closeSettingsModal,
    openHistoryModal,
    closeHistoryModal,
    openPhotoDetail,
    closePhotoDetail,
    handleNativeCameraChange: (e) => {
      if (e.target.files) handleImageFiles(e.target.files);
      e.target.value = '';
    },
    handleNativeGalleryChange: (e) => {
      if (e.target.files) handleImageFiles(e.target.files);
      e.target.value = '';
    },
    generateWorkflowAnalysis,
    copyClaudePrompt: async () => {
      haptic(30);
      const tx = document.getElementById('claudePromptTextarea');
      if (!tx) return;
      try {
        await navigator.clipboard.writeText(tx.value);
        showToast('📋 ¡Prompt copiado para Claude!', 'success');
      } catch (e) {
        tx.select();
        document.execCommand('copy');
        showToast('📋 ¡Prompt copiado!', 'success');
      }
    },
    downloadClaudeMd: () => {
      haptic(20);
      const tx = document.getElementById('claudePromptTextarea');
      if (!tx || !tx.value) return;
      const blob = new Blob([tx.value], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.title.replace(/\s+/g, '_')}_PromptClaude.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('⬇️ Archivo Markdown descargado', 'info');
    },
    downloadTranscriptTxt: () => {
      if (state.transcripts.length === 0) {
        showToast('No hay transcripción para descargar', 'warning');
        return;
      }
      const text = state.transcripts.map(t => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.title.replace(/\s+/g, '_')}_Transcripcion.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('⬇️ Transcripción descargada', 'info');
    },
    clearTimeline: () => {
      if (confirm('¿Limpiar transcripción y fotos de esta sesión?')) {
        state.transcripts = [];
        state.photos = [];
        const container = document.getElementById('timelineContainer');
        if (container) container.innerHTML = '<div id="timelineEmptyNotice" style="text-align: center; padding: 40px 20px; color: var(--text-dim); font-size: 13px;">Transcripción limpia.</div>';
        const photoStrip = document.getElementById('photoGalleryStrip');
        if (photoStrip) photoStrip.innerHTML = '<div style="font-size: 11px; color: var(--text-dim); padding: 10px; font-style: italic;">No hay fotos aún.</div>';
        const recentList = document.getElementById('recentLiveTranscriptList');
        if (recentList) recentList.innerHTML = '';
        updateBadges();
        updateLiveWordCount(0);
        saveSessionData();
        showToast('Registro limpiado', 'info');
      }
    },
    handleManualNote: (e) => {
      e.preventDefault();
      const input = document.getElementById('inputManualNote');
      if (input && input.value.trim()) {
        addTranscriptItem(input.value.trim(), 'Nota Manual');
        addLiveTranscriptSnippet(input.value.trim());
        input.value = '';
        showToast('Nota añadida', 'success');
      }
    },
    clearChat: () => {
      const box = document.getElementById('chatMessages');
      if (box) box.innerHTML = '<div class="chat-bubble ai">Chat reiniciado. ¿En qué te ayudo con tu reunión?</div>';
      showToast('Chat reiniciado', 'info');
    },
    askSuggested: (prompt) => {
      const input = document.getElementById('chatInputText');
      if (input && prompt) {
        input.value = prompt;
        sendChatMessage();
      }
    },
    handleChatSubmit: (e) => {
      e.preventDefault();
      sendChatMessage();
    },
    testApiKey: async () => {
      const inputKey = document.getElementById('inputGeminiKey');
      const label = document.getElementById('apiKeyStatusLabel');
      const key = inputKey?.value.trim();

      if (!key) {
        if (label) label.innerHTML = '<span style="color:var(--accent-rose);">Ingresa una clave primero</span>';
        return;
      }
      if (label) label.innerHTML = '<span style="color:var(--accent-indigo);">Probando clave...</span>';

      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hola' }] }] })
        });

        if (resp.ok) {
          if (label) label.innerHTML = '<span style="color:var(--accent-emerald); font-weight:700;">✅ Clave Válida</span>';
          state.geminiKey = key;
          localStorage.setItem('sessionflow_gemini_key', key);
          showToast('API Key verificada y guardada', 'success');
        } else {
          const errData = await resp.json();
          if (label) label.innerHTML = '<span style="color:var(--accent-rose);">❌ Clave Inválida</span>';
          showToast('Error: ' + (errData.error?.message || 'Clave no válida'), 'error');
        }
      } catch (e) {
        if (label) label.innerHTML = '<span style="color:var(--accent-rose);">❌ Error de conexión</span>';
      }
    },
    saveSettings: () => {
      const inputKey = document.getElementById('inputGeminiKey');
      const selectLang = document.getElementById('selectSpeechLang');
      if (inputKey) {
        state.geminiKey = inputKey.value.trim();
        localStorage.setItem('sessionflow_gemini_key', state.geminiKey);
      }
      if (selectLang) {
        state.speechLang = selectLang.value;
        localStorage.setItem('sessionflow_speech_lang', state.speechLang);
      }
      closeSettingsModal();
      showToast('Ajustes guardados', 'success');
    },
    resumeSilence: () => {
      closeSilenceModal();
      if (!state.isRecording) startRecording();
      else if (state.isPaused) pauseRecording();
      state.lastSpeechTimestamp = Date.now();
      showToast('Continuando sesión...', 'info');
    },
    finishSilence: () => {
      closeSilenceModal();
      stopRecording();
      openSaveSessionModal();
    },
    deleteCurrentPhoto: () => {
      if (selectedPhotoForModal) {
        state.photos = state.photos.filter(p => p.id !== selectedPhotoForModal.id);
        const bubble = document.getElementById(`bubble_${selectedPhotoForModal.id}`);
        if (bubble) bubble.remove();
        closePhotoDetail();
        updateBadges();
        saveSessionData();
        showToast('Foto eliminada', 'info');
      }
    },
    copyCurrentPhotoText: async () => {
      const ocrTx = document.getElementById('photoDetailOcrText');
      if (ocrTx && ocrTx.value) {
        await navigator.clipboard.writeText(ocrTx.value);
        showToast('Texto copiado al portapapeles', 'success');
      }
    }
  };

  // Run on startup
  restoreSavedSession();
  console.log('SessionFlow AI v2.6 Live Stream & Save Ready.');

})();
