"use client";

import { useId } from "react";
import VoiceChat from "./voice-chat";
import { LiveCanvasPanel } from "../LiveCanvasPanel";

export function VoiceCanvasLayout() {
  const reactId = useId();
  const sessionId = `session-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className="h-full w-full flex overflow-hidden">
      {/* Left: voice control sidebar */}
      <div
        className="shrink-0 flex flex-col overflow-hidden border-r border-white/5"
        style={{ width: 320, backgroundColor: "#111111" }}
      >
        <VoiceChat sessionId={sessionId} />
      </div>

      {/* Right: live canvas */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <LiveCanvasPanel sessionId={sessionId} />
      </div>
    </div>
  );
}
