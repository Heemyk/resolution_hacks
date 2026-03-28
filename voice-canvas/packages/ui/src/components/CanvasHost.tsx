"use client";

import { useEffect, useState } from "react";
import { GripVertical, X, Maximize2, Minimize2, BarChart3, FileText, Search, GitBranch, Clock, Mic, MessageSquare, Image } from "lucide-react";
import type { SSEMessage } from "../hooks/useSessionSSE";
import { structuredLog } from "../logger";
import { ChartBlock } from "./ChartBlock";
import { ImageBlock } from "./ImageBlock";
import { MermaidBlock } from "./MermaidBlock";

type UIBlock = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
};

type SearchResult = {
  tool: string;
  input: Record<string, unknown>;
  preview: string;
};

type Snapshot = {
  id: string;
  ts: Date;
  mode: "direct" | "passive" | string;
  focus: string;
  blocks: UIBlock[];
};

type Props = {
  sessionId: string;
  apiBase: string;
  lastEvent: SSEMessage | null;
};

export function CanvasHost({ sessionId, apiBase, lastEvent }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("Thinking…");
  const [pendingMode, setPendingMode] = useState<string>("passive");
  const [pendingFocus, setPendingFocus] = useState<string>("");

  useEffect(() => {
    if (!lastEvent) return;
    structuredLog("debug", "CanvasHost", "canvas.last_event", {
      sessionId,
      apiBase,
      sse_event: lastEvent.event,
    });

    if (lastEvent.event === "transcript") {
      setIsThinking(true);
      setThinkingLabel("Thinking…");
      return;
    }

    if (lastEvent.event === "agent_plan") {
      const d = lastEvent.data as any;
      setPendingMode(d?.mode ?? "passive");
      setPendingFocus(d?.focus ?? "");
      const modeLabel = d?.mode === "direct" ? "Responding…" : "Listening…";
      const focus = d?.focus ? ` · ${d.focus}` : "";
      setThinkingLabel(`${modeLabel}${focus}`);
      return;
    }

    if (lastEvent.event === "tool_result") {
      const d = lastEvent.data as any;
      setSearchResults((prev) => [
        ...prev,
        { tool: d.tool, input: d.input, preview: d.preview },
      ]);
      return;
    }

    if (lastEvent.event !== "render") return;
    const job = (lastEvent.data as any)?.job;
    if (!Array.isArray(job?.blocks)) return;

    const snap: Snapshot = {
      id: job.job_id ?? String(Date.now()),
      ts: new Date(),
      mode: job.meta?.mode ?? pendingMode,
      focus: job.meta?.focus ?? pendingFocus,
      blocks: job.blocks,
    };

    setIsThinking(false);
    setSearchResults([]);
    setSnapshots((prev) => {
      const next = [...prev, snap];
      setActiveIndex(next.length - 1);
      return next;
    });
  }, [lastEvent, sessionId, apiBase]);

  const activeSnap = activeIndex >= 0 ? snapshots[activeIndex] : null;
  const displayBlocks = activeSnap?.blocks ?? [];
  const isLatest = activeIndex === snapshots.length - 1;
  const allEmpty = snapshots.length === 0 && searchResults.length === 0 && !isThinking;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">

      {/* ── Timeline bar (sticky, hover-reveal) ── */}
      {snapshots.length > 0 && (
        <TimelineBar
          snapshots={snapshots}
          activeIndex={activeIndex}
          onSelect={setActiveIndex}
        />
      )}

      {/* ── Canvas scroll area ── */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 min-h-full">

          {/* Empty state */}
          {allEmpty && (
            <div className="flex flex-col items-center justify-center h-full min-h-64 select-none">
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Speak to generate canvas blocks
              </p>
            </div>
          )}

          {/* Thinking indicator */}
          {isThinking && (
            <div
              className="flex items-center gap-2.5 mb-4 px-4 py-3 rounded-lg border"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
                boxShadow: "var(--block-shadow)",
              }}
            >
              <ThinkingDots />
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {thinkingLabel}
              </span>
            </div>
          )}

          {/* Viewing-history banner */}
          {!isLatest && activeSnap && (
            <div
              className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg border text-xs"
              style={{
                background: "var(--muted)",
                borderColor: "var(--border)",
                color: "var(--muted-foreground)",
              }}
            >
              <span>Viewing: {activeSnap.focus || "earlier generation"}</span>
              <button
                onClick={() => setActiveIndex(snapshots.length - 1)}
                className="font-medium hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Jump to latest →
              </button>
            </div>
          )}

          {/* Search result cards */}
          {isLatest && searchResults.map((r, i) => (
            <CanvasCard
              key={i}
              label="Web Search"
              icon={<Search className="h-3 w-3" />}
              enterDelay={i * 60}
              width="100%"
            >
              <p
                className="text-xs font-medium mb-1.5"
                style={{ color: "var(--accent)" }}
              >
                {String((r.input as any).query ?? "")}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                {r.preview}
              </p>
            </CanvasCard>
          ))}

          {/* Agent-generated blocks */}
          <div key={activeIndex} className="flex flex-wrap gap-4">
            {displayBlocks.map((block, i) => (
              <BlockCard
                key={block.id}
                block={block}
                enterDelay={i * 60}
                onRemove={() => {
                  setSnapshots((prev) =>
                    prev.map((s, idx) =>
                      idx === activeIndex
                        ? { ...s, blocks: s.blocks.filter((b) => b.id !== block.id) }
                        : s
                    )
                  );
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Timeline bar ───────────────────────────────── */

function TimelineBar({
  snapshots,
  activeIndex,
  onSelect,
}: {
  snapshots: Snapshot[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);

  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="relative z-20 shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Trigger strip — always visible, 6px tall */}
      <div
        className="w-full transition-all duration-300 overflow-hidden"
        style={{ height: open ? "auto" : "6px" }}
      >
        {/* Collapsed indicator */}
        {!open && (
          <div
            className="w-full h-full"
            style={{ background: "var(--accent)", opacity: 0.35 }}
          />
        )}

        {/* Expanded bar */}
        {open && (
          <div
            className="w-full border-b"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              boxShadow: "0 2px 8px 0 hsl(24 10% 10% / 0.10)",
            }}
          >
            <div className="flex items-center gap-1.5 px-4 py-3 overflow-x-auto scrollbar-none">
              <Clock
                className="h-3.5 w-3.5 shrink-0 mr-1.5"
                style={{ color: "var(--foreground)", opacity: 0.4 }}
              />
              {snapshots.map((snap, i) => {
                const isActive = i === activeIndex;
                const isLast = i === snapshots.length - 1;
                return (
                  <div key={snap.id} className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onSelect(i)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-150"
                      style={{
                        background: isActive ? "var(--accent)" : "var(--card)",
                        borderColor: isActive ? "var(--accent)" : "hsl(24 10% 78%)",
                        color: isActive ? "white" : "var(--foreground)",
                        fontWeight: isActive ? 600 : 500,
                        opacity: isActive ? 1 : 0.75,
                        boxShadow: isActive
                          ? "0 1px 4px 0 hsl(24 80% 55% / 0.35)"
                          : "0 1px 2px 0 hsl(24 10% 10% / 0.06)",
                      }}
                    >
                      {snap.mode === "direct"
                        ? <MessageSquare className="h-3 w-3 shrink-0" />
                        : <Mic className="h-3 w-3 shrink-0" />
                      }
                      <span className="tabular-nums">{fmt(snap.ts)}</span>
                      {snap.focus && (
                        <span className="max-w-36 truncate">
                          · {snap.focus}
                        </span>
                      )}
                      {isLast && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: isActive ? "rgba(255,255,255,0.8)" : "var(--accent)" }}
                        />
                      )}
                    </button>
                    {i < snapshots.length - 1 && (
                      <div
                        className="w-4 h-px shrink-0"
                        style={{ background: "hsl(24 10% 82%)" }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Thinking dots ──────────────────────────────── */

function ThinkingDots() {
  return (
    <div className="flex gap-1 items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: "var(--muted-foreground)",
            animation: `thinking 1.2s ease-in-out ${i * 160}ms infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes thinking {
          0%,80%,100% { opacity: 0.3; transform: scale(0.7); }
          40%          { opacity: 1;   transform: scale(1);   }
        }
      `}</style>
    </div>
  );
}

/* ─── Shared card shell ──────────────────────────── */

function CanvasCard({
  label,
  icon,
  enterDelay,
  width = 340,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  enterDelay: number;
  width?: number | string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="block-enter rounded-lg border mb-4"
      style={{
        animationDelay: `${enterDelay}ms`,
        background: "var(--card)",
        borderColor: "var(--border)",
        boxShadow: "var(--block-shadow)",
        width,
        maxWidth: "100%",
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <GripVertical
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: "var(--muted-foreground)", opacity: 0.4 }}
        />
        <span style={{ color: "var(--muted-foreground)", opacity: 0.55 }}>{icon}</span>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted-foreground)" }}
        >
          {label}
        </span>
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  );
}

/* ─── Block card (with expand / remove) ─────────── */

function BlockCard({
  block,
  enterDelay,
  onRemove,
}: {
  block: UIBlock;
  enterDelay: number;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isChart = block.kind === "chartjs";
  const isMermaid = block.kind === "mermaid";
  const isImage = block.kind === "image";
  const label = isChart ? "Chart" : isMermaid ? "Diagram" : isImage ? "Image" : "Text";
  const icon = isChart ? <BarChart3 className="h-3 w-3" /> : isMermaid ? <GitBranch className="h-3 w-3" /> : isImage ? <Image className="h-3 w-3" /> : <FileText className="h-3 w-3" />;
  const baseWidth = 340;
  const width = expanded ? "100%" : baseWidth;

  return (
    <div
      className="block-enter group rounded-lg border"
      style={{
        animationDelay: `${enterDelay}ms`,
        background: "var(--card)",
        borderColor: "var(--border)",
        boxShadow: hovered ? "var(--block-shadow-hover)" : "var(--block-shadow)",
        transition: "box-shadow 200ms ease, width 200ms ease",
        width,
        maxWidth: "100%",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <GripVertical
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--muted-foreground)", opacity: 0.4 }}
          />
          <span style={{ color: "var(--muted-foreground)", opacity: 0.55 }}>{icon}</span>
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--muted-foreground)" }}
          >
            {label}
          </span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1 rounded transition-colors hover:bg-[var(--muted)]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded transition-colors hover:bg-red-50 hover:text-red-500"
            style={{ color: "var(--muted-foreground)" }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-3 overflow-auto">
        <BlockContent block={block} chartHeight={expanded ? 240 : 160} />
      </div>
    </div>
  );
}

/* ─── Block content by kind ──────────────────────── */

function BlockContent({ block, chartHeight = 160 }: { block: UIBlock; chartHeight?: number }) {
  if (block.kind === "markdown") {
    return <MarkdownContent text={String(block.payload.text ?? "")} />;
  }

  if (block.kind === "chartjs") {
    const config = block.payload.config;
    if (!config || typeof config !== "object") return null;
    return (
      <div style={{ width: "100%", height: chartHeight }}>
        <ChartBlock config={config as object} />
      </div>
    );
  }

  if (block.kind === "mermaid") {
    return <MermaidBlock source={String(block.payload.source ?? "")} />;
  }

  if (block.kind === "image") {
    const url = String(block.payload.url ?? "");
    if (!url) return null;
    return (
      <ImageBlock
        url={url}
        caption={block.payload.caption ? String(block.payload.caption) : undefined}
        sourceUrl={block.payload.source_url ? String(block.payload.source_url) : undefined}
      />
    );
  }

  return (
    <pre className="text-xs overflow-auto" style={{ color: "var(--muted-foreground)" }}>
      {JSON.stringify(block.payload, null, 2)}
    </pre>
  );
}

/* ─── Markdown line renderer ─────────────────────── */

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("# "))
          return (
            <h2 key={i} className="text-base font-semibold leading-snug" style={{ color: "var(--foreground)" }}>
              {line.slice(2)}
            </h2>
          );
        if (line.startsWith("## "))
          return (
            <h3 key={i} className="text-sm font-semibold leading-snug" style={{ color: "var(--foreground)" }}>
              {line.slice(3)}
            </h3>
          );
        if (line.startsWith("### "))
          return (
            <h4 key={i} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
              {line.slice(4)}
            </h4>
          );
        if (line.startsWith("- ") || line.startsWith("* "))
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="mt-2 w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
              <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", opacity: 0.8 }}>
                {line.slice(2)}
              </p>
            </div>
          );
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--foreground)", opacity: 0.8 }}>
            {line}
          </p>
        );
      })}
    </div>
  );
}
