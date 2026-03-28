"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
  fontFamily: "Inter, system-ui, sans-serif",
});

let _counter = 0;

export function MermaidBlock({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current || !source?.trim()) return;
    const id = `mermaid-${++_counter}`;
    setError(null);
    mermaid
      .render(id, source.trim())
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch((err) => {
        setError(String(err?.message ?? err));
      });
  }, [source]);

  if (error) {
    return (
      <pre className="text-xs text-red-500 bg-red-50 dark:bg-red-950 rounded p-2 overflow-auto">
        {error}
      </pre>
    );
  }

  return <div ref={ref} className="w-full overflow-auto flex justify-center" />;
}
