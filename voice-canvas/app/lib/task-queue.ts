export type TaskStatus = "pending" | "claimed" | "completed" | "failed";

export interface TranscriptEvent {
  role: "user" | "gemini";
  text: string;
  timestamp: string;
}

export interface Task {
  id: string;
  type: "transcript";
  status: TaskStatus;
  payload: TranscriptEvent;
  createdAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  result: unknown | null;
}

let nextId = 1;
const tasks: Map<string, Task> = new Map();

export function enqueue(payload: TranscriptEvent): Task {
  const id = `task_${nextId++}`;
  const task: Task = {
    id,
    type: "transcript",
    status: "pending",
    payload,
    createdAt: new Date().toISOString(),
    claimedBy: null,
    claimedAt: null,
    completedAt: null,
    result: null,
  };
  tasks.set(id, task);
  return task;
}

/** Claim the oldest pending task. Returns null if none available. */
export function claim(agentId: string): Task | null {
  for (const task of tasks.values()) {
    if (task.status === "pending") {
      task.status = "claimed";
      task.claimedBy = agentId;
      task.claimedAt = new Date().toISOString();
      return task;
    }
  }
  return null;
}

/** Mark a claimed task as completed with an optional result. */
export function complete(taskId: string, result?: unknown): Task | null {
  const task = tasks.get(taskId);
  if (!task || task.status !== "claimed") return null;
  task.status = "completed";
  task.completedAt = new Date().toISOString();
  task.result = result ?? null;
  return task;
}

/** Mark a claimed task as failed with an optional result/error. */
export function fail(taskId: string, result?: unknown): Task | null {
  const task = tasks.get(taskId);
  if (!task || task.status !== "claimed") return null;
  task.status = "failed";
  task.completedAt = new Date().toISOString();
  task.result = result ?? null;
  return task;
}

/** List tasks, optionally filtering by status. */
export function list(status?: TaskStatus): Task[] {
  const all = Array.from(tasks.values());
  return status ? all.filter((t) => t.status === status) : all;
}

/** Get a single task by ID. */
export function get(taskId: string): Task | null {
  return tasks.get(taskId) ?? null;
}
