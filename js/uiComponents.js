// UI Components, Modals & Toast Manager
export class UIComponents {
  constructor() {
    this.toastContainer = document.getElementById('toastContainer');
    this.imageDetailModal = document.getElementById('imageDetailModal');
    this.settingsModal = document.getElementById('settingsModal');
    this.historyModal = document.getElementById('historyModal');
    this.silenceAlertModal = document.getElementById('silenceAlertModal');
    
    this.initModalListeners();
  }

  showToast(message, type = 'info') {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    const colors = {
      success: 'bg-emerald-600 text-white border-emerald-500',
      error: 'bg-rose-600 text-white border-rose-500',
      warning: 'bg-amber-600 text-white border-amber-500',
      info: 'bg-indigo-600 text-white border-indigo-500'
    };
    const icons = {
      success: 'check-circle',
      error: 'alert-circle',
      warning: 'alert-triangle',
      info: 'info'
    };

    toast.className = `flex items-center space-x-2 px-4 py-3 rounded-xl border shadow-xl text-xs font-medium animate-fade-in pointer-events-auto ${colors[type] || colors.info}`;
    toast.innerHTML = `
      <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4"></i>
      <span>${message}</span>
    `;

    this.toastContainer.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  initModalListeners() {
    // Settings modal triggers
    const btnOpenSettings = document.getElementById('btnOpenSettings');
    const btnCloseSettings = document.getElementById('btnCloseSettingsModal');
    if (btnOpenSettings && this.settingsModal) {
      btnOpenSettings.addEventListener('click', () => this.settingsModal.classList.remove('hidden'));
    }
    if (btnCloseSettings && this.settingsModal) {
      btnCloseSettings.addEventListener('click', () => this.settingsModal.classList.add('hidden'));
    }

    // Image detail modal close
    const btnCloseImageModal = document.getElementById('btnCloseImageModal');
    if (btnCloseImageModal && this.imageDetailModal) {
      btnCloseImageModal.addEventListener('click', () => this.imageDetailModal.classList.add('hidden'));
    }

    // History modal
    const btnOpenHistory = document.getElementById('btnOpenHistory');
    const btnCloseHistory = document.getElementById('btnCloseHistoryModal');
    if (btnOpenHistory && this.historyModal) {
      btnOpenHistory.addEventListener('click', () => this.historyModal.classList.remove('hidden'));
    }
    if (btnCloseHistory && this.historyModal) {
      btnCloseHistory.addEventListener('click', () => this.historyModal.classList.add('hidden'));
    }

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.settingsModal) this.settingsModal.classList.add('hidden');
        if (this.imageDetailModal) this.imageDetailModal.classList.add('hidden');
        if (this.historyModal) this.historyModal.classList.add('hidden');
        if (this.silenceAlertModal) this.silenceAlertModal.classList.add('hidden');
        const cameraModal = document.getElementById('cameraCaptureModal');
        if (cameraModal) cameraModal.classList.add('hidden');
      }
    });
  }

  openImageDetail(imageItem) {
    if (!this.imageDetailModal) return;
    const imgEl = document.getElementById('imageModalImg');
    const titleEl = document.getElementById('imageModalTitle');
    const timeEl = document.getElementById('imageModalTimestamp');
    const interpEl = document.getElementById('imageModalInterpretation');
    const ocrEl = document.getElementById('imageModalOcrText');

    if (imgEl) imgEl.src = imageItem.imageBase64;
    if (titleEl) titleEl.textContent = imageItem.title || 'Detalle de Captura';
    if (timeEl) timeEl.textContent = `Capturada en el minuto [${imageItem.timestamp || '00:00'}]`;
    if (interpEl) interpEl.textContent = imageItem.interpretation || 'Sin interpretación.';
    if (ocrEl) ocrEl.value = imageItem.ocrText || 'Sin texto extraído.';

    this.imageDetailModal.classList.remove('hidden');
  }

  renderTimelineTranscriptItem(item) {
    const div = document.createElement('div');
    div.className = 'relative group animate-fade-in pl-2';
    div.dataset.type = 'transcript';
    div.dataset.id = item.id || '';

    div.innerHTML = `
      <div class="timeline-dot w-4 h-4 rounded-full bg-slate-900 border-2 border-indigo-500 flex items-center justify-center -left-[33px] absolute top-1.5 shadow">
        <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
      </div>
      <div class="bg-surface-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3.5 shadow-sm space-y-1 transition">
        <div class="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/60 pb-1.5">
          <div class="flex items-center space-x-1.5">
            <span class="font-bold text-indigo-300 font-mono">[${item.timestamp || '00:00'}]</span>
            <span class="font-semibold text-slate-300">${item.speaker || 'Reunión'}</span>
          </div>
          <span class="text-[10px] text-slate-500">Audio transcrito</span>
        </div>
        <p class="text-xs text-slate-200 leading-relaxed pt-1">${this.escapeHtml(item.text)}</p>
      </div>
    `;

    return div;
  }

  renderTimelineImageItem(item, onInspect) {
    const div = document.createElement('div');
    div.className = 'relative group animate-fade-in pl-2';
    div.dataset.type = 'image';
    div.dataset.id = item.id;

    div.innerHTML = `
      <div class="timeline-dot w-4 h-4 rounded-full bg-slate-900 border-2 border-emerald-500 flex items-center justify-center -left-[33px] absolute top-1.5 shadow">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
      </div>
      <div class="bg-surface-900 border border-emerald-900/40 hover:border-emerald-500/60 rounded-2xl p-4 shadow-md space-y-3 transition">
        <div class="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/60 pb-2">
          <div class="flex items-center space-x-2">
            <span class="font-bold text-emerald-400 font-mono">[${item.timestamp || '00:00'}]</span>
            <span class="font-bold text-slate-200 flex items-center space-x-1">
              <i data-lucide="image" class="w-3.5 h-3.5 text-emerald-400"></i>
              <span>${item.title || 'Foto de Pantalla / Teams'}</span>
            </span>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
            ${item.detectedType || 'OCR Pantalla'}
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
          <div class="sm:col-span-1 rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video flex items-center justify-center cursor-pointer group-hover:opacity-95 transition">
            <img src="${item.imageBase64}" alt="Foto" class="w-full h-full object-cover" />
          </div>
          <div class="sm:col-span-3 space-y-1.5">
            <p class="text-xs text-indigo-200 font-medium leading-relaxed">${item.interpretation || 'Procesando visión...'}</p>
            <div class="flex items-center space-x-2 pt-1">
              <button class="btn-inspect-ocr text-[11px] px-2.5 py-1 rounded-lg bg-surface-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center space-x-1">
                <i data-lucide="file-search" class="w-3 h-3 text-emerald-400"></i>
                <span>Ver Texto Extraído (OCR)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const btnInspect = div.querySelector('.btn-inspect-ocr');
    const imgThumb = div.querySelector('img');
    if (btnInspect) btnInspect.addEventListener('click', () => onInspect(item));
    if (imgThumb) imgThumb.addEventListener('click', () => onInspect(item));

    return div;
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
