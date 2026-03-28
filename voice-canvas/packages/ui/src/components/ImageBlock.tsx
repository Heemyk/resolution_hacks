"use client";

import { useState } from "react";

type Props = {
  url: string;
  caption?: string;
  sourceUrl?: string;
};

export function ImageBlock({ url, caption, sourceUrl }: Props) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded text-xs"
        style={{
          height: 120,
          background: "var(--muted)",
          color: "var(--muted-foreground)",
        }}
      >
        Image unavailable
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div
        className="relative rounded overflow-hidden"
        style={{
          background: "var(--muted)",
          minHeight: loaded ? undefined : 80,
        }}
      >
        {!loaded && (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            Loading…
          </div>
        )}
        <img
          src={url}
          alt={caption ?? ""}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{
            width: "100%",
            height: "auto",
            maxHeight: 240,
            objectFit: "cover",
            display: loaded ? "block" : "none",
            borderRadius: 4,
          }}
        />
      </div>
      {caption && (
        <p
          className="text-xs leading-relaxed"
          style={{ color: "var(--muted-foreground)" }}
        >
          {caption}
          {sourceUrl && (
            <>
              {" "}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", textDecoration: "underline" }}
              >
                source
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
