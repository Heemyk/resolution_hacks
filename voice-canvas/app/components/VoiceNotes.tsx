"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { GoogleGenAI, Modality, type LiveServerMessage } from "@google/genai";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "recording";

interface TranscriptEntry {
  role: "user" | "gemini";
  text: string;
}

interface NoteBlock {
  id: string;
  type: "heading" | "definition" | "point" | "example";
  text: string;
  term?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = "gemini-2.0-flash-live-001";
const AUDIO_SAMPLE_RATE = 16000;
const SILENCE_DELAY_MS = 2500;
const MIN_TRANSCRIPT_LENGTH = 15;

// ─── Audio helpers ────────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function VoiceNotes() {
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("disconnected");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [noteBlocks, setNoteBlocks] = useState<NoteBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [apiKey, setApiKey] = useState(process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "");
  const [showKeyInput, setShowKeyInput] = useState(!process.env.NEXT_PUBLIC_GEMINI_API_KEY);
  const [statusMessage, setStatusMessage] = useState("Ready to record");

  // Gemini Live refs
  const sessionRef = useRef<Awaited<ReturnType<InstanceType<typeof GoogleGenAI>["live"]["connect"]>> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Note generation refs
  const processedLengthRef = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const canvasEndRef = useRef<HTMLDivElement>(null);

  // ── Session timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (connStatus === "disconnected") return;
    const id = setInterval(() => setSessionSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [connStatus]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    canvasEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [noteBlocks, isGenerating]);

  // ── Silence detection → note generation ─────────────────────────────────────
  useEffect(() => {
    const userEntries = transcript.filter((t) => t.role === "user");
    if (userEntries.length === 0) return;

    const fullText = userEntries.map((t) => t.text).join(" ");
    if (fullText.length <= processedLengthRef.current) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    silenceTimerRef.current = setTimeout(async () => {
      const newText = fullText.slice(processedLengthRef.current).trim();
      processedLengthRef.current = fullText.length;
      if (newText.length >= MIN_TRANSCRIPT_LENGTH) {
        await generateNoteBlock(newText);
      }
    }, SILENCE_DELAY_MS);
  }, [transcript]);

