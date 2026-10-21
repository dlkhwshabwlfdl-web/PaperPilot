import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const BASE_ENV = { RCON_PASSWORD: "secret" };

function loadWithFile(fileContents: unknown, env: NodeJS.ProcessEnv = BASE_ENV) {
  const dir = mkdtempSync(join(tmpdir(), "paperpilot-config-"));
  const configPath = join(dir, "paperpilot.config.json");
  if (fileContents !== undefined) {
    writeFileSync(
      configPath,
      typeof fileContents === "string" ? fileContents : JSON.stringify(fileContents),
    );
  }
  return loadConfig({ configPath, env, cwd: dir });
}

describe("loadConfig", () => {
  it("applies defaults when no config file exists", () => {
    const config = loadWithFile(undefined);
    expect(config.rconHost).toBe("127.0.0.1");
    expect(config.rconPort).toBe(25575);
    expect(config.rconPassword).toBe("secret");
    expect(config.tier).toBe("readonly");
    expect(config.allowlist).toEqual([]);
    expect(config.logPath).toBe("logs/latest.log");
    expect(config.auditLogPath).toBe("paperpilot-audit.log");
  });

  it("reads tier, allowlist and paths from the config file", () => {
    const config = loadWithFile({
      tier: "operator",
      allowlist: ["say", "time set"],
      logPath: "server/logs/latest.log",
      auditLogPath: "audit.jsonl",
    });
    expect(config.tier).toBe("operator");
    expect(config.allowlist).toEqual(["say", "time set"]);
    expect(config.logPath).toBe("server/logs/latest.log");
    expect(config.auditLogPath).toBe("audit.jsonl");
  });

  it("lets env vars override RCON host and port", () => {
    const config = loadWithFile(undefined, {
      RCON_PASSWORD: "secret",
      RCON_HOST: "10.0.0.5",
      RCON_PORT: "25576",
    });
    expect(config.rconHost).toBe("10.0.0.5");
    expect(config.rconPort).toBe(25576);
  });

  it("rejects a missing RCON_PASSWORD", () => {
    expect(() => loadWithFile(undefined, {})).toThrow(ConfigError);
    expect(() => loadWithFile(undefined, {})).toThrow(/RCON_PASSWORD/);
  });

  it("rejects an invalid tier", () => {
    expect(() => loadWithFile({ tier: "superuser" })).toThrow(/Invalid permission tier/);
  });

  it("rejects an out-of-range RCON_PORT", () => {
    expect(() =>
      loadWithFile(undefined, { RCON_PASSWORD: "x", RCON_PORT: "70000" }),
    ).toThrow(/RCON_PORT/);
    expect(() =>
      loadWithFile(undefined, { RCON_PASSWORD: "x", RCON_PORT: "abc" }),
    ).toThrow(/RCON_PORT/);
  });

  it("rejects a malformed allowlist", () => {
    expect(() => loadWithFile({ allowlist: "say" })).toThrow(/allowlist/);
    expect(() => loadWithFile({ allowlist: [42] })).toThrow(/allowlist/);
  });

  it("rejects unparseable JSON with a clear error", () => {
    expect(() => loadWithFile("{not json")).toThrow(/Could not parse config file/);
  });
});
