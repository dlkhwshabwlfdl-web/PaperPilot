import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuditLogger, type AuditEntry } from "../src/audit.js";
import type { PaperPilotConfig, Tier } from "../src/config.js";
import { createTools, isCommandAllowed, parsePluginsOutput, parseTpsOutput, ToolDeniedError, type ToolDefinition } from "../src/tools.js";
import { FakeRcon } from "./fake-rcon.js";

function makeConfig(overrides: Partial<PaperPilotConfig> = {}): {
  config: PaperPilotConfig;
  auditPath: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "paperpilot-tools-"));
  const auditPath = join(dir, "audit.jsonl");
  const config: PaperPilotConfig = {
    rconHost: "127.0.0.1",
    rconPort: 25575,
    rconPassword: "secret",
    tier: "readonly",
    allowlist: ["say", "time set"],
    logPath: join(dir, "latest.log"),
    auditLogPath: auditPath,
    ...overrides,
  };
  return { config, auditPath };
}

function getTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

function readAudit(auditPath: string): AuditEntry[] {
  return readFileSync(auditPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as AuditEntry);
}

const STATUS_RESPONSES = {
  version:
    "This server is running Paper version 1.21.4-232-ver/1.21.4 (MC: 1.21.4) (Implementing API version 1.21.4-R0.1-SNAPSHOT)",
  list: "There are 2 of a max of 20 players online: Steve, Alex",
  tps: "TPS from last 1m, 5m, 15m: 20.0, 19.9, 19.8",
};

describe("isCommandAllowed", () => {
  const allowlist = ["say", "time set"];

  it("allows an exact prefix match", () => {
    expect(isCommandAllowed("say", allowlist)).toBe(true);
    expect(isCommandAllowed("say hello everyone", allowlist)).toBe(true);
  });

  it("allows a multi-word prefix on a token boundary", () => {
    expect(isCommandAllowed("time set day", allowlist)).toBe(true);
    expect(isCommandAllowed("TIME SET 6000", allowlist)).toBe(true);
  });

  it("rejects commands that merely start with the same letters", () => {
    expect(isCommandAllowed("sayonara", allowlist)).toBe(false);
    expect(isCommandAllowed("time", allowlist)).toBe(false);
  });

  it("rejects non-allowlisted and empty commands", () => {
    expect(isCommandAllowed("op Steve", allowlist)).toBe(false);
    expect(isCommandAllowed("gamemode creative Steve", allowlist)).toBe(false);
    expect(isCommandAllowed("", allowlist)).toBe(false);
    expect(isCommandAllowed("say hi", [])).toBe(false);
  });
});

