import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  FaceEmotionService,
  EmotionResult,
  getFaceEmotionService,
} from '@/services/FaceEmotionService';
import {
  VoiceAnalysisService,
  VoiceEmotionResult,
  TranscriptionResult,
  getVoiceAnalysisService,
} from '@/services/VoiceAnalysisService';

export type AIProvider = 'claude' | 'openai';

// Model used: Claude Sonnet 4 - optimal for empathetic conversation
export const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  emotionContext?: {
    facial: EmotionResult | null;
    voice: VoiceEmotionResult | null;
  };
}

export interface EmotionState {
  facial: EmotionResult | null;
  voice: VoiceEmotionResult | null;
  combined: {
    emotion: string;
    confidence: number;
  } | null;
}

export interface UseMultimodalAIOptions {
  provider?: AIProvider;
  systemPrompt?: string;
  language?: string;
  onEmotionChange?: (emotion: EmotionState) => void;
  onTranscription?: (text: string, isFinal: boolean) => void;
}

export interface UseMultimodalAIReturn {
  // State
  messages: Message[];
  currentTranscript: string;
  isListening: boolean;
  isProcessing: boolean;
  emotionState: EmotionState;
  error: string | null;

  // Services status
  isCameraActive: boolean;
  isMicActive: boolean;
  isInitialized: boolean;
  isFaceDetectionActive: boolean;

