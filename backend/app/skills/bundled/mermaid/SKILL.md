# Mermaid Diagrams

Use this skill to emit flowcharts, concept maps, sequence diagrams, and box diagrams as `mermaid` canvas blocks.

## Block format

```json
{"kind": "mermaid", "payload": {"source": "<mermaid syntax>"}}
```

## When to use

- Process flows, pipelines, cycles (water cycle, cell cycle, software lifecycle)
- Concept relationships, taxonomy, hierarchy
- Decision trees, branching logic
- Cause-and-effect chains
- System architecture (boxes and arrows)

Always pair a mermaid block with a short `markdown` block that narrates what the diagram shows.

## Flowchart (most common — use for processes and concept maps)

```
graph TD
    A[Evaporation] --> B[Water Vapour]
    B --> C[Condensation]
    C --> D[Precipitation]
    D --> E[Runoff]
    E --> A
```

Produces a top-down directed graph. Use `LR` for left-right layouts.

## Box diagram / concept map

```
graph LR
    TOPIC(["📚 Machine Learning"])
    TOPIC --> SUP["Supervised"]
    TOPIC --> UNSUP["Unsupervised"]
    TOPIC --> RL["Reinforcement"]
    SUP --> REG["Regression"]
    SUP --> CLS["Classification"]
    UNSUP --> CLUST["Clustering"]
    UNSUP --> DIM["Dimensionality Reduction"]
```

Use `(["..."])` for rounded pill nodes (topic headers), `["..."]` for rectangular boxes (concepts).

## Sequence diagram (for step-by-step protocols or interactions)

```
sequenceDiagram
    participant U as User
    participant LLM as Claude
    participant DB as Database
    U->>LLM: Ask question
    LLM->>DB: Query context
    DB-->>LLM: Return results
    LLM-->>U: Answer
```

## State diagram (for lifecycle / status flows)

```
stateDiagram-v2
    [*] --> Idle
    Idle --> Active: start()
    Active --> Processing: input()
    Processing --> Active: done()
    Active --> Idle: stop()
    Idle --> [*]
```

## Rules

- Keep node labels concise (≤ 4 words).
- Maximum 12 nodes per diagram — split into multiple blocks if needed.
- No special characters inside node labels except emoji and spaces.
- Use `graph TD` by default; switch to `LR` only when the flow is clearly horizontal.
- Always escape quotes inside labels: use single quotes or rephrase.
- Do NOT include ```mermaid fences — emit only raw mermaid syntax in the `source` field.
