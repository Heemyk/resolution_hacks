/**
 * Shared structured logging (schema aligns with backend app/core/log_constants.py).
 */

export const LOG_SCHEMA_VERSION = 1 as const;
export const LOG_SERVICE = "resolution" as const;

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLevel(): LogLevel {
  const raw = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? "debug").toLowerCase();
  if (raw === "info" || raw === "warn" || raw === "error" || raw === "debug") return raw;
  return "debug";
}

const MIN_LEVEL = envLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, v) => {
        if (typeof v === "bigint") return v.toString();
        if (v instanceof Error)
          return { name: v.name, message: v.message, stack: v.stack ?? null };
        return v;
      },
      0,
    );
  } catch {
    try {
      return JSON.stringify(String(value));
    } catch {
      return '"[unserializable]"';
    }
  }
}

/** One JSON line per log entry; uses console.* by level. */
export function structuredLog(
  level: LogLevel,
  component: string,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  if (!shouldLog(level)) return;
  const entry = {
    log_schema_version: LOG_SCHEMA_VERSION,
    service: LOG_SERVICE,
    ts: new Date().toISOString(),
    level,
    component,
    event,
    ...fields,
  };
  const line = safeJson(entry);
  switch (level) {
    case "debug":
      console.debug(line);
      break;
    case "info":
      console.info(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

export async function loggedFetch(
  component: string,
  eventPrefix: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
  let requestBody: unknown = init?.body;
  if (typeof requestBody === "string") {
    try {
      requestBody = JSON.parse(requestBody);
    } catch {
      /* keep string */
    }
  }
  structuredLog("info", component, `${eventPrefix}.request`, {
    url,
    method: init?.method ?? "GET",
    headers: init?.headers ? Object.fromEntries(new Headers(init.headers as HeadersInit)) : undefined,
    body: requestBody ?? null,
  });
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    structuredLog("error", component, `${eventPrefix}.network_error`, {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  const elapsed_ms = typeof performance !== "undefined" ? Math.round(performance.now() - t0) : null;
  const text = await res.clone().text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* raw text */
  }
  structuredLog("info", component, `${eventPrefix}.response`, {
    url,
    status: res.status,
    ok: res.ok,
    elapsed_ms,
    body: parsed,
  });
  return res;
}
