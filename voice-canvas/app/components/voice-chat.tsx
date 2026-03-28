"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { GoogleGenAI, Modality, type LiveServerMessage } from "@google/genai";

interface TranscriptEntry {
  role: "user" | "gemini";
  text: string;
  timestamp: Date;
}

const MODEL = "gemini-3.1-flash-live-preview";
const AUDIO_SAMPLE_RATE = 16000;

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

export default function VoiceChat() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [status, setStatus] = useState("Disconnected");
  const [apiKey, setApiKey] = useState(
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? ""
  );
  const [showKeyInput, setShowKeyInput] = useState(
    !process.env.NEXT_PUBLIC_GEMINI_API_KEY
  );

  const sessionRef = useRef<Awaited<
    ReturnType<InstanceType<typeof GoogleGenAI>["live"]["connect"]>
  > | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const appendTranscript = useCallback(
    (role: "user" | "gemini", text: string) => {
      if (!text.trim()) return;
      setTranscript((prev) => {
        // Merge consecutive entries from the same role
        const last = prev[prev.length - 1];
        if (last && last.role === role) {
          return [
            ...prev.slice(0, -1),
            { ...last, text: last.text + text },
          ];
        }
        return [...prev, { role, text, timestamp: new Date() }];
      });
    },
    []
  );

  const connect = useCallback(async () => {
    if (!apiKey) {
      setShowKeyInput(true);
      return;
    }

    try {
      setStatus("Connecting...");

      const ai = new GoogleGenAI({ apiKey });

      const session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
        },
        callbacks: {
          onopen: () => {
            setStatus("Connected");
            setIsConnected(true);
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              appendTranscript("user", content.inputTranscription.text);
            }
            if (content?.outputTranscription?.text) {
              appendTranscript("gemini", content.outputTranscription.text);
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
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }, [apiKey, appendTranscript]);

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

      // Load PCM processor worklet
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
          const base64 = pcmBufferToBase64(event.data);
          sessionRef.current.sendRealtimeInput({
            audio: {
              data: base64,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        }
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
      setStatus("Recording...");
    } catch (err) {
      console.error("Mic error:", err);
      setStatus(
        `Mic error: ${err instanceof Error ? err.message : "Unknown"}`
      );
    }
  }, []);

  const stopRecording = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
    setStatus("Connected");
  }, []);

  const disconnect = useCallback(() => {
    stopRecording();
    sessionRef.current?.close();
    sessionRef.current = null;
    setIsConnected(false);
    setStatus("Disconnected");
  }, [stopRecording]);

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      {/* API Key input */}
      {showKeyInput && (
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="Enter Gemini API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg border border-foreground/20 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => apiKey && setShowKeyInput(false)}
            className="px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-80 transition-opacity"
          >
            Save
          </button>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isRecording
                ? "bg-red-500 animate-pulse"
                : isConnected
                  ? "bg-green-500"
                  : "bg-zinc-400"
            }`}
          />
          <span className="text-sm text-foreground/60">{status}</span>
        </div>
        {!showKeyInput && (
          <button
            onClick={() => setShowKeyInput(true)}
            className="text-xs text-foreground/40 hover:text-foreground/60 transition-colors"
          >
            Change API key
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3 justify-center">
        {!isConnected ? (
          <button
            onClick={connect}
            disabled={!apiKey}
            className="px-6 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Connect
          </button>
        ) : (
          <>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`px-6 py-3 rounded-full font-medium transition-colors ${
                isRecording
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {isRecording ? "Stop Mic" : "Start Mic"}
            </button>
            <button
              onClick={disconnect}
              className="px-6 py-3 rounded-full border border-foreground/20 text-foreground font-medium hover:bg-foreground/5 transition-colors"
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      {/* Transcript */}
      <div className="border border-foreground/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-foreground/10 bg-foreground/[0.02]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Transcript</h2>
            {transcript.length > 0 && (
              <button
                onClick={() => setTranscript([])}
                className="text-xs text-foreground/40 hover:text-foreground/60 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="h-96 overflow-y-auto p-4 space-y-3">
          {transcript.length === 0 ? (
            <p className="text-sm text-foreground/30 text-center mt-16">
              Connect and start speaking to see the transcript here.
            </p>
          ) : (
            transcript.map((entry, i) => (
              <div
                key={i}
                className={`flex gap-3 ${
                  entry.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                    entry.role === "user"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-foreground/[0.06] text-foreground rounded-bl-md"
                  }`}
                >
                  <div className="text-[10px] opacity-60 mb-1">
                    {entry.role === "user" ? "You" : "Gemini"}
                  </div>
                  {entry.text}
                </div>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>
    </div>
  );
}
