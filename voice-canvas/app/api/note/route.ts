import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a smart lecture note-taking assistant. Given a snippet of lecture audio transcript, extract the most important information and return a single structured note block as JSON.

Return exactly one JSON object (no markdown, no explanation) with one of these shapes:

{ "type": "heading", "text": "..." }
  → Use when the lecturer introduces a new topic, chapter, or section

{ "type": "definition", "term": "...", "text": "..." }
  → Use when a concept or term is being defined or explained

{ "type": "point", "text": "..." }
  → Use for key facts, important concepts, or takeaways

{ "type": "example", "text": "..." }
  → Use when the lecturer gives a concrete example or illustration

{ "type": "ignore" }
  → Use for filler words, transitions, greetings, or content not worth noting

Rules:
- Be concise — these are notes, not transcripts. Distill the idea.
- Only return one block per call. Pick the most important thing.
- Return ONLY valid JSON. No other text.`;

export async function POST(request: Request) {
  const { transcript } = await request.json();

  if (!transcript || transcript.trim().length < 10) {
    return Response.json({ type: "ignore" });
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Lecture transcript snippet: "${transcript}"`,
        },
      ],
    });

    const raw =
      message.content[0].type === "text" ? message.content[0].text.trim() : "";

    const block = JSON.parse(raw);
    return Response.json(block);
  } catch {
    return Response.json({ type: "ignore" });
  }
}
