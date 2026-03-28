"use client";

import { loggedFetch, safeJson, structuredLog } from "@resolution/ui";
import { useState, useRef, useCallback, useEffect } from "react";
import { GoogleGenAI, Modality, type LiveServerMessage } from "@google/genai";
interface TranscriptEntry {
  text: string;
  timestamp: Date;
}

interface VoiceChatProps {
  sessionId?: string;
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
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function VoiceChat({ sessionId = "default" }: VoiceChatProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [status, setStatus] = useState("Connecting...");
  const sessionRef = useRef<Awaited<
    ReturnType<InstanceType<typeof GoogleGenAI>["live"]["connect"]>
  > | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const hasConnected = useRef(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const ingestTranscript = useCallback(
    (text: string) => {
      // Persist to backend → buffer → Celery on_transcript_saved → render pipeline → SSE → canvas
      loggedFetch("voice-chat", "transcripts.ingest", `${apiBase}/api/transcripts/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          role: "user",
          text,
          timestamp: new Date().toISOString(),
        }),
      }).catch((err) =>
        structuredLog("error", "voice-chat", "transcripts.ingest_failed", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    },
    [apiBase, sessionId],
  );

  const appendTranscript = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      ingestTranscript(text);
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last) {
          return [...prev.slice(0, -1), { ...last, text: last.text + text }];
        }
        return [...prev, { text, timestamp: new Date() }];
      });
    },
    [ingestTranscript],
  );

  const stopRecording = useCallback(() => {
    structuredLog("info", "voice-chat", "recording.stop", { sessionId });
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
    // Flush buffered transcript chunks so nothing is lost between recording sessions
    loggedFetch("voice-chat", "transcripts.flush", `${apiBase}/api/transcripts/flush`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch((err) =>
      structuredLog("error", "voice-chat", "transcripts.flush_failed", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    // Seal current transcript entry so next recording starts fresh
    setTranscript((prev) => [...prev, { text: "", timestamp: new Date() }]);
    setStatus("Connected — tap the circle to record");
  }, [apiBase, sessionId]);

  const startRecording = useCallback(async () => {
    if (!sessionRef.current) return;
    structuredLog("info", "voice-chat", "recording.start", { sessionId });
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

      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (sessionRef.current) {
          const b64 = pcmBufferToBase64(event.data);
          structuredLog("debug", "voice-chat", "gemini.audio_frame", {
            sessionId,
            pcm_samples: event.data.length,
            base64_len: b64.length,
            mimeType: "audio/pcm;rate=16000",
          });
          sessionRef.current.sendRealtimeInput({
            audio: { data: b64, mimeType: "audio/pcm;rate=16000" },
          });
        }
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
      setStatus("Recording...");
      structuredLog("info", "voice-chat", "recording.mic_ready", { sessionId });
    } catch (err) {
      structuredLog("error", "voice-chat", "recording.mic_error", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      setStatus(`Mic error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }, [sessionId]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, stopRecording, startRecording]);

  // Auto-connect on mount
  useEffect(() => {
    if (hasConnected.current) return;
    hasConnected.current = true;

    async function connect() {
      try {
        structuredLog("info", "voice-chat", "gemini.connect_attempt", {
          sessionId,
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            systemInstruction:
              "You are a silent transcription assistant. Respond with only a single word: 'ok'. Keep responses as short as possible.",
          },
        });
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const session = await ai.live.connect({
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            systemInstruction:
              "You are a silent transcription assistant. Respond with only a single word: 'ok'. Keep responses as short as possible.",
          },
          callbacks: {
            onopen: () => {
              structuredLog("info", "voice-chat", "gemini.session_open", { sessionId, model: MODEL });
              setStatus("Connected — tap the circle to record");
              setIsConnected(true);
            },
            onmessage: (message: LiveServerMessage) => {
              structuredLog("info", "voice-chat", "gemini.server_message", {
                sessionId,
                message_json: safeJson(message),
              });
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                appendTranscript(content.inputTranscription.text);
              }
            },
            onerror: (e: ErrorEvent) => {
              structuredLog("error", "voice-chat", "gemini.session_error", {
                sessionId,
                message: e.message,
                type: e.type,
              });
              setStatus(`Error: ${e.message ?? "Unknown"}`);
            },
            onclose: () => {
              structuredLog("warn", "voice-chat", "gemini.session_close", { sessionId });
              setStatus("Disconnected");
              setIsConnected(false);
              setIsRecording(false);
            },
          },
        });
        sessionRef.current = session;
        structuredLog("info", "voice-chat", "gemini.connect_ok", { sessionId });
      } catch (err) {
        structuredLog("error", "voice-chat", "gemini.connect_failed", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        setStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    connect();
    return () => {
      structuredLog("info", "voice-chat", "gemini.cleanup", { sessionId });
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [appendTranscript, sessionId]);

  const filteredTranscript = transcript.filter((e) => e.text.trim());

  return (
    <div className="h-full w-full flex flex-col bg-[#f5f0e8]">
      {/* Transcript — fills available height, on top */}
      <div className="flex-1 min-h-0 flex flex-col border-b border-[#E8DDD8]">
        <div className="px-4 py-2.5 border-b border-[#E8DDD8] flex items-center justify-between shrink-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#2C2420]/40">
            Transcript
          </h2>
          {filteredTranscript.length > 0 && (
            <button
              onClick={() => setTranscript([])}
              className="text-[10px] text-[#2C2420]/30 hover:text-[#2C2420]/60 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredTranscript.length === 0 ? (
            <p className="text-xs text-[#2C2420]/30 text-center mt-10">
              Tap the logo to start recording.
            </p>
          ) : (
            filteredTranscript.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <div className="w-0.5 rounded-full bg-[#B47C69]/50 shrink-0" />
                <p className="text-sm text-[#2C2420]/70 leading-relaxed">{entry.text}</p>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Logo button — at bottom */}
      <div className="shrink-0 flex flex-col items-center justify-center gap-3 py-6">
        <button
          onClick={toggleRecording}
          className={`transition-all duration-200 active:scale-95 ${
            isRecording ? "opacity-60" : "hover:opacity-70"
          }`}
          title={isRecording ? "Stop recording" : "Start recording"}
        >
          <img
            src="/voice_canvas_logo.png"
            alt="Voice Canvas"
            className={`w-16 h-16 object-contain ${isRecording ? "animate-pulse" : ""}`}
          />
        </button>
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isRecording
                ? "bg-red-400 animate-pulse"
                : isConnected
                  ? "bg-[#B47C69]"
                  : "bg-[#D8CECA]"
            }`}
          />
          <span className="text-xs text-[#2C2420]/50">{status}</span>
        </div>
      </div>
    </div>
  );
}
