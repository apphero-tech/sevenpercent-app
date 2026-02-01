import * as faceapi from 'face-api.js';

export type Emotion = 'happy' | 'sad' | 'angry' | 'fearful' | 'neutral' | 'surprised' | 'disgusted';

export interface EmotionResult {
  dominant: Emotion;
  confidence: number;
  all: Record<Emotion, number>;
  timestamp: number;
}

export interface FaceEmotionConfig {
  modelsPath?: string;
  detectionInterval?: number;
  minConfidence?: number;
}

const EMOTION_MAPPING: Record<string, Emotion> = {
  happy: 'happy',
  sad: 'sad',
  angry: 'angry',
  fearful: 'fearful',
  neutral: 'neutral',
  surprised: 'surprised',
  disgusted: 'disgusted',
};

// Map to the 4 primary emotions the user requested
export const PRIMARY_EMOTIONS = ['happy', 'sad', 'angry', 'fearful'] as const;
export type PrimaryEmotion = typeof PRIMARY_EMOTIONS[number];

export function mapToPrimaryEmotion(emotion: Emotion): PrimaryEmotion {
  if (PRIMARY_EMOTIONS.includes(emotion as PrimaryEmotion)) {
    return emotion as PrimaryEmotion;
  }
  // Map secondary emotions to primary ones
  switch (emotion) {
    case 'surprised':
      return 'fearful'; // Surprise often related to fear
    case 'disgusted':
      return 'angry'; // Disgust often related to anger
    case 'neutral':
    default:
      return 'happy'; // Default to happy for neutral
  }
}

export class FaceEmotionService {
  private isInitialized = false;
  private isDetecting = false;
  private videoElement: HTMLVideoElement | null = null;
  private detectionInterval: number | null = null;
  private config: Required<FaceEmotionConfig>;
  private onEmotionCallback: ((result: EmotionResult) => void) | null = null;

  constructor(config: FaceEmotionConfig = {}) {
    this.config = {
      modelsPath: config.modelsPath || '/models',
      detectionInterval: config.detectionInterval || 500, // 500ms between detections
      minConfidence: config.minConfidence || 0.5,
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load face-api.js models
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(this.config.modelsPath),
        faceapi.nets.faceExpressionNet.loadFromUri(this.config.modelsPath),
      ]);

      this.isInitialized = true;
      console.log('[FaceEmotionService] Models loaded successfully');
    } catch (error) {
      console.error('[FaceEmotionService] Failed to load models:', error);
      throw new Error('Failed to initialize face emotion detection. Please check that models are available.');
    }
  }

  setVideoElement(video: HTMLVideoElement): void {
    this.videoElement = video;
  }

  onEmotion(callback: (result: EmotionResult) => void): void {
    this.onEmotionCallback = callback;
  }

  async startDetection(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.videoElement) {
      throw new Error('Video element not set. Call setVideoElement() first.');
    }

    if (this.isDetecting) return;

    this.isDetecting = true;
    this.runDetectionLoop();
    console.log('[FaceEmotionService] Detection started');
  }

  stopDetection(): void {
    this.isDetecting = false;
    if (this.detectionInterval) {
      clearTimeout(this.detectionInterval);
      this.detectionInterval = null;
    }
    console.log('[FaceEmotionService] Detection stopped');
  }

  private async runDetectionLoop(): Promise<void> {
    if (!this.isDetecting || !this.videoElement) return;

    try {
      const detection = await faceapi
        .detectSingleFace(this.videoElement, new faceapi.TinyFaceDetectorOptions())
        .withFaceExpressions();

      if (detection && detection.expressions) {
        const result = this.processExpressions(detection.expressions);
        if (result.confidence >= this.config.minConfidence && this.onEmotionCallback) {
          this.onEmotionCallback(result);
        }
      }
    } catch (error) {
      console.error('[FaceEmotionService] Detection error:', error);
    }

    // Schedule next detection
    this.detectionInterval = window.setTimeout(
      () => this.runDetectionLoop(),
      this.config.detectionInterval
    );
  }

  private processExpressions(expressions: faceapi.FaceExpressions): EmotionResult {
    const emotionScores: Record<Emotion, number> = {
      happy: expressions.happy,
      sad: expressions.sad,
      angry: expressions.angry,
      fearful: expressions.fearful,
      neutral: expressions.neutral,
      surprised: expressions.surprised,
      disgusted: expressions.disgusted,
    };

    // Find dominant emotion
    let dominant: Emotion = 'neutral';
    let maxScore = 0;

    for (const [emotion, score] of Object.entries(emotionScores)) {
      if (score > maxScore) {
        maxScore = score;
        dominant = emotion as Emotion;
      }
    }

    return {
      dominant,
      confidence: maxScore,
      all: emotionScores,
      timestamp: Date.now(),
    };
  }

  getStatus(): { initialized: boolean; detecting: boolean } {
    return {
      initialized: this.isInitialized,
      detecting: this.isDetecting,
    };
  }

  dispose(): void {
    this.stopDetection();
    this.videoElement = null;
    this.onEmotionCallback = null;
  }
}

// Singleton instance for global use
let serviceInstance: FaceEmotionService | null = null;

export function getFaceEmotionService(config?: FaceEmotionConfig): FaceEmotionService {
  if (!serviceInstance) {
    serviceInstance = new FaceEmotionService(config);
  }
  return serviceInstance;
}
