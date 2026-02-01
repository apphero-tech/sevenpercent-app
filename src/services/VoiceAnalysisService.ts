export type VoiceEmotion = 'happy' | 'sad' | 'angry' | 'fearful' | 'neutral';

export interface VoiceMetrics {
  pitch: number;
  pitchVariation: number;
  volume: number;
  volumeVariation: number;
  speechRate: number;
  energy: number;
}

export interface VoiceEmotionResult {
  emotion: VoiceEmotion;
  confidence: number;
  metrics: VoiceMetrics;
  timestamp: number;
}

export interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  timestamp: number;
}

export interface VoiceAnalysisConfig {
  sampleRate?: number;
  fftSize?: number;
  language?: string;
}

export class VoiceAnalysisService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private recognition: SpeechRecognition | null = null;

  private isListening = false;
  private isTranscribing = false;
  private analysisInterval: number | null = null;

  private config: Required<VoiceAnalysisConfig>;

  private onVoiceEmotionCallback: ((result: VoiceEmotionResult) => void) | null = null;
  private onTranscriptionCallback: ((result: TranscriptionResult) => void) | null = null;

  private pitchHistory: number[] = [];
  private volumeHistory: number[] = [];

  constructor(config: VoiceAnalysisConfig = {}) {
    this.config = {
      sampleRate: config.sampleRate || 44100,
      fftSize: config.fftSize || 2048,
      language: config.language || navigator.language || 'en-US',
    };
  }

  async initialize(stream: MediaStream): Promise<void> {
    // Setup Web Audio API for voice emotion analysis
    this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.config.fftSize;

    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
    this.mediaStreamSource.connect(this.analyser);

    // Setup Web Speech API for transcription
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.config.language;

      this.setupRecognitionHandlers();
      console.log('[VoiceAnalysis] Speech recognition ready, language:', this.config.language);
    } else {
      console.warn('[VoiceAnalysis] Speech Recognition not supported');
    }

    console.log('[VoiceAnalysis] Initialized');
  }

  private setupRecognitionHandlers(): void {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      console.log('[VoiceAnalysis] 🎤 Speech recognition STARTED - speak now!');
    };

    this.recognition.onaudiostart = () => {
      console.log('[VoiceAnalysis] 🔊 Audio capture started');
    };

    this.recognition.onsoundstart = () => {
      console.log('[VoiceAnalysis] 🔉 Sound detected');
    };

    this.recognition.onspeechstart = () => {
      console.log('[VoiceAnalysis] 🗣️ Speech detected');
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript;
      const confidence = lastResult[0].confidence || 0.9;
      const isFinal = lastResult.isFinal;

      console.log('[VoiceAnalysis] 📝 Transcript:', transcript, 'Final:', isFinal);

      this.onTranscriptionCallback?.({
        text: transcript,
        isFinal,
        confidence,
        timestamp: Date.now(),
      });
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[VoiceAnalysis] ❌ Recognition error:', event.error, event.message);
    };

    this.recognition.onend = () => {
      console.log('[VoiceAnalysis] 🛑 Speech recognition ended, isTranscribing:', this.isTranscribing);
      // Auto-restart if we should still be transcribing
      if (this.isTranscribing && this.recognition) {
        console.log('[VoiceAnalysis] 🔄 Auto-restarting recognition...');
        setTimeout(() => {
          if (this.isTranscribing) {
            try {
              this.recognition?.start();
            } catch (e) {
              console.warn('[VoiceAnalysis] Could not restart:', e);
            }
          }
        }, 100);
      }
    };
  }

  setLanguage(lang: string): void {
    this.config.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  onVoiceEmotion(callback: (result: VoiceEmotionResult) => void): void {
    this.onVoiceEmotionCallback = callback;
  }

  onTranscription(callback: (result: TranscriptionResult) => void): void {
    this.onTranscriptionCallback = callback;
  }

  startListening(): void {
    if (this.isListening) return;
    this.isListening = true;
    this.pitchHistory = [];
    this.volumeHistory = [];
    this.runAnalysisLoop();
    console.log('[VoiceAnalysis] Started emotion analysis');
  }

  startTranscription(): void {
    if (this.isTranscribing) {
      console.log('[VoiceAnalysis] Already transcribing, skipping');
      return;
    }

    if (!this.recognition) {
      console.error('[VoiceAnalysis] ❌ No recognition object! Speech API not supported?');
      return;
    }

    this.isTranscribing = true;
    console.log('[VoiceAnalysis] 🚀 Starting transcription, language:', this.config.language);

    try {
      this.recognition.start();
      console.log('[VoiceAnalysis] ✅ recognition.start() called successfully');
    } catch (e) {
      console.error('[VoiceAnalysis] ❌ Could not start recognition:', e);
      this.isTranscribing = false;
    }
  }

  stopListening(): void {
    this.isListening = false;
    if (this.analysisInterval) {
      clearTimeout(this.analysisInterval);
      this.analysisInterval = null;
    }
    console.log('[VoiceAnalysis] Stopped emotion analysis');
  }

  stopTranscription(): void {
    this.isTranscribing = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore
      }
    }
    console.log('[VoiceAnalysis] Stopped transcription');
  }

  private runAnalysisLoop(): void {
    if (!this.isListening || !this.analyser) return;

    const metrics = this.analyzeAudio();

    if (metrics.energy > 0.1) {
      this.pitchHistory.push(metrics.pitch);
      this.volumeHistory.push(metrics.volume);

      if (this.pitchHistory.length > 20) this.pitchHistory.shift();
      if (this.volumeHistory.length > 20) this.volumeHistory.shift();

      metrics.pitchVariation = this.calculateStdDev(this.pitchHistory);
      metrics.volumeVariation = this.calculateStdDev(this.volumeHistory);

      const emotion = this.detectEmotion(metrics);

      this.onVoiceEmotionCallback?.({
        ...emotion,
        metrics,
        timestamp: Date.now(),
      });
    }

    this.analysisInterval = window.setTimeout(() => this.runAnalysisLoop(), 100);
  }

  private analyzeAudio(): VoiceMetrics {
    if (!this.analyser) {
      return { pitch: 0, pitchVariation: 0, volume: 0, volumeVariation: 0, speechRate: 0, energy: 0 };
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const frequencyData = new Uint8Array(bufferLength);
    const timeData = new Uint8Array(bufferLength);

    this.analyser.getByteFrequencyData(frequencyData);
    this.analyser.getByteTimeDomainData(timeData);

    const pitch = this.detectPitch(timeData);
    const volume = this.calculateRMS(timeData);
    const energy = this.calculateEnergy(frequencyData);

    return { pitch, pitchVariation: 0, volume, volumeVariation: 0, speechRate: 0, energy };
  }

  private detectPitch(timeData: Uint8Array): number {
    const sampleRate = this.audioContext?.sampleRate || 44100;
    const floatData = new Float32Array(timeData.length);
    for (let i = 0; i < timeData.length; i++) {
      floatData[i] = (timeData[i] - 128) / 128;
    }

    let maxCorrelation = 0;
    let bestLag = 0;
    const minLag = Math.floor(sampleRate / 500);
    const maxLag = Math.floor(sampleRate / 50);

    for (let lag = minLag; lag < maxLag && lag < floatData.length / 2; lag++) {
      let correlation = 0;
      for (let i = 0; i < floatData.length - lag; i++) {
        correlation += floatData[i] * floatData[i + lag];
      }
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestLag = lag;
      }
    }

    return bestLag === 0 ? 0 : sampleRate / bestLag;
  }

  private calculateRMS(timeData: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const value = (timeData[i] - 128) / 128;
      sum += value * value;
    }
    return Math.sqrt(sum / timeData.length);
  }

  private calculateEnergy(frequencyData: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      sum += frequencyData[i];
    }
    return sum / (frequencyData.length * 255);
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  private detectEmotion(metrics: VoiceMetrics): { emotion: VoiceEmotion; confidence: number } {
    const scores: Record<VoiceEmotion, number> = {
      happy: 0, sad: 0, angry: 0, fearful: 0, neutral: 0.3,
    };

    if (metrics.pitch >= 200 && metrics.pitch <= 400) scores.happy += 0.3;
    if (metrics.pitch >= 150 && metrics.pitch <= 350 && metrics.volume > 0.7) scores.angry += 0.3;
    if (metrics.pitch >= 100 && metrics.pitch <= 200) scores.sad += 0.3;
    if (metrics.pitch >= 180 && metrics.pitch <= 350) scores.fearful += 0.2;

    if (metrics.volume > 0.7) { scores.angry += 0.2; scores.happy += 0.1; }
    else if (metrics.volume < 0.3) { scores.sad += 0.3; scores.fearful += 0.1; }

    if (metrics.pitchVariation > 40) { scores.angry += 0.2; scores.fearful += 0.2; }
    else if (metrics.pitchVariation > 25) scores.happy += 0.2;
    else if (metrics.pitchVariation < 15) { scores.sad += 0.2; scores.neutral += 0.1; }

    if (metrics.energy > 0.6) { scores.angry += 0.2; scores.happy += 0.1; }
    else if (metrics.energy < 0.3) scores.sad += 0.2;

    let maxScore = 0;
    let dominantEmotion: VoiceEmotion = 'neutral';
    for (const [emotion, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        dominantEmotion = emotion as VoiceEmotion;
      }
    }

    return { emotion: dominantEmotion, confidence: Math.min(1, maxScore) };
  }

  dispose(): void {
    this.stopListening();
    this.stopTranscription();

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.recognition = null;
    console.log('[VoiceAnalysis] Disposed');
  }
}

// Singleton
let serviceInstance: VoiceAnalysisService | null = null;

export function getVoiceAnalysisService(config?: VoiceAnalysisConfig): VoiceAnalysisService {
  if (!serviceInstance) {
    serviceInstance = new VoiceAnalysisService(config);
  }
  return serviceInstance;
}

export function resetVoiceAnalysisService(): void {
  if (serviceInstance) {
    serviceInstance.dispose();
    serviceInstance = null;
  }
}

// Types are declared in src/types/speech-recognition.d.ts
