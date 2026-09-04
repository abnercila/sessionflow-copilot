// Audio Recorder & Web Speech API Manager with Smart Silence/Disconnection Watchdog
export class AudioRecorder {
  constructor(options = {}) {
    this.onTranscriptChunk = options.onTranscriptChunk || (() => {});
    this.onInterimText = options.onInterimText || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onSilenceAlert = options.onSilenceAlert || (() => {});
    this.onTimerTick = options.onTimerTick || (() => {});

    this.isRecording = false;
    this.isPaused = false;
    this.autoReconnect = true;
    
    // Web Speech API
    this.recognition = null;
    this.speechAvailable = false;
    
    // Media Stream & Audio Context (for waveform visualizer & audio buffer)
    this.mediaStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    
    // Timers & Duration tracking
    this.startTime = 0;
    this.elapsedSeconds = 0;
    this.timerInterval = null;
    this.lastSpeechTimestamp = Date.now();
    this.silenceCheckInterval = null;
    this.silenceThresholdSecs = 25; // Trigger prompt after 25s of complete silence/disconnection

    this.initSpeechRecognition();
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'es-ES'; // Spanish default
      this.speechAvailable = true;

      this.recognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript + ' ';
          } else {
            interimText += transcript;
          }
        }

        if (interimText.trim()) {
          this.onInterimText(interimText);
          this.lastSpeechTimestamp = Date.now();
        }

        if (finalText.trim()) {
          const timestamp = this.getFormattedTime();
          this.onTranscriptChunk({
            text: finalText.trim(),
            timestamp: timestamp,
            speaker: 'Reunión'
          });
          this.onInterimText('');
          this.lastSpeechTimestamp = Date.now();
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('Web Speech API error:', event.error);
        if (event.error === 'no-speech' || event.error === 'network') {
          // Normal timeout or network hiccup; handled by keep-alive
        }
      };

      this.recognition.onend = () => {
        console.log('Speech recognition ended');
        if (this.isRecording && !this.isPaused && this.autoReconnect) {
          try {
            this.recognition.start();
            console.log('Reconexión automática de Web Speech activada');
          } catch (e) {
            console.warn('Reconexión fallida:', e);
          }
        }
      };
    } else {
      console.warn('Web Speech API no disponible en este navegador. Usando fallback de grabación.');
      this.speechAvailable = false;
    }
  }

  async start(canvasElement) {
    if (this.isRecording) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.setupAudioVisualizer(this.mediaStream, canvasElement);
      this.setupMediaRecorder(this.mediaStream);

      this.isRecording = true;
      this.isPaused = false;
      this.startTime = Date.now() - (this.elapsedSeconds * 1000);
      this.lastSpeechTimestamp = Date.now();

      // Start Speech API
      if (this.recognition) {
        try {
          this.recognition.start();
        } catch (e) {
          console.warn('Error al iniciar recognition:', e);
        }
      }

      // Start MediaRecorder
      if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
        this.mediaRecorder.start(10000); // 10s chunk slices
      }

      // Start Timer
      this.startDurationTimer();
      this.startSilenceWatchdog();
      this.onStatusChange('recording');

    } catch (err) {
      console.error('Error accediendo al micrófono:', err);
      throw new Error('No se pudo acceder al micrófono. Por favor permite los permisos.');
    }
  }

  pause() {
    if (!this.isRecording || this.isPaused) return;
    this.isPaused = true;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
    clearInterval(this.timerInterval);
    clearInterval(this.silenceCheckInterval);
    this.onStatusChange('paused');
  }

  resume() {
    if (!this.isRecording || !this.isPaused) return;
    this.isPaused = false;
    this.startTime = Date.now() - (this.elapsedSeconds * 1000);
    this.lastSpeechTimestamp = Date.now();

    if (this.recognition) {
      try { this.recognition.start(); } catch (e) {}
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
    this.startDurationTimer();
    this.startSilenceWatchdog();
    this.onStatusChange('recording');
  }

  stop() {
    this.isRecording = false;
    this.isPaused = false;

    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    clearInterval(this.timerInterval);
    clearInterval(this.silenceCheckInterval);
    this.onStatusChange('idle');
    this.onInterimText('');
  }

  setupMediaRecorder(stream) {
    try {
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
          const chunkCount = this.audioChunks.length;
          const counterEl = document.getElementById('audioChunkCounter');
          if (counterEl) {
            counterEl.textContent = ${chunkCount} chunks buffer;
          }
        }
      };
    } catch (e) {
      console.warn('MediaRecorder error:', e);
    }
  }

  setupAudioVisualizer(stream, canvas) {
    if (!canvas) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 64;
    source.connect(this.analyser);

    const canvasCtx = canvas.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!this.isRecording) {
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      requestAnimationFrame(draw);

      this.analyser.getByteFrequencyData(dataArray);
      canvasCtx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 1.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        // Gradient color for bars (indigo to sky)
        const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(1, '#38bdf8');

        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  }

  startDurationTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      this.onTimerTick(this.getFormattedTime(), this.elapsedSeconds);
    }, 1000);
  }

  startSilenceWatchdog() {
    clearInterval(this.silenceCheckInterval);
    this.silenceCheckInterval = setInterval(() => {
      if (!this.isRecording || this.isPaused) return;

      const idleSecs = (Date.now() - this.lastSpeechTimestamp) / 1000;
      if (idleSecs >= this.silenceThresholdSecs) {
        console.log(Silence watchdog triggered: s of no speech/audio);
        this.onSilenceAlert();
        // Reset timestamp so it doesn\'t repeatedly trigger every second
        this.lastSpeechTimestamp = Date.now();
      }
    }, 5000);
  }

  getFormattedTime() {
    const hrs = Math.floor(this.elapsedSeconds / 3600);
    const mins = Math.floor((this.elapsedSeconds % 3600) / 60);
    const secs = this.elapsedSeconds % 60;

    const pad = (n) => String(n).padStart(2, '0');
    if (hrs > 0) {
      return ${pad(hrs)}::;
    }
    return ${pad(mins)}:;
  }

  resetSession() {
    this.stop();
    this.elapsedSeconds = 0;
    this.audioChunks = [];
    this.onTimerTick('00:00', 0);
  }
}
