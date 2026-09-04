// Process Analyzer & Mermaid Diagram Generator
export class ProcessAnalyzer {
  constructor(options = {}) {
    this.onAnalysisComplete = options.onAnalysisComplete || (() => {});
    this.sessionId = options.sessionId || ('session_' + Date.now());
    this.currentAnalysis = null;
    this.initMermaid();
  }

  initMermaid() {
    if (window.mermaid) {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#4f46e5',
          primaryTextColor: '#ffffff',
          primaryBorderColor: '#6366f1',
          lineColor: '#38bdf8',
          secondaryColor: '#1e293b',
          tertiaryColor: '#0f172a'
        },
        flowchart: {
          curve: 'basis',
          htmlLabels: true
        }
      });
    }
  }

  async analyze(sessionTitle, transcriptItems, ocrItems, customInstructions = '') {
    const fullTranscriptText = transcriptItems.map(item => `[${item.timestamp}] ${item.speaker || 'Voz'}: ${item.text}`).join('\n');

    const ocrFormatted = ocrItems.map(img => ({
      timestamp: img.timestamp,
      title: img.title,
      type: img.detectedType,
      ocr_text: img.ocrText,
      interpretation: img.interpretation
    }));

    let analysisData = null;

    // Try backend proxy
    try {
      const resp = await fetch('/api/analyze-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_title: sessionTitle || 'Sesión de Trabajo',
          transcript_text: fullTranscriptText || '(Sin transcripción grabada aún)',
          transcript_items: transcriptItems,
          ocr_items: ocrFormatted,
          custom_instructions: customInstructions
        })
      });

      if (resp.ok) {
        const result = await resp.json();
        analysisData = {
          sessionId: this.sessionId,
          ...result.data,
          updatedAt: new Date().toISOString()
        };
      }
    } catch (e) {
      // Backend not available (static host)
    }

    // Direct Gemini client fallback if backend not available
    if (!analysisData) {
      const apiKey = localStorage.getItem('gemini_api_key') || '';
      if (!apiKey) {
        throw new Error('Ingresa tu Gemini API Key en Ajustes (⚙️) para generar el análisis.');
      }

      const prompt = `Actúa como Consultor Senior de Procesos. Analiza esta reunión y fotos y devuelve un JSON estrictamente válido con:
{
  "executive_summary": "Resumen ejecutivo del proceso",
  "workflow_diagram_mermaid": "graph TD\n  A[Inicio] --> B[Paso 1]\n  B --> C[Fin]",
  "process_steps": [
    { "step_number": 1, "name": "Paso 1", "description": "Descripción", "actors": ["Encargado"], "tools_or_systems": ["Teams/SAP"], "inputs": ["Datos"], "outputs": ["Resultado"], "tips_and_pitfalls": "Tip" }
  ],
  "glossary": [ { "term": "Término", "definition": "Significado" } ],
  "key_decisions": ["Decisión 1"],
  "action_items": [ { "task": "Tarea", "responsible": "Nombre", "priority": "Alta" } ],
  "master_learning_guide": "Manual didáctico completo en markdown"
}

Reunión: ${sessionTitle}
Transcripción:
${fullTranscriptText}

Fotos/OCR:
${JSON.stringify(ocrFormatted)}
`;

      const gResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!gResp.ok) {
        const errJson = await gResp.json();
        throw new Error('Error en Gemini: ' + (errJson.error?.message || gResp.statusText));
      }

      const gData = await gResp.json();
      const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      try {
        const parsed = JSON.parse(clean);
        analysisData = { sessionId: this.sessionId, ...parsed, updatedAt: new Date().toISOString() };
      } catch (parseErr) {
        analysisData = {
          sessionId: this.sessionId,
          executive_summary: 'Análisis generado',
          master_learning_guide: rawText,
          workflow_diagram_mermaid: 'graph TD\n  A[Reunión] --> B[Proceso]',
          process_steps: [],
          glossary: [],
          key_decisions: [],
          action_items: []
        };
      }
    }

    this.currentAnalysis = analysisData;
    await this.renderAnalysis(analysisData);
    this.onAnalysisComplete(analysisData);

    if (window.confetti) {
      window.confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }

    return analysisData;
  }

  async renderAnalysis(data) {
    if (!data) return;

    // 1. Executive Summary
    const summaryEl = document.getElementById('processExecutiveSummary');
    if (summaryEl && data.executive_summary) {
      summaryEl.textContent = data.executive_summary;
    }

    // 2. Render Mermaid Flowchart
    const mermaidBox = document.getElementById('mermaidRenderBox');
    if (mermaidBox && data.workflow_diagram_mermaid && window.mermaid) {
      try {
        const id = 'mermaid_flow_' + Date.now();
        const { svg } = await window.mermaid.render(id, data.workflow_diagram_mermaid);
        mermaidBox.innerHTML = svg;
      } catch (merr) {
        mermaidBox.innerHTML = `<pre class="text-xs text-indigo-300 font-mono p-4 bg-slate-900 rounded-xl overflow-x-auto">${data.workflow_diagram_mermaid}</pre>`;
      }
    }

    // 3. Process Steps List
    const stepsListEl = document.getElementById('processStepsList');
    if (stepsListEl && Array.isArray(data.process_steps) && data.process_steps.length > 0) {
      stepsListEl.innerHTML = data.process_steps.map((step, idx) => `
        <div class="bg-surface-900 border border-slate-800 rounded-2xl p-4 shadow space-y-2 hover:border-slate-700 transition">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <div class="flex items-center space-x-2">
              <span class="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">${step.step_number || idx + 1}</span>
              <h4 class="text-sm font-bold text-slate-100">${step.name || ('Paso ' + (idx + 1))}</h4>
            </div>
            ${step.actors ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-900">${Array.isArray(step.actors) ? step.actors.join(', ') : step.actors}</span>` : ''}
          </div>
          <p class="text-xs text-slate-300 leading-relaxed">${step.description || ''}</p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] pt-1">
            <div class="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span class="text-slate-400 font-semibold block mb-0.5">📥 Entradas / Inputs:</span>
              <span class="text-slate-200">${Array.isArray(step.inputs) ? step.inputs.join(', ') : (step.inputs || 'N/A')}</span>
            </div>
            <div class="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span class="text-slate-400 font-semibold block mb-0.5">⚙️ Herramientas:</span>
              <span class="text-sky-300">${Array.isArray(step.tools_or_systems) ? step.tools_or_systems.join(', ') : (step.tools_or_systems || 'N/A')}</span>
            </div>
            <div class="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span class="text-slate-400 font-semibold block mb-0.5">📤 Salida / Output:</span>
              <span class="text-emerald-300">${Array.isArray(step.outputs) ? step.outputs.join(', ') : (step.outputs || 'N/A')}</span>
            </div>
          </div>
          ${step.tips_and_pitfalls ? `
            <div class="mt-2 text-[11px] bg-amber-950/30 border border-amber-900/40 rounded-lg p-2 text-amber-200 flex items-start space-x-1.5">
              <span>💡</span>
              <span><strong>Consejo:</strong> ${step.tips_and_pitfalls}</span>
            </div>
          ` : ''}
        </div>
      `).join('');
    }

    // 4. Glossary
    const glossaryGridEl = document.getElementById('glossaryGrid');
    if (glossaryGridEl && Array.isArray(data.glossary) && data.glossary.length > 0) {
      glossaryGridEl.innerHTML = data.glossary.map(item => `
        <div class="bg-surface-950 border border-slate-800 rounded-xl p-3 space-y-1">
          <span class="text-xs font-bold text-sky-400 font-mono block">${item.term}</span>
          <p class="text-xs text-slate-300 leading-relaxed">${item.definition}</p>
        </div>
      `).join('');
    }

    // 5. Decisions
    const decisionsEl = document.getElementById('keyDecisionsList');
    if (decisionsEl && Array.isArray(data.key_decisions) && data.key_decisions.length > 0) {
      decisionsEl.innerHTML = data.key_decisions.map(d => `<li class="text-slate-200">${d}</li>`).join('');
    }

    // 6. Action Items
    const actionItemsEl = document.getElementById('actionItemsList');
    if (actionItemsEl && Array.isArray(data.action_items) && data.action_items.length > 0) {
      actionItemsEl.innerHTML = data.action_items.map(item => `
        <div class="flex items-center justify-between bg-surface-950 p-2.5 rounded-xl border border-slate-800 text-xs">
          <div class="flex items-center space-x-2">
            <span class="w-1.5 h-1.5 rounded-full bg-pink-400"></span>
            <span class="text-slate-200 font-medium">${item.task || item}</span>
          </div>
          ${item.responsible ? `<span class="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded">${item.responsible}</span>` : ''}
        </div>
      `).join('');
    }

    // 7. Master Learning Guide
    const guideEl = document.getElementById('masterLearningGuideContent');
    if (guideEl && data.master_learning_guide && window.marked) {
      guideEl.innerHTML = window.marked.parse(data.master_learning_guide);
    }
  }
}
