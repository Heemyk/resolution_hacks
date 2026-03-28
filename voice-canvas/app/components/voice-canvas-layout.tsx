"use client";

import { useId } from "react";
import VoiceChat from "./voice-chat";
import { LiveCanvasPanel } from "../LiveCanvasPanel";

export function VoiceCanvasLayout() {
  // useId is stable across SSR + hydration; Math.random() in useState is not.
  const reactId = useId();
  const sessionId = `session-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className="h-full w-full grid grid-cols-2">
      {/* Left: voice visualizer + transcript */}
      <div className="h-full border-r border-foreground/10 overflow-hidden">
        <VoiceChat sessionId={sessionId} />
      </div>

      {/* Right: live canvas rendered by the agent via SSE */}
      <div className="h-full overflow-hidden">
        <LiveCanvasPanel sessionId={sessionId} />
      </div>
    </div>
  );
}
