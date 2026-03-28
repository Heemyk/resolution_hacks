"use client";

import { useEffect, useRef, useState } from "react";
import type { SSEMessage } from "../hooks/useSessionSSE";
import { structuredLog } from "../logger";
import { ChartBlock } from "./ChartBlock";

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

type Props = {
  sessionId: string;
  apiBase: string;
  lastEvent: SSEMessage | null;
};

export function CanvasHost({ sessionId, apiBase, lastEvent }: Props) {
  const [blocks, setBlocks] = useState<UIBlock[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [renderKey, setRenderKey] = useState(0);
  const [exiting, setExiting] = useState(false);
  const pendingRef = useRef<UIBlock[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
    structuredLog("debug", "CanvasHost", "canvas.last_event", {
      sessionId,
      apiBase,
      sse_event: lastEvent.event,
    });

    if (lastEvent.event === "transcript") {
      setIsThinking(true);
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

    setIsThinking(false);
    setSearchResults([]);

    const incoming = job.blocks as UIBlock[];

    // Clear any in-flight transition
    if (timerRef.current) clearTimeout(timerRef.current);

    pendingRef.current = incoming;
    setExiting(true);

    timerRef.current = setTimeout(() => {
      setBlocks(pendingRef.current ?? []);
      setRenderKey((k) => k + 1);
      setExiting(false);
      pendingRef.current = null;
    }, 200);
  }, [lastEvent, sessionId, apiBase]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const isEmpty = blocks.length === 0 && !isThinking && searchResults.length === 0;

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{ backgroundColor: "#f9f9f8" }}
    >
      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #d8d8d6 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Scrollable content */}
      <div className="relative h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-10 pt-14 pb-24">

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-40 select-none">
              <p className="text-zinc-300 text-sm tracking-wide">
                Start speaking to generate content
              </p>
            </div>
          )}

          {/* Thinking indicator */}
          {isThinking && (
            <div className="mb-6 flex items-center gap-2.5">
              <ThinkingDots />
              <span className="text-sm text-zinc-400">Thinking…</span>
            </div>
          )}

          {/* Web search results */}
          {searchResults.length > 0 && (
            <div className="mb-6 flex flex-col gap-2">
              {searchResults.map((r, i) => (
                <div
                  key={i}
                  className="rounded-md border border-blue-100 bg-white/70 px-4 py-3"
                >
                  <p className="text-xs font-medium text-blue-500 mb-1">
                    Search:{" "}
                    <span className="font-normal text-blue-400">
                      {String((r.input as any).query ?? "")}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500 line-clamp-2">{r.preview}</p>
                </div>
              ))}
            </div>
          )}

          {/* Blocks */}
          {blocks.length > 0 && (
            <div
              key={renderKey}
              className={exiting ? "canvas-blocks-exit" : ""}
            >
              {blocks.map((block, i) => (
                <div
                  key={block.id}
                  className="canvas-block-enter"
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  <BlockRenderer block={block} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 items-center">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-zinc-400 thinking-dot"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

function BlockRenderer({ block }: { block: UIBlock }) {
  if (block.kind === "markdown") {
    return <MarkdownBlock text={String(block.payload.text ?? "")} />;
  }

  if (block.kind === "chartjs") {
    const config = block.payload.config;
    if (!config || typeof config !== "object") return null;
    return (
      <div className="mb-5 rounded-xl bg-white border border-zinc-100 shadow-sm p-5">
        <ChartBlock config={config as object} />
      </div>
    );
  }

  if (block.kind === "mermaid") {
    return (
      <div className="mb-4 rounded-xl bg-white border border-zinc-100 shadow-sm p-5">
        <pre className="text-xs text-zinc-500 font-mono overflow-auto whitespace-pre-wrap">
          {String(block.payload.source ?? "")}
        </pre>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl bg-white border border-zinc-100 shadow-sm p-4">
      <pre className="text-xs text-zinc-400 overflow-auto">
        {JSON.stringify(block.payload, null, 2)}
      </pre>
    </div>
  );
}

function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-zinc-800 mt-5 mb-1.5 leading-snug">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-xl font-semibold text-zinc-900 mt-6 mb-2 leading-snug">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-2xl font-bold text-zinc-900 mt-2 mb-3 leading-tight">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-2.5 mb-1">
          <span className="text-zinc-400 mt-0.5 shrink-0">•</span>
          <p className="text-[15px] text-zinc-700 leading-relaxed">{line.slice(2)}</p>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-[15px] text-zinc-700 leading-relaxed mb-1">
          {line}
        </p>
      );
    }

    i++;
  }

  return <div className="mb-4">{elements}</div>;
}
