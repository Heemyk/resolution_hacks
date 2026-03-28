"""
Orchestrator: single fast LLM call that:
  1. Detects whether the transcript directly addresses the agent by name ("direct")
     or is passive lecture/conversation content ("passive").
  2. Generates a tailored, context-specific system prompt for the worker agent.

The orchestrator does NOT have tools — it is a pure classifier + prompt-builder.
"""

from __future__ import annotations

import json
import re
import structlog

from app.services.adapters.llm import LLMAdapter

log = structlog.get_logger(__name__)

# ── Few-shot examples injected into the orchestrator system prompt ────────────

_FEW_SHOTS = """
## Examples

### Example 1 — Passive lecture (science process)
Transcript: "The water cycle involves evaporation from the ocean, condensation into clouds, precipitation as rain or snow, and runoff back to the sea."
Output:
{
  "mode": "passive",
  "focus": "water cycle stages",
  "worker_prompt": "The user is attending a live lecture. The speaker just described the water cycle.\\n\\nYour job:\\n1. Emit a mermaid flowchart showing the 4 stages (evaporation → condensation → precipitation → runoff) as a cycle.\\n2. Emit a markdown block with a one-line definition of each stage.\\n3. Emit a chartjs doughnut or bar block if there is any quantitative data worth visualising.\\nKeep text tight — this is a live overlay, not an essay. Do not search the web unless a specific fact is ambiguous."
}

### Example 2 — Direct address (explanation request)
Transcript: "Simon, can you explain what a transformer neural network is?"
Output:
{
  "mode": "direct",
  "focus": "transformer neural network explanation",
  "worker_prompt": "The user directly asked: 'Can you explain what a transformer neural network is?'\\n\\nYour job:\\n1. Emit a markdown block with a clear 3-paragraph explanation: what it is, how attention works, why it matters.\\n2. Emit a mermaid diagram showing the encoder-decoder architecture with attention.\\n3. Search the web for the original 'Attention is All You Need' paper year and key benchmark numbers, then include them in the markdown.\\nBe direct and educational. The user is asking you a question — answer it fully."
}

### Example 3 — Passive lecture (abstract concept, no data)
Transcript: "Keynesian economics argues that aggregate demand is the primary driver of economic output and employment, and that government spending can offset private-sector downturns."
Output:
{
  "mode": "passive",
  "focus": "Keynesian economics key ideas",
  "worker_prompt": "The user is in a lecture on economics. The speaker introduced Keynesian economics.\\n\\nYour job:\\n1. Emit a mermaid concept-map showing: Keynesian Economics → Aggregate Demand → Output & Employment; also show Government Spending → Aggregate Demand.\\n2. Emit a markdown block listing the 3 core Keynesian claims as bullet points.\\n3. Search for a concrete historical example of Keynesian stimulus (e.g., New Deal, 2008 stimulus) and add a 1-sentence note in the markdown.\\nFocus on clarity and visual structure — this is for a student taking live notes."
}

### Example 4 — Direct address (data/comparison request)
Transcript: "Hey Simon, compare Python, JavaScript, and Rust in terms of performance, ease of use, and ecosystem."
Output:
{
  "mode": "direct",
  "focus": "language comparison: Python vs JS vs Rust",
  "worker_prompt": "The user asked Simon to compare Python, JavaScript, and Rust across three dimensions.\\n\\nYour job:\\n1. Emit a chartjs radar chart with axes: Performance, Ease of Use, Ecosystem — one dataset per language. Use plausible scores 1–10 and note they are approximate.\\n2. Emit a markdown table summarising each language's strengths and primary use cases.\\n3. Search for the 2024 Stack Overflow Developer Survey language popularity data to ground the ecosystem scores.\\nBe concrete. The user wants a fast, scannable comparison."
}

### Example 5 — Passive lecture (historical narrative)
Transcript: "The French Revolution began in 1789 with the storming of the Bastille, followed by the Declaration of the Rights of Man, the Reign of Terror under Robespierre, and finally Napoleon's rise to power."
Output:
{
  "mode": "passive",
  "focus": "French Revolution timeline",
  "worker_prompt": "The user is in a history lecture. The speaker outlined the key phases of the French Revolution.\\n\\nYour job:\\n1. Emit a mermaid flowchart as a horizontal timeline: Storming of Bastille (1789) → Declaration of Rights of Man → Reign of Terror → Napoleon's Rise.\\n2. Emit a markdown block with one sentence on each event's significance.\\nDo not search — the facts are well-established and the speaker's account is sufficient."
}
"""

