"use client";

import { useId, useState, useCallback, useRef, useEffect } from "react";
import { PanelRight, PanelBottom, X, Mic } from "lucide-react";
import VoiceChat from "./voice-chat";
import { LiveCanvasPanel } from "../LiveCanvasPanel";

interface TranscriptEntry {
  text: string;
  timestamp: Date;
}

export function VoiceCanvasLayout() {
  const reactId = useId();
  const sessionId = `session-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  const [rightOpen, setRightOpen] = useState(true);
  const [bottomOpen, setBottomOpen] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const handleTranscriptEntry = useCallback((entry: TranscriptEntry) => {
    setTranscript((prev) => [...prev, entry]);
  }, []);

  useEffect(() => {
    if (bottomOpen) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, bottomOpen]);

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden"
      style={{ background: "var(--background)" }}
    >
      {/* ── Toolbar ───────────────────────────────── */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-2 border-b"
        style={{ background: "var(--panel-bg)", borderColor: "var(--border)" }}
      >
        {/* Left: panel toggles */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            active={rightOpen}
            onClick={() => setRightOpen((o) => !o)}
            title="Toggle voice panel"
          >
            <PanelRight className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={bottomOpen}
            onClick={() => setBottomOpen((o) => !o)}
            title="Toggle transcript"
          >
            <PanelBottom className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {/* Right: session id */}
        <span
          className="text-[10px] font-mono truncate max-w-48"
          style={{ color: "var(--muted-foreground)" }}
        >
          {sessionId}
        </span>
      </div>

      {/* ── Main area ─────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Canvas */}
        <div className="flex-1 overflow-hidden canvas-dots">
          <LiveCanvasPanel sessionId={sessionId} />
        </div>

        {/* Right panel: voice controls */}
        <div
          className="panel-right shrink-0 border-l flex flex-col"
          style={{
            width: rightOpen ? 300 : 0,
            borderColor: "var(--border)",
            background: "#111111",
          }}
        >
          {rightOpen && (
            <>
              <div
                className="shrink-0 flex items-center justify-between px-3 py-2 border-b"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-2">
                  <Mic className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.4)" }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Voice
                  </span>
                </div>
                <button
                  onClick={() => setRightOpen(false)}
                  className="p-1 rounded transition-colors"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <VoiceChat
                  sessionId={sessionId}
                  onTranscriptEntry={handleTranscriptEntry}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bottom panel: transcript ───────────────── */}
      <div
        className="panel-bottom shrink-0 border-t"
        style={{
          height: bottomOpen ? 200 : 0,
          borderColor: "var(--border)",
          background: "var(--panel-bg)",
        }}
      >
        {bottomOpen && (
          <div className="h-[200px] flex flex-col">
            {/* Header */}
            <div
              className="shrink-0 flex items-center justify-between px-4 py-2 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <h3
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Transcript
              </h3>
              <div className="flex items-center gap-2">
                {transcript.length > 0 && (
                  <button
                    onClick={() => setTranscript([])}
                    className="text-[10px] transition-colors"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setBottomOpen(false)}
                  className="p-1 rounded"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-auto px-4 py-2 space-y-2">
              {transcript.filter((e) => e.text.trim()).length === 0 ? (
                <p
                  className="text-xs text-center mt-4"
                  style={{ color: "var(--muted-foreground)", opacity: 0.5 }}
                >
                  Transcript will appear here as you speak.
                </p>
              ) : (
                transcript
                  .filter((e) => e.text.trim())
                  .map((entry, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span
                        className="text-[10px] font-mono mt-0.5 shrink-0"
                        style={{ color: "var(--muted-foreground)", opacity: 0.5 }}
                      >
                        {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <div
                        className="w-0.5 rounded-full shrink-0 self-stretch"
                        style={{ background: "var(--accent)", opacity: 0.4 }}
                      />
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: "var(--foreground)", opacity: 0.75 }}
                      >
                        {entry.text}
                      </p>
                    </div>
                  ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-2 rounded-md text-sm transition-colors"
      style={{
        background: active ? "var(--muted)" : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
      }}
    >
      {children}
    </button>
  );
}