describe("tier enforcement", () => {
  it("readonly can read status and players", async () => {
    const { config } = makeConfig({ tier: "readonly" as Tier });
    const rcon = new FakeRcon(STATUS_RESPONSES);
    const tools = createTools({ config, rcon, audit: new AuditLogger(config.auditLogPath) });

    const status = await getTool(tools, "server_status").handler({});
    expect(status).toContain("1.21.4-232-ver/1.21.4");
    expect(status).toContain("2 / 20");
    expect(status).toContain("Steve, Alex");
    expect(status).toContain("TPS (1m/5m/15m): 20, 19.9, 19.8");

    const players = await getTool(tools, "list_players").handler({});
    expect(players).toContain("Steve");
    expect(rcon.sent).toEqual(["version", "list", "tps", "list"]);
  });

  it("readonly cannot kick, ban, whitelist or run commands — and nothing reaches RCON", async () => {
    const { config } = makeConfig({ tier: "readonly" as Tier });
    const rcon = new FakeRcon();
    const tools = createTools({ config, rcon, audit: new AuditLogger(config.auditLogPath) });

    await expect(getTool(tools, "kick_player").handler({ player: "Steve" })).rejects.toThrow(
      ToolDeniedError,
    );
    await expect(getTool(tools, "ban_player").handler({ player: "Steve" })).rejects.toThrow(
      /requires the "admin" tier/,
    );
    await expect(
      getTool(tools, "whitelist_add").handler({ player: "Steve" }),
    ).rejects.toThrow(ToolDeniedError);
    await expect(
      getTool(tools, "run_command").handler({ command: "say hi" }),
    ).rejects.toThrow(ToolDeniedError);
    await expect(getTool(tools, "backup_world").handler({})).rejects.toThrow(ToolDeniedError);
    expect(rcon.sent).toEqual([]);
  });

  it("operator can kick and whitelist but cannot ban or run commands", async () => {
    const { config } = makeConfig({ tier: "operator" as Tier });
    const rcon = new FakeRcon({}, "");
    const tools = createTools({ config, rcon, audit: new AuditLogger(config.auditLogPath) });

    await getTool(tools, "kick_player").handler({ player: "Steve", reason: "AFK" });
    await getTool(tools, "whitelist_add").handler({ player: "Alex" });
    await getTool(tools, "whitelist_remove").handler({ player: "Alex" });
    expect(rcon.sent).toEqual([
      "kick Steve AFK",
      "whitelist add Alex",
      "whitelist remove Alex",
    ]);

    await expect(getTool(tools, "ban_player").handler({ player: "Steve" })).rejects.toThrow(
      ToolDeniedError,
    );
    await expect(
      getTool(tools, "run_command").handler({ command: "say hi" }),
    ).rejects.toThrow(ToolDeniedError);
    await expect(getTool(tools, "backup_world").handler({})).rejects.toThrow(ToolDeniedError);
    expect(rcon.sent).toHaveLength(3);
  });

  it("admin can ban and run the backup sequence in order", async () => {
    const { config } = makeConfig({ tier: "admin" as Tier });
    const rcon = new FakeRcon(
      {
        "save-all": "Saved the game",
        "save-off": "Automatic saving is now disabled",
        "save-on": "Automatic saving is now enabled",
      },
      "",
    );
    const tools = createTools({ config, rcon, audit: new AuditLogger(config.auditLogPath) });

    await getTool(tools, "ban_player").handler({ player: "Griefer" });
    const backup = await getTool(tools, "backup_world").handler({});
    expect(backup).toContain("save-all: Saved the game");
    expect(backup).toContain("save-off: Automatic saving is now disabled");
    expect(backup).toContain("save-on: Automatic saving is now enabled");
    expect(rcon.sent).toEqual(["ban Griefer", "save-all", "save-off", "save-on"]);
  });

  it("rejects invalid player names before touching RCON", async () => {
    const { config } = makeConfig({ tier: "admin" as Tier });
    const rcon = new FakeRcon();
    const tools = createTools({ config, rcon, audit: new AuditLogger(config.auditLogPath) });

    await expect(
      getTool(tools, "kick_player").handler({ player: "bad name; op me" }),
    ).rejects.toThrow(/Invalid player/);
    expect(rcon.sent).toEqual([]);
  });
});

describe("run_command allowlist enforcement", () => {
  it("admin can run an allowlisted command", async () => {
    const { config } = makeConfig({ tier: "admin" as Tier });
    const rcon = new FakeRcon({ "say hello": "[Server] hello" });
    const tools = createTools({ config, rcon, audit: new AuditLogger(config.auditLogPath) });

    const out = await getTool(tools, "run_command").handler({ command: "say hello" });
    expect(out).toBe("[Server] hello");
    expect(rcon.sent).toEqual(["say hello"]);
  });

  it("admin is rejected for a non-allowlisted command and nothing reaches RCON", async () => {
    const { config } = makeConfig({ tier: "admin" as Tier });
    const rcon = new FakeRcon();
    const tools = createTools({ config, rcon, audit: new AuditLogger(config.auditLogPath) });

    await expect(
      getTool(tools, "run_command").handler({ command: "op Steve" }),
    ).rejects.toThrow(/does not match the configured allowlist/);
    await expect(
      getTool(tools, "run_command").handler({ command: "stop" }),
    ).rejects.toThrow(ToolDeniedError);
    expect(rcon.sent).toEqual([]);
  });
});