  // Actions
  initialize: (videoElement: HTMLVideoElement, audioStream: MediaStream) => Promise<void>;
  startFaceDetection: () => void;
  stopFaceDetection: () => void;
  startListening: () => void;
  stopListening: () => void;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  setProvider: (provider: AIProvider) => void;
  dispose: () => void;
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function combineEmotions(
  facial: EmotionResult | null,
  voice: VoiceEmotionResult | null
): { emotion: string; confidence: number } | null {
  if (!facial && !voice) return null;

  if (!facial) {
    return voice ? { emotion: voice.emotion, confidence: voice.confidence } : null;
  }

  if (!voice) {
    return { emotion: facial.dominant, confidence: facial.confidence };
  }

  // Weight facial expression more heavily (55% vs 38% according to Mehrabian)
  const facialWeight = 0.55;
  const voiceWeight = 0.38;

  // If both agree on the emotion, boost confidence
  if (facial.dominant === voice.emotion) {
    return {
      emotion: facial.dominant,
      confidence: Math.min(1, (facial.confidence * facialWeight + voice.confidence * voiceWeight) * 1.2),
    };
  }

  // Otherwise, use the one with higher weighted confidence
  const facialScore = facial.confidence * facialWeight;
  const voiceScore = voice.confidence * voiceWeight;

  if (facialScore >= voiceScore) {
    return { emotion: facial.dominant, confidence: facialScore };
  }

  return { emotion: voice.emotion, confidence: voiceScore };
}

export function useMultimodalAI(options: UseMultimodalAIOptions = {}): UseMultimodalAIReturn {
  const {
    provider: initialProvider = 'claude',
    systemPrompt,
    // Use browser's language by default for automatic language detection
    language = typeof navigator !== 'undefined' ? navigator.language : 'en-US',
    onEmotionChange,
    onTranscription,
  } = options;

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [emotionState, setEmotionState] = useState<EmotionState>({
    facial: null,
    voice: null,
    combined: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [provider, setProviderState] = useState<AIProvider>(initialProvider);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isFaceDetectionActive, setIsFaceDetectionActive] = useState(false);

  // Service refs
  const faceServiceRef = useRef<FaceEmotionService | null>(null);
  const voiceServiceRef = useRef<VoiceAnalysisService | null>(null);

  // Latest emotion state for API calls
  const latestEmotionRef = useRef<EmotionState>(emotionState);

  useEffect(() => {
    latestEmotionRef.current = emotionState;
  }, [emotionState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispose();
    };
  }, []);

  const initialize = useCallback(
    async (videoElement: HTMLVideoElement, audioStream: MediaStream) => {
      try {
        setError(null);

        // Initialize face emotion service
        const faceService = getFaceEmotionService();
        await faceService.initialize();
        faceService.setVideoElement(videoElement);
        faceService.onEmotion((result: EmotionResult) => {
          setEmotionState((prev) => {
            const newState = {
              ...prev,
              facial: result,
              combined: combineEmotions(result, prev.voice),
            };
            onEmotionChange?.(newState);
            return newState;
          });
        });
        faceServiceRef.current = faceService;
        setIsCameraActive(true);

        // Initialize voice analysis service
        const voiceService = getVoiceAnalysisService();
        await voiceService.initialize(audioStream);
        voiceService.setLanguage(language);

        voiceService.onVoiceEmotion((result: VoiceEmotionResult) => {
          setEmotionState((prev) => {
            const newState = {
              ...prev,
              voice: result,
              combined: combineEmotions(prev.facial, result),
            };
            onEmotionChange?.(newState);
            return newState;
          });
        });

        voiceService.onTranscription((result: TranscriptionResult) => {
          setCurrentTranscript(result.text);
          onTranscription?.(result.text, result.isFinal);

          if (result.isFinal && result.text.trim()) {
            // Auto-send on final transcription
            sendMessage(result.text.trim());
            setCurrentTranscript('');
          }
        });

        voiceServiceRef.current = voiceService;
        setIsMicActive(true);

        setIsInitialized(true);
        console.log('[useMultimodalAI] Initialized successfully');

        // Auto-start face detection when camera is ready
        // This follows Mehrabian's principle: we see emotions before we hear words
        faceService.startDetection();
        setIsFaceDetectionActive(true);
        console.log('[useMultimodalAI] Face detection auto-started');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize';
        setError(message);
        console.error('[useMultimodalAI] Initialization error:', err);
        throw err;
      }
    },
    [language, onEmotionChange, onTranscription]
  );

  // Face detection controls - separate from voice listening
  const startFaceDetection = useCallback(() => {
    if (!isInitialized) {
      setError('Services not initialized. Call initialize() first.');
      return;
    }

    faceServiceRef.current?.startDetection();
    setIsFaceDetectionActive(true);
    console.log('[useMultimodalAI] Face detection started');
  }, [isInitialized]);

  const stopFaceDetection = useCallback(() => {
    faceServiceRef.current?.stopDetection();
    setIsFaceDetectionActive(false);
    console.log('[useMultimodalAI] Face detection stopped');
  }, []);

  // Voice listening controls - only for audio/transcription
  const startListening = useCallback(() => {
    if (!isInitialized) {
      setError('Services not initialized. Call initialize() first.');
      return;
    }

    // Start voice analysis and transcription (face detection is already running)
    voiceServiceRef.current?.startListening();
    voiceServiceRef.current?.startTranscription();

    setIsListening(true);
    console.log('[useMultimodalAI] Started voice listening');
  }, [isInitialized]);

  const stopListening = useCallback(() => {
    // Only stop voice analysis, keep face detection running
    voiceServiceRef.current?.stopListening();
    voiceServiceRef.current?.stopTranscription();

    setIsListening(false);
    console.log('[useMultimodalAI] Stopped voice listening (face detection continues)');
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setIsProcessing(true);
      setError(null);

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
        emotionContext: {
          facial: latestEmotionRef.current.facial,
          voice: latestEmotionRef.current.voice,
        },
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        // Prepare conversation history (last 10 messages for context)
        const conversationHistory = messages.slice(-10).map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        // Call the Edge Function
        const { data, error: fnError } = await supabase.functions.invoke('chat-ai', {
          body: {
            message: text.trim(),
            emotionContext: {
              facial: latestEmotionRef.current.facial
                ? {
                    emotion: latestEmotionRef.current.facial.dominant,
                    confidence: latestEmotionRef.current.facial.confidence,
                  }
                : null,
              voice: latestEmotionRef.current.voice
                ? {
                    emotion: latestEmotionRef.current.voice.emotion,
                    confidence: latestEmotionRef.current.voice.confidence,
                    metrics: latestEmotionRef.current.voice.metrics,
                  }
                : null,
            },
            conversationHistory,
            provider,
            model: CLAUDE_MODEL,
            systemPrompt,
          },
        });

        if (fnError) {
          throw new Error(fnError.message);
        }

        const assistantMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: data.response,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setError(message);
        console.error('[useMultimodalAI] Send message error:', err);
      } finally {
        setIsProcessing(false);
      }
    },
    [messages, provider, systemPrompt]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentTranscript('');
    setError(null);
  }, []);

  const setProvider = useCallback((newProvider: AIProvider) => {
    setProviderState(newProvider);
  }, []);

  const dispose = useCallback(() => {
    stopListening();
    stopFaceDetection();

    if (faceServiceRef.current) {
      faceServiceRef.current.dispose();
      faceServiceRef.current = null;
    }

    if (voiceServiceRef.current) {
      voiceServiceRef.current.dispose();
      voiceServiceRef.current = null;
    }

    setIsInitialized(false);
    setIsCameraActive(false);
    setIsMicActive(false);
    setIsFaceDetectionActive(false);
    console.log('[useMultimodalAI] Disposed');
  }, [stopListening, stopFaceDetection]);

  return {
    // State
    messages,
    currentTranscript,
    isListening,
    isProcessing,
    emotionState,
    error,

    // Services status
    isCameraActive,
    isMicActive,
    isInitialized,
    isFaceDetectionActive,

    // Actions
    initialize,
    startFaceDetection,
    stopFaceDetection,
    startListening,
    stopListening,
    sendMessage,
    clearMessages,
    setProvider,
    dispose,
  };
}