  // ── Generate note block via Claude ───────────────────────────────────────────
  const generateNoteBlock = async (text: string) => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) return;
      const block = await res.json();
      if (block.type !== "ignore" && block.text) {
        setNoteBlocks((prev) => [...prev, { ...block, id: crypto.randomUUID() }]);
      }
    } catch (err) {
      console.error("Note generation failed:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Transcript helper ────────────────────────────────────────────────────────
  const appendTranscript = useCallback((role: "user" | "gemini", text: string) => {
    if (!text.trim()) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...prev, { role, text }];
    });
  }, []);

  // ── Connect to Gemini Live ───────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!apiKey) { setShowKeyInput(true); return; }
    try {
      setConnStatus("connecting");
      setStatusMessage("Connecting…");

      const ai = new GoogleGenAI({ apiKey });
      const session = await ai.live.connect({
        model: MODEL,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onopen: () => {
            setConnStatus("connected");
            setStatusMessage("Connected — press record to start");
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.inputTranscription?.text)
              appendTranscript("user", content.inputTranscription.text);
            if (content?.outputTranscription?.text)
              appendTranscript("gemini", content.outputTranscription.text);
          },
          onerror: (e: ErrorEvent) => {
            setStatusMessage(`Error: ${e.message ?? "Unknown"}`);
            setConnStatus("disconnected");
          },
          onclose: () => {
            setConnStatus("disconnected");
            setStatusMessage("Ready to record");
          },
        },
      });
      sessionRef.current = session;
    } catch (err) {
      setStatusMessage(`Failed to connect: ${err instanceof Error ? err.message : "Unknown"}`);
      setConnStatus("disconnected");
    }
  }, [apiKey, appendTranscript]);

  // ── Start recording ──────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!sessionRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: AUDIO_SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const workletCode = `
        class PCMProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const ch = inputs[0]?.[0];
            if (ch?.length) this.port.postMessage(ch);
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

      workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
        sessionRef.current?.sendRealtimeInput({
          audio: { data: pcmBufferToBase64(e.data), mimeType: "audio/pcm;rate=16000" },
        });
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);
      setConnStatus("recording");
      setStatusMessage("Recording…");
    } catch (err) {
      setStatusMessage(`Mic error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }, []);

  // ── Stop recording ───────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setConnStatus("connected");
    setStatusMessage("Paused — press record to continue");
  }, []);

  // ── Disconnect ───────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    stopRecording();
    sessionRef.current?.close();
    sessionRef.current = null;
    setConnStatus("disconnected");
    setSessionSeconds(0);
    processedLengthRef.current = 0;
    setStatusMessage("Ready to record");
  }, [stopRecording]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const isConnected = connStatus === "connected" || connStatus === "recording";
  const isRecording = connStatus === "recording";

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#FDFAF7] font-[family-name:var(--font-dm-sans)]">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 py-4 bg-white border-b border-[#E8DDD8] shrink-0">
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-[#B47C69]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
          <span className="text-[15px] font-medium tracking-wide text-[#2C2420]">lecture notes</span>
        </div>

        <div className="flex items-center gap-4">
          {connStatus !== "disconnected" && (
            <span className="text-sm text-[#8C7B74] font-[family-name:var(--font-lora)]">
              {formatTime(sessionSeconds)}
            </span>
          )}
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
              isRecording ? "bg-red-400 animate-pulse" :
              isConnected ? "bg-[#B47C69]" :
              "bg-[#D8CECA]"
            }`} />
            <span className="text-xs text-[#8C7B74]">{statusMessage}</span>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Transcript sidebar */}
        <aside className="w-60 flex flex-col bg-[#F9F6F3] border-r border-[#E8DDD8] shrink-0">
          <div className="px-4 py-3 border-b border-[#E8DDD8]">
            <span className="text-[10px] font-medium text-[#B47C69] uppercase tracking-[0.12em]">
              live feed
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {transcript.length === 0 ? (
              <p className="text-xs text-[#C4B5AF] leading-relaxed mt-2">
                Transcript will appear here as you record…
              </p>
            ) : (
              transcript.slice(-12).map((entry, i) => (
                <div key={i} className={`text-xs leading-relaxed ${
                  entry.role === "user" ? "text-[#4A3A35]" : "text-[#B47C69] italic"
                }`}>
                  {entry.text}
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </aside>

        {/* Notes canvas */}
        <main className="flex-1 overflow-y-auto">
          {noteBlocks.length === 0 && !isGenerating ? (
            <EmptyCanvas />
          ) : (
            <div className="max-w-2xl mx-auto px-8 py-10 pb-16">
              {noteBlocks.map((block) => (
                <NoteBlockView key={block.id} block={block} />
              ))}
              {isGenerating && <GeneratingIndicator />}
              <div ref={canvasEndRef} />
            </div>
          )}
        </main>
      </div>

      {/* ── Footer controls ── */}
      <footer className="shrink-0 bg-white border-t border-[#E8DDD8]">
        {/* API key input */}
        {showKeyInput && (
          <div className="px-8 py-3 border-b border-[#E8DDD8] flex items-center gap-3">
            <label className="text-xs text-[#8C7B74] whitespace-nowrap">Gemini API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza…"
              className="flex-1 text-xs bg-[#F9F6F3] border border-[#E8DDD8] px-3 py-1.5 text-[#2C2420] placeholder:text-[#C4B5AF] outline-none focus:border-[#B47C69] transition-colors"
            />
            <button
              onClick={() => apiKey && setShowKeyInput(false)}
              className="text-xs text-[#B47C69] hover:text-[#9A6558] transition-colors"
            >
              Save
            </button>
          </div>
        )}

        <div className="px-8 py-4 flex items-center gap-3">
          {/* Waveform (recording only) */}
          {isRecording && <Waveform />}

          <div className="flex items-center gap-2 ml-auto">
            {!showKeyInput && isConnected && (
              <button
                onClick={() => setShowKeyInput(true)}
                className="text-xs text-[#C4B5AF] hover:text-[#8C7B74] transition-colors mr-1"
              >
                API key
              </button>
            )}

            {!isConnected ? (
              <button
                onClick={connect}
                disabled={!apiKey || connStatus === "connecting"}
                className="px-5 py-2 text-sm font-medium bg-[#2C2420] text-[#FDFAF7] hover:bg-[#3D302B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {connStatus === "connecting" ? "Connecting…" : "Connect"}
              </button>
            ) : (
              <>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex items-center gap-2 px-5 py-2 text-sm font-medium transition-colors ${
                    isRecording
                      ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                      : "bg-[#B47C69] text-white hover:bg-[#9A6558]"
                  }`}
                >
                  <MicIcon recording={isRecording} />
                  {isRecording ? "Stop" : "Record"}
                </button>
                <button
                  onClick={disconnect}
                  className="px-4 py-2 text-sm text-[#8C7B74] border border-[#E8DDD8] hover:border-[#C4B5AF] transition-colors"
                >
                  End session
                </button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyCanvas() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <div className="w-12 h-12 border border-[#E8DDD8] bg-white flex items-center justify-center">
        <svg className="w-5 h-5 text-[#D8CECA]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <div>
        <p className="text-sm text-[#8C7B74] font-[family-name:var(--font-lora)]">
          Your notes will appear here
        </p>
        <p className="text-xs text-[#C4B5AF] mt-1">
          Connect and start recording to begin
        </p>
      </div>
    </div>
  );
}

function NoteBlockView({ block }: { block: NoteBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <div className="mt-10 mb-4 first:mt-0">
          <h2 className="font-[family-name:var(--font-lora)] text-xl font-semibold text-[#2C2420] pb-2 border-b border-[#E8DDD8] animate-in fade-in slide-in-from-bottom-2 duration-400">
            {block.text}
          </h2>
        </div>
      );

    case "definition":
      return (
        <div className="my-4 pl-4 border-l-2 border-[#B47C69] bg-[#FDF8F5] py-3 pr-4 animate-in fade-in slide-in-from-bottom-2 duration-400">
          {block.term && (
            <p className="font-[family-name:var(--font-lora)] font-semibold text-[#2C2420] text-sm mb-1">
              {block.term}
            </p>
          )}
          <p className="text-sm text-[#4A3A35] leading-relaxed">{block.text}</p>
        </div>
      );

    case "point":
      return (
        <div className="flex items-start gap-3 my-2.5 animate-in fade-in slide-in-from-bottom-2 duration-400">
          <div className="w-1 h-1 rounded-full bg-[#B47C69] mt-2.5 shrink-0" />
          <p className="text-sm text-[#2C2420] leading-relaxed">{block.text}</p>
        </div>
      );

    case "example":
      return (
        <div className="my-4 ml-5 pl-4 border-l border-[#E8DDD8] animate-in fade-in slide-in-from-bottom-2 duration-400">
          <span className="text-[10px] font-medium text-[#B47C69] uppercase tracking-[0.1em]">
            example
          </span>
          <p className="text-sm text-[#6B5550] leading-relaxed mt-1 italic">{block.text}</p>
        </div>
      );

    default:
      return null;
  }
}

function GeneratingIndicator() {
  return (
    <div className="flex items-center gap-2 mt-4 animate-in fade-in duration-300">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full bg-[#B47C69] opacity-60"
            style={{ animation: "bounce 1s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span className="text-xs text-[#C4B5AF]">noting…</span>
    </div>
  );
}

function Waveform() {
  return (
    <div className="flex items-center gap-[3px] h-5">
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] bg-[#B47C69] rounded-full opacity-70"
          style={{
            height: `${6 + Math.sin(i * 0.7) * 5 + Math.cos(i * 1.2) * 3}px`,
            animation: "waveBar 0.9s ease-in-out infinite",
            animationDelay: `${i * 0.06}s`,
          }}
        />
      ))}
    </div>
  );
}

function MicIcon({ recording }: { recording: boolean }) {
  return recording ? (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M7 4a3 3 0 016 0v4a3 3 0 01-6 0V4z" />
      <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
    </svg>
  );
}
