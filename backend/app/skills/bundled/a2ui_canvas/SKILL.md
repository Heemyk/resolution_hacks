# A2UI Canvas

Use this skill when emitting structured UI for the live canvas.

## Output format

Respond ONLY with a JSON array of block objects — no prose, no markdown fences, no explanation outside the JSON.

```json
[
  {"kind": "markdown", "payload": {"text": "..."}},
  {"kind": "chartjs", "payload": {"config": {...}}}
]
```

## Block kinds

| Kind | Payload | Use for |
|------|---------|---------|
| `markdown` | `{"text": "..."}` | Text, analysis, summaries, answers |
| `chartjs` | `{"config": <Chart.js config>} ` | Data visualisation — see chartjs skill |
| `mermaid` | `{"source": "..."}` | Flowcharts, diagrams |

## Rules

- Always emit at least one `markdown` block.
- Add a `chartjs` block whenever the content involves data or metrics.
- Keep payloads JSON-serialisable (no JS functions or undefined values).
- The Next app maps each block to a React component by `kind`.
