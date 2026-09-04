// Vision Processor (OCR, Teams Chat Extractor & Diagram Interpreter)
export class VisionProcessor {
  constructor(options = {}) {
    this.onPhotoProcessed = options.onPhotoProcessed || (() => {});
    this.sessionId = options.sessionId || ('session_' + Date.now());
    this.initListeners();
  }

  initListeners() {
    // Global Ctrl+V listener
    document.addEventListener('paste', (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        let hasImage = false;
        for (const item of items) {
          if (item.type.indexOf('image') !== -1) hasImage = true;
        }
        if (!hasImage) return;
      }

      const items = (event.clipboardData || event.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          event.preventDefault();
          const blob = item.getAsFile();
          this.processImageFile(blob, 'Captura pegada (Ctrl+V)');
        }
      }
    });

    // Drag & Drop
    const dropZone = document.getElementById('pasteDropZone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-indigo-400');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-indigo-400');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-400');
        const files = e.dataTransfer.files;
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('image/')) {
            this.processImageFile(files[i], files[i].name || 'Foto arrastrada');
          }
        }
      });
    }

    // File Input
    const fileInput = document.getElementById('imageFileInput');
    const btnUpload = document.getElementById('btnUploadImage');
    if (btnUpload && fileInput) {
      btnUpload.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        for (let i = 0; i < files.length; i++) {
          this.processImageFile(files[i], files[i].name || 'Foto del celular');
        }
        fileInput.value = '';
      });
    }
  }

  async processImageFile(file, title = 'Foto de pantalla', currentTimestamp = '00:00') {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Image = e.target.result;
      await this.processBase64Image(base64Image, title, currentTimestamp);
    };
    reader.readAsDataURL(file);
  }

  async processBase64Image(base64Image, title = 'Foto de pantalla', currentTimestamp = '00:00', contextHint = '') {
    const imageId = 'img_' + Date.now() + '_' + Math.random().toString(36).substring(7);

    const imageItem = {
      id: imageId,
      sessionId: this.sessionId,
      timestamp: currentTimestamp,
      title: title,
      imageBase64: base64Image,
      ocrText: 'Procesando OCR y visión por IA...',
      interpretation: 'Analizando contenido y diagramas...',
      detectedType: 'screen_photo',
      structuredElements: [],
      isProcessing: true,
      createdAt: new Date().toISOString()
    };

    this.onPhotoProcessed(imageItem);

    // Try backend proxy first, fallback to direct Gemini client API
    let processed = false;
    try {
      const resp = await fetch('/api/vision-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64Image,
          timestamp: currentTimestamp,
          context_hint: contextHint
        })
      });

      if (resp.ok) {
        const result = await resp.json();
        const d = result.data || {};
        imageItem.ocrText = d.full_ocr_text || 'No se detectó texto legible.';
        imageItem.interpretation = d.process_interpretation || d.title_summary || 'Imagen analizada.';
        imageItem.detectedType = d.detected_type || 'screen_photo';
        imageItem.structuredElements = d.structured_elements || [];
        if (d.title_summary) imageItem.title = d.title_summary;
        processed = true;
      }
    } catch (e) {
      // Backend not available (static host like Vercel)
    }

    // Direct Client-Side Gemini REST API Fallback
    if (!processed) {
      const apiKey = localStorage.getItem('gemini_api_key') || '';
      if (apiKey) {
        try {
          const cleanB64 = base64Image.includes('base64,') ? base64Image.split('base64,')[1] : base64Image;
          const mime = base64Image.includes('data:') ? base64Image.split(';')[0].replace('data:', '') : 'image/jpeg';

          const prompt = `Analiza con máxima precisión esta imagen capturada en el minuto ${currentTimestamp}. Extrae TODO el texto (OCR), explica qué flujo o conversación de Teams muestra en español claro. Responde en JSON con: full_ocr_text, process_interpretation, title_summary, detected_type.`;
          
          const gResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
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

          if (gResp.ok) {
            const gData = await gResp.json();
            const textResp = gData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            try {
              let clean = textResp.replace(/```json/g, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(clean);
              imageItem.ocrText = parsed.full_ocr_text || textResp;
              imageItem.interpretation = parsed.process_interpretation || parsed.title_summary || 'Foto analizada por Gemini.';
              if (parsed.title_summary) imageItem.title = parsed.title_summary;
              if (parsed.detected_type) imageItem.detectedType = parsed.detected_type;
            } catch (je) {
              imageItem.ocrText = textResp;
              imageItem.interpretation = 'Texto extraído correctamente.';
            }
          }
        } catch (clientErr) {
          console.warn('Error en llamada directa a Gemini:', clientErr);
          imageItem.ocrText = 'Foto guardada. Ingresa tu API Key de Gemini en Ajustes (⚙️) para OCR automático.';
          imageItem.interpretation = 'Captura disponible para exportar a Claude.';
        }
      } else {
        imageItem.ocrText = 'Foto guardada. Configura tu API Key de Gemini en Ajustes (⚙️) para activar OCR automático.';
        imageItem.interpretation = 'Captura lista para exportar a Claude o procesar.';
      }
    }

    imageItem.isProcessing = false;
    this.onPhotoProcessed(imageItem);
    return imageItem;
  }
}
