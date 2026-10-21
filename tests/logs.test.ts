import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuditLogger } from "../src/audit.js";
import type { PaperPilotConfig } from "../src/config.js";
import { createTools, tailLog, type ToolDefinition } from "../src/tools.js";
import { FakeRcon } from "./fake-rcon.js";

const LOG_LINES = [
  "[10:00:01] [Server thread/INFO]: Starting minecraft server version 1.21.4",
  "[10:00:02] [Server thread/INFO]: Loading level \"world\"",
  "[10:00:03] [Server thread/WARN]: Can't keep up! Is the server overloaded?",
  "[10:00:04] [Server thread/INFO]: Steve joined the game",
  "[10:00:05] [Server thread/ERROR]: Failed to save player data for Steve",
  "[10:00:06] [Server thread/INFO]: Alex joined the game",
  "[10:00:07] [Server thread/INFO]: Steve issued server command: /gamemode creative",
  "[10:00:08] [Server thread/WARN]: Steve moved too quickly!",
  "[10:00:09] [Server thread/INFO]: Done (2.345s)!",
  "[10:00:10] [Server thread/INFO]: Alex left the game",
];

function setup(): { readLogs: ToolDefinition; logPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "paperpilot-logs-"));
  const logPath = join(dir, "latest.log");
  writeFileSync(logPath, `${LOG_LINES.join("\n")}\n`);
  const config: PaperPilotConfig = {
    rconHost: "127.0.0.1",
    rconPort: 25575,
    rconPassword: "secret",
    tier: "readonly",
    allowlist: [],
    logPath,
    auditLogPath: join(dir, "audit.jsonl"),
  };
  const tools = createTools({ config, rcon: new FakeRcon(), audit: new AuditLogger(config.auditLogPath) });
  const readLogs = tools.find((t) => t.name === "read_logs");
  if (!readLogs) throw new Error("read_logs tool missing");
  return { readLogs, logPath };
}

describe("tailLog", () => {
  it("returns the last N lines", () => {
    expect(tailLog(LOG_LINES.join("\n"), 3)).toEqual(LOG_LINES.slice(-3));
  });

  it("filters by a case-insensitive substring before tailing", () => {
    expect(tailLog(LOG_LINES.join("\n"), 50, "warn")).toEqual([LOG_LINES[2], LOG_LINES[7]]);
    expect(tailLog(LOG_LINES.join("\n"), 1, "joined")).toEqual([LOG_LINES[5]]);
  });

  it("handles a trailing newline and empty content", () => {
    expect(tailLog("a\nb\n", 5)).toEqual(["a", "b"]);
    expect(tailLog("", 5)).toEqual([]);
  });
});

describe("read_logs tool", () => {
  it("tails the configured log file", async () => {
    const { readLogs } = setup();
    const out = await readLogs.handler({ lines: 2 });
    expect(out).toBe([LOG_LINES[8], LOG_LINES[9]].join("\n"));
  });

  it("searches the log file", async () => {
    const { readLogs } = setup();
    const out = await readLogs.handler({ lines: 50, search: "ERROR" });
    expect(out).toBe(LOG_LINES[4]);
  });

  it("reports when nothing matches", async () => {
    const { readLogs } = setup();
    const out = await readLogs.handler({ lines: 50, search: "nonexistent-string" });
    expect(out).toContain("No log lines match");
  });

  it("errors clearly when the log file does not exist", async () => {
    const { readLogs, logPath } = setup();
    void logPath;
    const dir = mkdtempSync(join(tmpdir(), "paperpilot-logs-missing-"));
    const config: PaperPilotConfig = {
      rconHost: "127.0.0.1",
      rconPort: 25575,
      rconPassword: "secret",
      tier: "readonly",
      allowlist: [],
      logPath: join(dir, "nope.log"),
      auditLogPath: join(dir, "audit.jsonl"),
    };
    const tools = createTools({
      config,
      rcon: new FakeRcon(),
      audit: new AuditLogger(config.auditLogPath),
    });
    const tool = tools.find((t) => t.name === "read_logs");
    await expect(tool?.handler({})).rejects.toThrow(/Log file not found/);
    void readLogs;
  });
});
