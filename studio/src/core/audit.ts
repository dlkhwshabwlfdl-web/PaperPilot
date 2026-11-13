import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AuditOutcome = "allowed" | "denied";

export interface AuditEntry {
  /** ISO-8601 timestamp of the call. */
  ts: string;
  /** MCP tool name that was called. */
  tool: string;
  /** Short summary of the arguments (never the RCON password). */
  args: string;
  /** Whether the permission/allowlist checks let the call through. */
  outcome: AuditOutcome;
  /** The instance's configured permission tier at call time. */
  tier: string;
  /** Optional extra detail, e.g. the denial reason or an execution error. */
  detail?: string;
}

/** Summarize tool arguments for the audit log, truncated to keep lines small. */
export function summarizeArgs(args: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(args) ?? "";
  } catch {
    text = String(args);
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/**
 * Appends one JSON object per line to the audit log file. Writes are
 * synchronous on purpose: an audit entry must be on disk before the
 * corresponding tool call is considered complete.
 */
export class AuditLogger {
  constructor(private readonly filePath: string) {}

  log(entry: AuditEntry): void {
    const dir = dirname(this.filePath);
    if (dir && dir !== ".") {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
