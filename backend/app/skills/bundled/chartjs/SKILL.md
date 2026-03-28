# Chart.js Canvas Blocks

Use this skill when the user's transcript contains data, metrics, trends, comparisons, or anything that would benefit from a visual chart.

## Block format

Emit a `chartjs` UIBlock with `payload.config` set to a valid Chart.js configuration object:

```json
{"kind": "chartjs", "payload": {"config": <Chart.js config>}}
```

`config` must be pure JSON — no JavaScript functions, no `undefined`, no callbacks.

## Supported chart types

| Type | Use when |
|------|----------|
| `bar` | Comparing categories, rankings |
| `line` | Trends over time, continuous data |
| `pie` / `doughnut` | Part-to-whole relationships (≤6 slices) |
| `radar` | Multi-axis comparisons (e.g. skill profiles) |
| `scatter` | Correlation between two variables |

## Minimal config shape

```json
{
  "type": "bar",
  "data": {
    "labels": ["Jan", "Feb", "Mar"],
    "datasets": [
      {
        "label": "Revenue ($k)",
        "data": [42, 58, 71],
        "backgroundColor": ["#6366f1", "#8b5cf6", "#a78bfa"]
      }
    ]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "legend": {"position": "top"},
      "title": {"display": true, "text": "Q1 Revenue"}
    }
  }
}
```

## Multi-dataset line chart

```json
{
  "type": "line",
  "data": {
    "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
    "datasets": [
      {"label": "Series A", "data": [10, 14, 11, 18, 22], "borderColor": "#6366f1", "tension": 0.4},
      {"label": "Series B", "data": [8, 9, 13, 15, 19], "borderColor": "#f59e0b", "tension": 0.4}
    ]
  },
  "options": {"responsive": true}
}
```

## Doughnut

```json
{
  "type": "doughnut",
  "data": {
    "labels": ["Engineering", "Sales", "Support"],
    "datasets": [{"data": [45, 30, 25], "backgroundColor": ["#6366f1", "#f59e0b", "#10b981"]}]
  },
  "options": {"responsive": true, "plugins": {"legend": {"position": "bottom"}}}
}
```

## Rules

- Always set `"responsive": true` in options.
- Use concise labels (≤ 20 chars).
- Limit datasets to ≤ 5 for readability.
- Pair a `chartjs` block with a short `markdown` block that explains what the chart shows.
- If you don't have real data, use plausible illustrative numbers and note they are approximate.
