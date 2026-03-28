import { NextRequest } from "next/server";
import { enqueue, claim, complete, fail, list, get, type TranscriptEvent } from "@/app/lib/task-queue";

/**
 * GET /api/tasks
 *
 * Query params:
 *   ?action=claim&agentId=<id>   — claim the next pending task
 *   ?action=get&taskId=<id>      — get a specific task
 *   ?status=pending|claimed|...  — list tasks filtered by status
 *   (no params)                  — list all tasks
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  if (action === "claim") {
    const agentId = searchParams.get("agentId");
    if (!agentId) {
      return Response.json({ error: "agentId is required" }, { status: 400 });
    }
    const task = claim(agentId);
    if (!task) {
      return Response.json({ task: null, message: "No pending tasks" });
    }
    return Response.json({ task });
  }

  if (action === "get") {
    const taskId = searchParams.get("taskId");
    if (!taskId) {
      return Response.json({ error: "taskId is required" }, { status: 400 });
    }
    const task = get(taskId);
    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }
    return Response.json({ task });
  }

  const status = searchParams.get("status") as Parameters<typeof list>[0];
  return Response.json({ tasks: list(status ?? undefined) });
}

/**
 * POST /api/tasks
 *
 * Body (enqueue):
 *   { "action": "enqueue", "payload": { role, text, timestamp } }
 *
 * Body (complete):
 *   { "action": "complete", "taskId": "<id>", "result": ... }
 *
 * Body (fail):
 *   { "action": "fail", "taskId": "<id>", "result": ... }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === "enqueue") {
    const payload = body.payload as TranscriptEvent;
    if (!payload?.role || !payload?.text) {
      return Response.json(
        { error: "payload must include role and text" },
        { status: 400 }
      );
    }
    const task = enqueue(payload);
    return Response.json({ task }, { status: 201 });
  }

  if (action === "complete") {
    const task = complete(body.taskId, body.result);
    if (!task) {
      return Response.json(
        { error: "Task not found or not in claimed state" },
        { status: 404 }
      );
    }
    return Response.json({ task });
  }

  if (action === "fail") {
    const task = fail(body.taskId, body.result);
    if (!task) {
      return Response.json(
        { error: "Task not found or not in claimed state" },
        { status: 404 }
      );
    }
    return Response.json({ task });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
