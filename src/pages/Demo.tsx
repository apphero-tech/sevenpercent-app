import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Shield,
  Lock,
  Eye,
  Camera,
  Mic,
  MicOff,
  VideoOff,
  ArrowLeft,
  Loader2,
  Smile,
  Frown,
  Angry,
  AlertCircle,
  Meh,
  Edit3,
  Check,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMultimodalAI, AIProvider, Message } from "@/hooks/useMultimodalAI";

// Emotion icons mapping
const EmotionIcon = ({ emotion, className }: { emotion: string; className?: string }) => {
  const iconProps = { className: className || "w-5 h-5" };

  switch (emotion) {
    case "happy":
      return <Smile {...iconProps} />;
    case "sad":
      return <Frown {...iconProps} />;
    case "angry":
      return <Angry {...iconProps} />;
    case "fearful":
      return <AlertCircle {...iconProps} />;
    default:
      return <Meh {...iconProps} />;
  }
};

// Emotion color mapping
const getEmotionColor = (emotion: string): string => {
  switch (emotion) {
    case "happy":
      return "text-green-400";
    case "sad":
      return "text-blue-400";
    case "angry":
      return "text-red-400";
    case "fearful":
      return "text-yellow-400";
    default:
      return "text-gray-400";
  }
};

const getEmotionLabel = (emotion: string): string => {
  const labels: Record<string, string> = {
    happy: "Happy",
    sad: "Sad",
    angry: "Angry",
    fearful: "Anxious",
    neutral: "Neutral",
    surprised: "Surprised",
    disgusted: "Disgusted",
  };
  return labels[emotion] || emotion;
};