describe("list_plugins", () => {
  it("parses a normal plugin list, stripping colour codes", () => {
    expect(parsePluginsOutput("Plugins (3): §aPaperPilot, §cWorldEdit, Vault")).toEqual([
      "PaperPilot",
      "WorldEdit",
      "Vault",
    ]);
  });

  it("returns an empty array for an empty list", () => {
    expect(parsePluginsOutput("Plugins (0):")).toEqual([]);
  });

  it("returns null for output in an unexpected shape", () => {
    expect(parsePluginsOutput("Something went wrong")).toBeNull();
  });

  it("is readonly and reports the list through RCON", async () => {
    const { config } = makeConfig({ tier: "readonly" as Tier });
    const rcon = new FakeRcon({ plugins: "Plugins (2): PaperPilot, Vault" });
    const tools = createTools({ config, rcon, audit: new AuditLogger(config.auditLogPath) });

    const out = await getTool(tools, "list_plugins").handler({});
    expect(out).toBe("2 plugin(s): PaperPilot, Vault");
    expect(rcon.sent).toEqual(["plugins"]);
  });

  it("reports an empty server cleanly", async () => {
    const { config } = makeConfig({ tier: "readonly" as Tier });
    const rcon = new FakeRcon({ plugins: "Plugins (0):" });
    const tools = createTools({ config, rcon, audit: new AuditLogger(config.auditLogPath) });

    await expect(getTool(tools, "list_plugins").handler({})).resolves.toBe(
      "No plugins installed.",
    );
  });
});

describe("parseTpsOutput", () => {
  it("parses the 1m/5m/15m TPS triple", () => {
    expect(parseTpsOutput("TPS from last 1m, 5m, 15m: 20.0, 19.9, 19.8")).toEqual({
      tps: [20, 19.9, 19.8],
      mspt: null,
    });
  });

  it("picks up MSPT when the server reports it, stripping colour codes", () => {
    expect(
      parseTpsOutput("TPS from last 1m, 5m, 15m: §a20.0, 20.0, 19.9\nMSPT: 12.4"),
    ).toEqual({ tps: [20, 20, 19.9], mspt: 12.4 });
  });

  it("returns null for output in an unexpected shape", () => {
    expect(parseTpsOutput("Something went wrong")).toBeNull();
  });

  it("falls back to the raw TPS line through server_status", async () => {
    const { config } = makeConfig({ tier: "readonly" as Tier });
    const rcon = new FakeRcon({ tps: "TPS unavailable" });
    const tools = createTools({ config, rcon, audit: new AuditLogger(config.auditLogPath) });

    const status = await getTool(tools, "server_status").handler({});
    expect(status).toContain("TPS (raw): TPS unavailable");
  });
});

describe("audit log", () => {
  it("records allowed and denied calls with tool, tier and outcome", async () => {
    const { config, auditPath } = makeConfig({ tier: "operator" as Tier });
    const rcon = new FakeRcon({}, "");
    const tools = createTools({ config, rcon, audit: new AuditLogger(auditPath) });

    await getTool(tools, "kick_player").handler({ player: "Steve" });
    await expect(getTool(tools, "ban_player").handler({ player: "Steve" })).rejects.toThrow(
      ToolDeniedError,
    );

    const entries = readAudit(auditPath);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ tool: "kick_player", outcome: "allowed", tier: "operator" });
    expect(entries[0].args).toContain("Steve");
    expect(entries[0].ts).toBeTruthy();
    expect(entries[1]).toMatchObject({ tool: "ban_player", outcome: "denied", tier: "operator" });
    expect(entries[1].detail).toContain('requires the "admin" tier');
  });
});
