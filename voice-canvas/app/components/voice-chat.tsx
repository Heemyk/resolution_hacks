"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { GoogleGenAI, Modality, type LiveServerMessage } from "@google/genai";
import AudioVisualizer from "./audio-visualizer";

interface TranscriptEntry {
  text: string;
  timestamp: Date;
}

interface TaskItem {
  id: string;
  status: "pending" | "claimed" | "completed" | "failed";
  payload: { role: string; text: string; timestamp: string };
  claimedBy: string | null;
}

const MODEL = "gemini-3.1-flash-live-preview";
const AUDIO_SAMPLE_RATE = 16000;
const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY!;

function pcmBufferToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500",
  claimed: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

export default function VoiceChat() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [status, setStatus] = useState("Connecting...");
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const sessionRef = useRef<Awaited<
    ReturnType<InstanceType<typeof GoogleGenAI>["live"]["connect"]>
  > | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const hasConnected = useRef(false);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Poll task queue
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/tasks");
        const data = await res.json();
        setTasks(data.tasks ?? []);
      } catch {
        // ignore polling errors
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const enqueueTask = useCallback((text: string) => {
    fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "enqueue",
        payload: { role: "user", text, timestamp: new Date().toISOString() },
      }),
    }).catch((err) => console.error("Failed to enqueue task:", err));
  }, []);

  const appendTranscript = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      enqueueTask(text);
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last) {
          return [...prev.slice(0, -1), { ...last, text: last.text + text }];
        }
        return [...prev, { text, timestamp: new Date() }];
      });
    },
    [enqueueTask],
  );

  const stopRecording = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    analyserRef.current = null;
    setAnalyserNode(null);
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
    // Start a new transcript entry on next recording
    setTranscript((prev) => [...prev, { text: "", timestamp: new Date() }]);
    setStatus("Connected");
  }, []);

  const startRecording = useCallback(async () => {
    if (!sessionRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: AUDIO_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const workletCode = `
        class PCMProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (input && input[0] && input[0].length > 0) {
              this.port.postMessage(input[0]);
            }
            return true;
          }
        }
        registerProcessor('pcm-processor', PCMProcessor);
      `;
      const blob = new Blob([workletCode], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await audioContext.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
      workletNodeRef.current = workletNode;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      setAnalyserNode(analyser);

      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (sessionRef.current) {
          const base64 = pcmBufferToBase64(event.data);
          sessionRef.current.sendRealtimeInput({
            audio: {
              data: base64,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        }
      };

      source.connect(analyser);
      analyser.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
      setStatus("Recording...");
    } catch (err) {
      console.error("Mic error:", err);
      setStatus(`Mic error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, stopRecording, startRecording]);

  // Auto-connect on mount
  useEffect(() => {
    if (hasConnected.current) return;
    hasConnected.current = true;

    async function connect() {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const session = await ai.live.connect({
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction:
              "You are a silent transcription assistant. Respond with only a single word: 'ok'. Keep responses as short as possible.",
          },
          callbacks: {
            onopen: () => {
              setStatus("Connected — tap the circle to record");
              setIsConnected(true);
            },
            onmessage: (message: LiveServerMessage) => {
              console.log("[Gemini message]", JSON.stringify(message, null, 2));
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                appendTranscript(content.inputTranscription.text);
              }
            },
            onerror: (e: ErrorEvent) => {
              console.error("Session error:", e);
              setStatus(`Error: ${e.message ?? "Unknown"}`);
            },
            onclose: () => {
              setStatus("Disconnected");
              setIsConnected(false);
              setIsRecording(false);
            },
          },
        });

        sessionRef.current = session;
      } catch (err) {
        console.error("Connection failed:", err);
        setStatus(
          `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }

    connect();

    return () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [appendTranscript]);

  const filteredTranscript = transcript.filter((e) => e.text.trim());

  return (
    <div className="h-full w-full grid grid-cols-1 md:grid-cols-2">
      {/* Left column: Transcript + Task Queue */}
      <div className="flex flex-col h-full min-h-0 bg-black/[0.02]">
        {/* Transcript */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-5 py-3 border-b border-foreground/10 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground/50">
                Transcript
              </h2>
              {filteredTranscript.length > 0 && (
                <button
                  onClick={() => setTranscript([])}
                  className="text-xs text-foreground/30 hover:text-foreground/60 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {filteredTranscript.length === 0 ? (
              <p className="text-sm text-foreground/20 text-center mt-16">
                Tap the circle to start recording.
              </p>
            ) : (
              filteredTranscript.map((entry, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-1 rounded-full bg-blue-500/40 shrink-0" />
                  <div className="text-sm text-foreground/80 leading-relaxed">
                    {entry.text}
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Task Queue */}
        <div className="shrink-0 border-t border-foreground/10">
          <div className="px-5 py-3 border-b border-foreground/5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground/50">
                Task Queue
              </h2>
              <span className="text-xs text-foreground/30">
                {tasks.length} task{tasks.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="text-xs text-foreground/20 text-center py-6">
                No tasks in queue.
              </p>
            ) : (
              <div className="divide-y divide-foreground/5">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="px-5 py-2.5 flex items-start gap-3"
                  >
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      <div
                        className={`w-2 h-2 rounded-full ${STATUS_COLORS[task.status]}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground/70 truncate">
                        {task.payload.text}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-foreground/30 uppercase">
                          {task.id}
                        </span>
                        <span className="text-[10px] text-foreground/30">
                          {task.status}
                        </span>
                        {task.claimedBy && (
                          <span className="text-[10px] text-foreground/30">
                            {task.claimedBy}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right column: Fullscreen Visualizer */}
      <div className="relative h-full min-h-0">
        <AudioVisualizer
          analyserNode={analyserNode}
          isRecording={isRecording}
          onCircleClick={toggleRecording}
        />
        {/* Status overlay */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                isRecording
                  ? "bg-red-500 animate-pulse"
                  : isConnected
                    ? "bg-green-500"
                    : "bg-zinc-400"
              }`}
            />
            <span className="text-xs text-white/70">{status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