const Demo = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasSeenSecurityModal, setHasSeenSecurityModal] = useState(false);
  const [selectedProvider] = useState<AIProvider>("claude");

  // Transcript editing state
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    currentTranscript,
    isListening,
    isProcessing,
    emotionState,
    error,
    isInitialized,
    initialize,
    startListening,
    stopListening,
    sendMessage,
    setProvider,
  } = useMultimodalAI({
    provider: selectedProvider,
    language: 'fr-FR',
    onEmotionChange: (state) => {
      console.log("[Demo] Emotion changed:", state.combined);
    },
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  // Show security modal once authenticated
  useEffect(() => {
    if (user && !hasSeenSecurityModal && !isReady) {
      setSecurityModalOpen(true);
    }
  }, [user, hasSeenSecurityModal, isReady]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Update provider when selection changes
  useEffect(() => {
    setProvider(selectedProvider);
  }, [selectedProvider, setProvider]);

  // Ensure video stream is attached when ref becomes available
  useEffect(() => {
    if (streamRef.current && videoRef.current && cameraEnabled) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.error);
    }
  }, [cameraEnabled]);

  // Update edited transcript when current transcript changes
  useEffect(() => {
    if (currentTranscript && !isEditingTranscript) {
      setEditedTranscript(currentTranscript);
    }
  }, [currentTranscript, isEditingTranscript]);

  const handleSecurityAccept = () => {
    setSecurityModalOpen(false);
    setHasSeenSecurityModal(true);
    setIsReady(true);
  };

  const toggleCamera = async () => {
    if (cameraEnabled) {
      if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach((track) => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraEnabled(true);
      } catch (error) {
        console.error("Camera access denied:", error);
      }
    }
  };

  const toggleMic = async () => {
    if (micEnabled) {
      if (audioStreamRef.current) {
        audioStreamRef.current.getAudioTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      setMicEnabled(false);
      if (isListening) {
        stopListening();
      }
    } else {
      try {
        // Use system default microphone
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = audioStream;

        // Log which device was actually used
        const tracks = audioStream.getAudioTracks();
        if (tracks.length > 0) {
          console.log("[Demo] Using microphone:", tracks[0].label);
        }

        setMicEnabled(true);
      } catch (error) {
        console.error("Microphone access denied:", error);
      }
    }
  };

  // Initialize AI when both camera and mic are ready
  useEffect(() => {
    const initAI = async () => {
      if (cameraEnabled && micEnabled && videoRef.current && audioStreamRef.current && !isInitialized) {
        try {
          await initialize(videoRef.current, audioStreamRef.current);
          console.log("[Demo] Multimodal AI initialized");
        } catch (error) {
          console.error("[Demo] Failed to initialize AI:", error);
        }
      }
    };
    initAI();
  }, [cameraEnabled, micEnabled, isInitialized, initialize]);

  const handleToggleListening = async () => {
    if (isListening) {
      stopListening();
    } else {
      // Ensure camera and mic are on
      if (!cameraEnabled) {
        await toggleCamera();
      }
      if (!micEnabled) {
        await toggleMic();
      }

      // Wait for initialization to complete
      const waitForInit = () => {
        return new Promise<void>((resolve) => {
          const checkInit = () => {
            if (isInitialized) {
              resolve();
            } else {
              setTimeout(checkInit, 100);
            }
          };
          // Start checking after a short delay to allow services to initialize
          setTimeout(checkInit, 500);
        });
      };

      try {
        // Wait for initialization (max ~3 seconds via the checkInit loop)
        await waitForInit();
        console.log("[Demo] Starting listening, isInitialized:", isInitialized);
        await startListening();
      } catch (err) {
        console.error("[Demo] Failed to start listening:", err);
      }
    }
  };

  // Handle transcript editing
  const handleStartEdit = () => {
    setIsEditingTranscript(true);
    setEditedTranscript(currentTranscript);
  };

  const handleCancelEdit = () => {
    setIsEditingTranscript(false);
    setEditedTranscript(currentTranscript);
  };

  const handleConfirmEdit = async () => {
    if (editedTranscript.trim()) {
      setIsEditingTranscript(false);
      await sendMessage(editedTranscript.trim());
      setEditedTranscript("");
    }
  };

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Security Modal */}
      <Dialog open={securityModalOpen} onOpenChange={setSecurityModalOpen}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Shield className="w-8 h-8 text-foreground" />
            </div>
            <DialogTitle className="text-2xl font-bold">Privacy & Security</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Your data is protected by advanced security measures
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
              <Lock className="w-5 h-5 text-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">End-to-end encryption</p>
                <p className="text-xs text-muted-foreground">
                  All communications are encrypted and never stored
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
              <Eye className="w-5 h-5 text-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Real-time processing</p>
                <p className="text-xs text-muted-foreground">
                  Video and audio are processed instantly then deleted
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
              <Shield className="w-5 h-5 text-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Zero data retention</p>
                <p className="text-xs text-muted-foreground">
                  We never collect or share any personal information
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleSecurityAccept}
            className="w-full bg-foreground text-background hover:bg-foreground/90"
          >
            I understand, continue
          </Button>

          <p className="text-xs text-center text-muted-foreground mt-2">
            By continuing, you accept our privacy policy
          </p>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-border">
        <Link
          to="/"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </Link>
        <span className="text-xl font-black">7%</span>

        {/* Model Badge */}
        <div className="px-3 py-1 bg-muted rounded-full text-xs text-muted-foreground">
          Claude Sonnet 4
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
        {isReady && (
          <>
            {/* Left Panel - Video & Controls */}
            <div className="lg:w-1/3 space-y-4">
              {/* Video Preview */}
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border border-border">
                {/* Video element is always rendered but hidden when camera is off */}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover scale-x-[-1] ${cameraEnabled ? 'block' : 'hidden'}`}
                />
                {!cameraEnabled && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                    <VideoOff className="w-12 h-12 mb-2" />
                    <p className="text-sm">Camera disabled</p>
                  </div>
                )}

                {/* Emotion Indicator */}
                {emotionState.combined && (
                  <div
                    className={`absolute top-4 left-4 px-3 py-1.5 bg-black/60 rounded-full flex items-center gap-2 ${getEmotionColor(emotionState.combined.emotion)}`}
                  >
                    <EmotionIcon emotion={emotionState.combined.emotion} className="w-4 h-4" />
                    <span className="text-xs font-medium">
                      {getEmotionLabel(emotionState.combined.emotion)}
                    </span>
                    <span className="text-xs opacity-60">
                      {Math.round(emotionState.combined.confidence * 100)}%
                    </span>
                  </div>
                )}

                {/* Status indicators */}
                <div className="absolute top-4 right-4 flex gap-2">
                  {cameraEnabled && (
                    <div className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      Camera
                    </div>
                  )}
                  {micEnabled && (
                    <div className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      Mic
                    </div>
                  )}
                </div>

                {/* Listening Indicator */}
                {isListening && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-accent/90 text-accent-foreground rounded-full flex items-center gap-2 animate-pulse">
                    <Mic className="w-4 h-4" />
                    <span className="text-sm font-medium">Listening...</span>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex justify-center gap-3 flex-wrap">
                <Button
                  variant={cameraEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={toggleCamera}
                  className={
                    cameraEnabled
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "border-border hover:bg-muted"
                  }
                >
                  {cameraEnabled ? <Camera className="w-4 h-4 mr-2" /> : <VideoOff className="w-4 h-4 mr-2" />}
                  {cameraEnabled ? "Camera" : "Enable"}
                </Button>

                <Button
                  variant={micEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={toggleMic}
                  className={
                    micEnabled
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "border-border hover:bg-muted"
                  }
                >
                  {micEnabled ? <Mic className="w-4 h-4 mr-2" /> : <MicOff className="w-4 h-4 mr-2" />}
                  {micEnabled ? "Mic" : "Enable"}
                </Button>

                <Button
                  variant={isListening ? "default" : "outline"}
                  size="sm"
                  onClick={handleToggleListening}
                  disabled={!isInitialized && !micEnabled}
                  className={
                    isListening
                      ? "bg-accent text-accent-foreground hover:bg-accent/90 animate-pulse"
                      : "border-border hover:bg-muted"
                  }
                >
                  {isListening ? "Stop" : "Speak"}
                </Button>
              </div>

              {/* Current Transcript - Editable */}
              {(currentTranscript || isEditingTranscript) && (
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  {isEditingTranscript ? (
                    <div className="space-y-2">
                      <Input
                        value={editedTranscript}
                        onChange={(e) => setEditedTranscript(e.target.value)}
                        placeholder="Edit your message..."
                        className="bg-background border-border"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          className="h-8"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleConfirmEdit}
                          disabled={!editedTranscript.trim()}
                          className="h-8 bg-foreground text-background hover:bg-foreground/90"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Send
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-muted-foreground italic flex-1">
                        "{currentTranscript}"
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleStartEdit}
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        title="Edit transcript"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Instructions */}
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  Enable camera and microphone for the full experience. The AI will analyze your
                  facial expressions and voice intonation to adapt its responses.
                </p>
              </div>
            </div>

            {/* Right Panel - Conversation Display */}
            <div className="lg:w-2/3 flex flex-col bg-muted/20 rounded-lg border border-border overflow-hidden">
              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center py-12">
                      <Mic className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground text-lg font-medium mb-2">
                        Start speaking to begin
                      </p>
                      <p className="text-sm text-muted-foreground/70">
                        Click "Speak" and say something. I'll understand not just your words,
                        but also your emotions through your voice and expressions.
                      </p>
                    </div>
                  ) : (
                    messages.map((message: Message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                            message.role === "user"
                              ? "bg-foreground text-background rounded-br-sm"
                              : "bg-muted text-foreground rounded-bl-sm"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                          {/* Emotion context badge for user messages */}
                          {message.role === "user" && message.emotionContext?.facial && (
                            <div
                              className={`mt-2 flex items-center gap-1 text-xs opacity-60 ${
                                message.role === "user" ? "text-background/70" : ""
                              }`}
                            >
                              <EmotionIcon
                                emotion={message.emotionContext.facial.dominant}
                                className="w-3 h-3"
                              />
                              <span>{getEmotionLabel(message.emotionContext.facial.dominant)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  {/* Processing indicator */}
                  {isProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-sm">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Voice-only notice instead of text input */}
              <div className="p-4 border-t border-border bg-muted/30">
                <p className="text-xs text-center text-muted-foreground">
                  This is a voice-first experience. Speak naturally and I'll understand your emotions.
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Demo;