_ORCHESTRATOR_SYSTEM = """\
You are the orchestrator for an AI assistant named {agent_name}.

{agent_name} monitors live lectures and conversations. Your job is to analyse each incoming \
transcript chunk and return a JSON object (no prose, no markdown fences) with exactly these fields:

{{
  "mode": "direct" | "passive",
  "focus": "<3–8 word summary of the topic>",
  "worker_prompt": "<complete system prompt for the worker agent>"
}}

**mode rules**
- "direct"  → the speaker addresses {agent_name} by name (e.g. "{agent_name}, explain ...", \
"hey {agent_name}", "{agent_name} what is ..."). The worker should answer the question.
- "passive" → the speaker is delivering a lecture or holding a conversation without addressing \
{agent_name}. The worker should extract key concepts and produce visual canvas blocks.

**worker_prompt rules**
- Be specific: name the exact diagram type, search query, and block types to produce.
- Include numbered steps so the worker has a clear plan.
- For passive mode: always request a mermaid diagram that maps the conceptual structure, \
plus a tight markdown summary. Add a web search step only when live data would add genuine value.
- For direct mode: always answer the question fully, include a structural diagram when the \
concept has parts or a process, and search for supporting data or examples.
- Keep it under 250 words — the worker reads this as its full system prompt.

{few_shots}
"""


class Orchestrator:
    def __init__(self, llm: LLMAdapter, agent_name: str) -> None:
        self._llm = llm
        self._agent_name = agent_name
        self._system = _ORCHESTRATOR_SYSTEM.format(
            agent_name=agent_name,
            few_shots=_FEW_SHOTS,
        )

    async def plan(self, transcript: str) -> dict:
        """
        Returns {"mode": "direct"|"passive", "focus": str, "worker_prompt": str}.
        Falls back to a safe passive default if parsing fails.
        """
        log.info(
            "orchestrator.plan_start",
            agent_name=self._agent_name,
            transcript_preview=transcript[:200],
        )
        raw = await self._llm.complete(
            model="claude-haiku-4-5-20251001",  # fast + cheap for classification
            system=self._system,
            messages=[{"role": "user", "content": f"Transcript:\n{transcript}"}],
            max_tokens=600,
        )
        log.info("orchestrator.plan_raw", raw=raw[:500])

        # Strip optional markdown fences
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.DOTALL)
        try:
            result = json.loads(cleaned)
            mode = result.get("mode", "passive")
            focus = result.get("focus", "lecture content")
            worker_prompt = result.get("worker_prompt", "")
            if not worker_prompt:
                raise ValueError("empty worker_prompt")
            log.info(
                "orchestrator.plan_done",
                mode=mode,
                focus=focus,
                worker_prompt_len=len(worker_prompt),
            )
            return {"mode": mode, "focus": focus, "worker_prompt": worker_prompt}
        except Exception as exc:
            log.warning(
                "orchestrator.plan_parse_failed",
                error=str(exc),
                raw_preview=raw[:300],
            )
            return {
                "mode": "passive",
                "focus": "lecture content",
                "worker_prompt": (
                    f"The user is in a live lecture. Extract the key concepts from this transcript "
                    f"and produce: (1) a mermaid concept map of the main ideas, "
                    f"(2) a markdown summary with bullet points for each concept."
                ),
            }
