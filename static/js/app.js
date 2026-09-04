/**
 * ==========================================================================
 * SESSIONFLOW AI v2.8 - MASTER ENGINE (PHONETIC CORRECTION & TECHNICAL LEXICON)
 * Precision Speech Stream, Enterprise Vocabulary (SAPI, RMI, GMO, SAP) & AI Refiner
 * Zero-Dependency, Direct Global Bindings, iOS Safari & Desktop Infallible
 * ==========================================================================
 */

(function() {
  'use strict';

  // --- DEFAULT TECHNICAL & ENTERPRISE VOCABULARY ---
  const DEFAULT_VOCABULARY = [
    'SAPI', 'RMI', 'GMO', 'SAP', 'API', 'APIs', 'ERP', 'CRM', 'SQL',
    'AWS', 'Azure', 'GCP', 'Jira', 'Confluence', 'SLA', 'KPI', 'QA', 'PR',
    'Webhook', 'Endpoint', 'Frontend', 'Backend', 'DevOps', 'OAuth', 'SSO',
    'Token', 'JSON', 'REST', 'GraphQL', 'Teams', 'Excel', 'Microservicio',
    'Scrum', 'Sprint', 'Postman', 'Swagger', 'Pipeline', 'Release'
  ];

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
    visualizerInterval: null,
    lastSpeechTimestamp: Date.now(),
    speechEngine: null,
    totalWordCount: 0,
    
    geminiKey: localStorage.getItem('sessionflow_gemini_key') || '',
    speechLang: localStorage.getItem('sessionflow_speech_lang') || 'es-MX',
    customVocabulary: JSON.parse(localStorage.getItem('sessionflow_custom_vocabulary') || JSON.stringify(DEFAULT_VOCABULARY))
  };

  let selectedPhotoForModal = null;

  // --- PHONETIC NORMALIZATION ENGINE ---
  function normalizeTechnicalTerms(text) {
    if (!text || typeof text !== 'string') return '';
    let processed = text;

    // 1. Specific Phonetic Acronym Regexes for Spanish speech recognition quirks:
    
    // SAPI: "saad pi", "saat pi", "sad pi", "sat pi", "sa pi", "happy", "sappy", "s a p i", "ese a pe i"
    processed = processed.replace(/\b(saad\s*pi|saat\s*pi|sad\s*pi|sat\s*pi|sa\s*pi|happy\s*de\s*pagos|sappy|s\s*a\s*p\s*i|ese\s*a\s*pe\s*i)\b/gi, 'SAPI');
    // Contextual SAPI when speech engine hears "happy" in software/business contexts
    processed = processed.replace(/\b(en\s*el|del|al|sistema|aplicaci[oó]n|servicio|flujo|endpoint|api|pantalla|m[oó]dulo|proceso)\s+happy\b/gi, '$1 SAPI');
    processed = processed.replace(/\bhappy\s+(de\s*pagos|de\s*facturaci[oó]n|core|v\d+|cloud|gateway|services?)\b/gi, 'SAPI $1');

    // RMI: "ere mi", "erre eme i", "ere eme i", "r m i", "armi", "erne i", "r mi"
    processed = processed.replace(/\b(ere\s*eme\s*i|erre\s*eme\s*i|ere\s*mi|r\s*m\s*i|armi|erne\s*i|r\s*mi)\b/gi, 'RMI');

    // GMO: "ge eme o", "ge me o", "g m o", "gmeo", "llimo", "jimo"
    processed = processed.replace(/\b(ge\s*eme\s*o|ge\s*me\s*o|g\s*m\s*o|g\s*eme\s*o|gmeo|llimo|jimo)\b/gi, 'GMO');

    // SAP: "ese a pe", "es a pe", "s a p"
    processed = processed.replace(/\b(ese\s*a\s*pe|es\s*a\s*pe|s\s*a\s*p)\b/gi, 'SAP');

    // API & APIs: "a pe i", "apei", "a p i", "a pe is", "a p i s"
    processed = processed.replace(/\b(a\s*pe\s*is|a\s*p\s*i\s*s|apeis)\b/gi, 'APIs');
    processed = processed.replace(/\b(a\s*pe\s*i|a\s*p\s*i|apei)\b/gi, 'API');

    // SQL: "ese cu ele", "s q l", "secuel", "sicuol", "sikuel"
    processed = processed.replace(/\b(ese\s*cu\s*ele|s\s*q\s*l|secuel|sicuol|sikuel)\b/gi, 'SQL');

    // AWS: "a doble u ese", "a w s"
    processed = processed.replace(/\b(a\s*doble\s*u\s*ese|a\s*w\s*s)\b/gi, 'AWS');

    // ERP, CRM, SLA, KPI, QA, PR, SSO, OAuth, JSON
    processed = processed.replace(/\b(e\s*ere\s*pe|e\s*r\s*p)\b/gi, 'ERP');
    processed = processed.replace(/\b(ce\s*ere\s*eme|c\s*r\s*m)\b/gi, 'CRM');
    processed = processed.replace(/\b(ese\s*ele\s*a|s\s*l\s*a)\b/gi, 'SLA');
    processed = processed.replace(/\b(ca\s*pe\s*i|k\s*p\s*i)\b/gi, 'KPI');
    processed = processed.replace(/\b(cu\s*a|q\s*a)\b/gi, 'QA');
    processed = processed.replace(/\b(pe\s*ere|p\s*r)\b/gi, 'PR');
    processed = processed.replace(/\b(ese\s*ese\s*o|s\s*s\s*o)\b/gi, 'SSO');
    processed = processed.replace(/\b(ou\s*ot|o\s*aut|oaut)\b/gi, 'OAuth');
    processed = processed.replace(/\b(jeison|j\s*son|geison)\b/gi, 'JSON');
    processed = processed.replace(/\b(fron\s*en|front\s*en|fronen)\b/gi, 'Frontend');
    processed = processed.replace(/\b(bak\s*en|back\s*en|baken)\b/gi, 'Backend');

    // 2. Custom User Vocabulary Case & Acronym Normalization
    if (Array.isArray(state.customVocabulary)) {
      state.customVocabulary.forEach(term => {
        if (!term || term.length < 2) return;
        const cleanTerm = term.trim();
        const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // If acronym (e.g. "GMO", "SAPI"), match spaced letters "g m o"
        if (/^[A-Z0-9_-]+$/i.test(cleanTerm) && cleanTerm.length <= 6) {
          const spaced = cleanTerm.split('').join('\\s*');
          const regSpaced = new RegExp(`\\b${spaced}\\b`, 'gi');
          processed = processed.replace(regSpaced, cleanTerm);
        }
        
        // Exact word boundary replacement with proper capitalization
        const regExact = new RegExp(`\\b${escaped}\\b`, 'gi');
        processed = processed.replace(regExact, cleanTerm);
      });
    }

    return processed;
  }

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

  // --- AUDIO RECOGNITION (IOS SAFARI COMPATIBLE) ---
  function initSpeechEngine() {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechClass) {
      const badge = document.getElementById('audioEngineBadge');
      if (badge) badge.textContent = 'Audio Manual';
      return null;
    }

    const recognition = new SpeechClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = state.speechLang || 'es-MX';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('Voice recognition started.');
      const streamText = document.getElementById('liveSpeechStreamingText');
      if (streamText) streamText.textContent = '🎙️ Escuchando... habla y verás las palabras aquí en tiempo real.';
      const liveDot = document.getElementById('liveStatusDot');
      if (liveDot) liveDot.style.background = '#10b981';
    };

    recognition.onresult = (event) => {
      state.lastSpeechTimestamp = Date.now();
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += text;
        else interim += text;
      }

      // Real-time Phonetic Normalization (SAPI, RMI, GMO, etc.)
      const normalizedInterim = normalizeTechnicalTerms(interim);
      const normalizedFinal = normalizeTechnicalTerms(final);

      // Display live streaming words
      const streamText = document.getElementById('liveSpeechStreamingText');
      if (streamText) {
        if (normalizedInterim) {
          streamText.textContent = `▶️ "${normalizedInterim.trim()}"`;
        } else if (normalizedFinal) {
          streamText.textContent = `✓ "${normalizedFinal.trim()}"`;
        }
      }

      // Pulse the wave visualizer with live speech
      animateWavebars(true);

      // Live word counter
      if (normalizedInterim || normalizedFinal) {
        const words = (normalizedInterim + ' ' + normalizedFinal).trim().split(/\s+/).filter(Boolean).length;
        updateLiveWordCount(words);
      }

      // Finalized sentence with phonetic accuracy
      if (normalizedFinal.trim().length > 1) {
        addTranscriptItem(normalizedFinal.trim(), 'Participante');
        addLiveTranscriptSnippet(normalizedFinal.trim());
      }
    };

    recognition.onerror = (err) => {
      console.warn('Speech engine status/error:', err.error);
      if (err.error === 'not-allowed') {
        showToast('Permiso de micrófono requerido en Safari/Ajustes', 'error');
        stopRecording();
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording for continuous 1h+ sessions
      if (state.isRecording && !state.isPaused) {
        try { recognition.start(); } catch (e) {}
      }
    };

    return recognition;
  }

  function animateWavebars(active = false) {
    const bars = document.querySelectorAll('#waveformBars .wave-bar');
    if (!bars || bars.length === 0) return;

    if (active) {
      bars.forEach(b => {
        const h = Math.floor(Math.random() * 20) + 6;
        b.style.height = `${h}px`;
      });
    } else {
      bars.forEach(b => b.style.height = '6px');
    }
  }

  function startRecording() {
    haptic(30);

    if (!state.speechEngine) {
      state.speechEngine = initSpeechEngine();
    }

    state.isRecording = true;
    state.isPaused = false;
    state.lastSpeechTimestamp = Date.now();

    // 1. Update UI Elements
    const btnBig = document.getElementById('btnBigRecord');
    if (btnBig) {
      btnBig.classList.add('recording');
      const icon = document.getElementById('recordBtnIcon');
      if (icon) icon.textContent = '⏹️';
    }

    const dot = document.getElementById('pulseDot');
    if (dot) dot.className = 'pulse-dot recording';

    const liveDot = document.getElementById('liveStatusDot');
    if (liveDot) liveDot.style.background = '#10b981';

    const statusLabel = document.getElementById('recordStatusLabel');
    if (statusLabel) statusLabel.textContent = '🔴 Grabando en vivo... Toca para detener';

    // Toggle control buttons
    const btnStartDirect = document.getElementById('btnStartDirect');
    const btnPauseAudio = document.getElementById('btnPauseAudio');
    const btnStopAudio = document.getElementById('btnStopAudio');

    if (btnStartDirect) btnStartDirect.style.display = 'none';
    if (btnPauseAudio) {
      btnPauseAudio.style.display = 'inline-flex';
      btnPauseAudio.textContent = '⏸️ Pausar';
    }
    if (btnStopAudio) btnStopAudio.style.display = 'inline-flex';

    // 2. Start timer
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      state.elapsedSeconds++;
      const timeStr = formatTimer(state.elapsedSeconds);
      const topTimer = document.getElementById('sessionTimer');
      if (topTimer) topTimer.textContent = timeStr;
      const bigTimer = document.getElementById('recordTimeLarge');
      if (bigTimer) bigTimer.textContent = timeStr;
    }, 1000);

    // 3. Visualizer pulse
    if (state.visualizerInterval) clearInterval(state.visualizerInterval);
    state.visualizerInterval = setInterval(() => {
      if (state.isRecording && !state.isPaused) {
        animateWavebars(true);
      }
    }, 200);

    // 4. Start Speech Recognition
    if (state.speechEngine) {
      try { state.speechEngine.start(); } catch (e) {}
    }

    showToast('🎙️ Grabación en vivo iniciada', 'success');
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
      animateWavebars(false);
      if (pauseBtn) pauseBtn.textContent = '▶️ Reanudar';
      if (dot) dot.className = 'pulse-dot paused';
      if (liveDot) liveDot.style.background = '#f59e0b';
      if (statusLabel) statusLabel.textContent = 'Sesión en pausa';
      showToast('Grabación en pausa', 'warning');
    } else {
      if (state.speechEngine) {
        try { state.speechEngine.start(); } catch (e) {}
      }
      state.lastSpeechTimestamp = Date.now();
      if (pauseBtn) pauseBtn.textContent = '⏸️ Pausar';
      if (dot) dot.className = 'pulse-dot recording';
      if (liveDot) liveDot.style.background = '#10b981';
      if (statusLabel) statusLabel.textContent = '🔴 Grabando en vivo...';
      showToast('Grabación reanudada', 'info');
    }
  }

  function stopRecording() {
    haptic(25);
    state.isRecording = false;
    state.isPaused = false;

    // Clear all intervals
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    if (state.silenceTimer) {
      clearInterval(state.silenceTimer);
      state.silenceTimer = null;
    }
    if (state.visualizerInterval) {
      clearInterval(state.visualizerInterval);
      state.visualizerInterval = null;
    }

    // Stop speech engine
    if (state.speechEngine) {
      try { state.speechEngine.stop(); } catch (e) {}
    }

    animateWavebars(false);

    // Reset UI to idle state
    const btnBig = document.getElementById('btnBigRecord');
    if (btnBig) {
      btnBig.classList.remove('recording');
      const icon = document.getElementById('recordBtnIcon');
      if (icon) icon.textContent = '🎙️';
    }

    const dot = document.getElementById('pulseDot');
    if (dot) dot.className = 'pulse-dot';

    const liveDot = document.getElementById('liveStatusDot');
    if (liveDot) liveDot.style.background = '#64748b';

    const statusLabel = document.getElementById('recordStatusLabel');
    if (statusLabel) statusLabel.textContent = 'Toca el botón para Iniciar Grabación';

    const btnStartDirect = document.getElementById('btnStartDirect');
    const btnPauseAudio = document.getElementById('btnPauseAudio');
    const btnStopAudio = document.getElementById('btnStopAudio');

    if (btnStartDirect) btnStartDirect.style.display = 'inline-flex';
    if (btnPauseAudio) btnPauseAudio.style.display = 'none';
    if (btnStopAudio) btnStopAudio.style.display = 'none';

    saveSessionData();
  }

  function toggleRecord() {
    if (!state.isRecording) {
      startRecording();
    } else {
      stopAndPromptSave();
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

  function addLiveTranscriptSnippet(text) {
    const list = document.getElementById('recentLiveTranscriptList');
    if (!list) return;

    const item = document.createElement('div');
    item.className = 'live-history-pill';
    item.innerHTML = `<strong style="color:var(--accent-indigo); font-family:var(--font-mono); font-size:10px;">[${getCurrentTimeString()}]</strong> ${escapeHtml(text)}`;
    list.prepend(item);

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

  // --- SAVE SESSION MODAL ---
  function openSaveSessionModal() {
    haptic(25);
    const modal = document.getElementById('modalSaveSession');
    const inputTitle = document.getElementById('saveModalSessionTitle');
    const durBadge = document.getElementById('saveModalDuration');
    const txBadge = document.getElementById('saveModalTranscripts');
    const photoBadge = document.getElementById('saveModalPhotos');

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
    showToast(`💾 Sesión "${state.title}" guardada con éxito`, 'success');
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
        appendChatBubble(`Entendido sobre "${text}". Tengo registradas ${state.transcripts.length} frases y ${state.photos.length} fotos de Teams. Para que pueda responderte con análisis profundo en vivo, agrega tu clave gratuita de Gemini en el botón ⚙️ Ajustes arriba a la derecha. También puedes ir a la pestaña "Claude" y copiar el prompt completo para preguntárselo a Claude.`, 'ai');
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

  function refreshTimelineDisplay() {
    const container = document.getElementById('timelineContainer');
    const emptyNotice = document.getElementById('timelineEmptyNotice');
    if (!container) return;

    if (state.transcripts.length === 0 && state.photos.length === 0) {
      container.innerHTML = '<div id="timelineEmptyNotice" style="text-align: center; padding: 40px 20px; color: var(--text-dim); font-size: 13px;">No hay transcripciones todavía.<br/>Inicia la grabación en la pestaña "Grabar" para ver la transcripción aquí.</div>';
      return;
    }

    container.innerHTML = '';
    state.transcripts.forEach(t => renderTimelineBubble(t, 'speech'));
    state.photos.forEach(p => renderTimelineBubble(p, 'photo'));
    updateBadges();
    updateLiveWordCount(0);
  }

  // --- REFINAMIENTO DE TRANSCRIPCIÓN CON IA & OCR ---
  async function refineTranscriptWithAI() {
    haptic(30);
    if (state.transcripts.length === 0) {
      showToast('No hay transcripción grabada aún para refinar', 'warning');
      return;
    }

    const key = state.geminiKey || localStorage.getItem('sessionflow_gemini_key');
    if (!key) {
      let count = 0;
      state.transcripts.forEach(t => {
        const norm = normalizeTechnicalTerms(t.text);
        if (norm !== t.text) {
          t.text = norm;
          count++;
        }
      });
      refreshTimelineDisplay();
      saveSessionData();
      showToast(`✨ Normalización aplicada (${count} correcciones). Para refinamiento profundo con IA, agrega tu API Key en Ajustes ⚙️.`, 'info');
      return;
    }

    showToast('✨ Refinando transcripción y corrigiendo siglas con IA...', 'info');

    const ocrContext = state.photos.map((p, i) => `[Pantalla #${i+1}]: ${p.ocrText}`).join('\n');
    const vocabList = (state.customVocabulary || []).join(', ');
    const rawTranscripts = state.transcripts.map((t, idx) => `[ID:${idx}] ${t.speaker}: ${t.text}`).join('\n');

    const prompt = `Eres un experto en Lingüística y Corrección de Transcripciones de Sistemas Empresariales.
Analiza la siguiente transcripción de una reunión de trabajo generada por voz, la cual tiene errores fonéticos y de reconocimiento acústico en siglas técnicas, sistemas y nombres de aplicaciones.

=== VOCABULARIO TÉCNICO Y NOMENCLATURAS CLAVE ===
${vocabList}

=== TEXTO EXTRAÍDO DE LAS PANTALLAS DE LA REUNIÓN (OCR DE TEAMS/SOFTWARE) ===
${ocrContext || '(Sin fotos registradas)'}

=== TRANSCRIPCIÓN EN BRUTO DE LA REUNIÓN ===
${rawTranscripts}

INSTRUCCIONES CRÍTICAS:
1. Reemplaza cualquier error fonético o mala interpretación acústica (ej: "saad pi", "happy", "sa pi" -> "SAPI"; "ere mi", "armi" -> "RMI"; "ge me o" -> "GMO"; "ese a pe" -> "SAP"; "a pe i" -> "API"; "ese cu ele" -> "SQL"; etc.).
2. Cruza con el texto de las pantallas (OCR) para identificar nombres reales de módulos, botones y rutas que se hayan pronunciado en la sesión.
3. NO resumas, NO inventes y NO elimines el contenido ni los turnos de palabra del usuario. Mantén el orden exacto.
4. Devuelve ÚNICAMENTE un arreglo JSON con las frases corregidas con este formato exacto:
[
  { "id": 0, "speaker": "Participante", "text": "texto corregido aquí con siglas correctas..." }
]`;

    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const refinedItems = JSON.parse(jsonMatch[0]);
          refinedItems.forEach(item => {
            if (typeof item.id === 'number' && state.transcripts[item.id]) {
              state.transcripts[item.id].text = normalizeTechnicalTerms(item.text);
              if (item.speaker) state.transcripts[item.id].speaker = item.speaker;
            }
          });

          refreshTimelineDisplay();
          saveSessionData();
          showToast('✨ ¡Transcripción refinada y siglas corregidas!', 'success');
          return;
        }
      }
    } catch (e) {
      console.warn('AI Refine error:', e);
    }

    // Fallback local normalization
    state.transcripts.forEach(t => {
      t.text = normalizeTechnicalTerms(t.text);
    });
    refreshTimelineDisplay();
    saveSessionData();
    showToast('✨ Normalización fonética completada', 'success');
  }

  // --- VOCABULARY MANAGEMENT ---
  function renderVocabChips() {
    const container = document.getElementById('vocabChipsContainer');
    if (!container) return;

    if (!Array.isArray(state.customVocabulary) || state.customVocabulary.length === 0) {
      container.innerHTML = '<span style="font-size:11px; color:var(--text-dim); font-style:italic;">No hay siglas guardadas.</span>';
      return;
    }

    container.innerHTML = state.customVocabulary.map(term => `
      <span class="vocab-chip">
        <span>${escapeHtml(term)}</span>
        <span class="chip-remove" onclick="window.app.removeCustomVocabTerm('${escapeHtml(term)}')" title="Eliminar">✕</span>
      </span>
    `).join('');
  }

  function addCustomVocabTerm(term) {
    if (!term || typeof term !== 'string') return;
    const clean = term.trim().toUpperCase();
    if (!clean) return;

    if (!state.customVocabulary.includes(clean)) {
      state.customVocabulary.push(clean);
      localStorage.setItem('sessionflow_custom_vocabulary', JSON.stringify(state.customVocabulary));
      renderVocabChips();
      showToast(`Sigla "${clean}" agregada al diccionario`, 'success');
    }
  }

  function removeCustomVocabTerm(term) {
    state.customVocabulary = state.customVocabulary.filter(t => t !== term);
    localStorage.setItem('sessionflow_custom_vocabulary', JSON.stringify(state.customVocabulary));
    renderVocabChips();
    showToast(`"${term}" eliminada`, 'info');
  }

  function resetVocabToDefaults() {
    state.customVocabulary = [...DEFAULT_VOCABULARY];
    localStorage.setItem('sessionflow_custom_vocabulary', JSON.stringify(state.customVocabulary));
    renderVocabChips();
    showToast('Vocabulario restaurado por defecto', 'info');
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
    renderVocabChips();
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
      if (streamText) streamText.textContent = 'Presiona Iniciar Grabación y habla; el texto irá apareciendo aquí en tiempo real...';

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
    refineTranscriptWithAI,
    addCustomVocabTerm,
    removeCustomVocabTerm,
    resetVocabToDefaults,
    handleVocabSubmit: (e) => {
      e.preventDefault();
      const input = document.getElementById('inputNewVocabTerm');
      if (input && input.value.trim()) {
        addCustomVocabTerm(input.value.trim());
        input.value = '';
      }
    },
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
        const text = normalizeTechnicalTerms(input.value.trim());
        addTranscriptItem(text, 'Nota Manual');
        addLiveTranscriptSnippet(text);
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
  console.log('SessionFlow AI v2.8 Precision Phonetic & Lexicon Ready.');

})();

