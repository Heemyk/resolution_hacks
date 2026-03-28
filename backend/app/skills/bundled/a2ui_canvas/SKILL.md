# A2UI Canvas

Use this skill when emitting structured UI for the live canvas.

- Prefer declarative blocks: `component`, `mermaid`, `image`, `markdown`.
- Keep payloads JSON-serialisable; the Next app maps them to React Server Components or client islands.
- For flowcharts, put Mermaid source in `payload.source` with kind `mermaid`.
