import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Permission tiers, from least to most privileged. */
export const TIERS = ["readonly", "operator", "admin"] as const;
export type Tier = (typeof TIERS)[number];

const TIER_RANK: Record<Tier, number> = { readonly: 0, operator: 1, admin: 2 };

/** True when `actual` grants at least the privileges of `required`. */
export function tierAtLeast(actual: Tier, required: Tier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}

export interface PaperPilotConfig {
  /** RCON host (env RCON_HOST). */
  rconHost: string;
  /** RCON port (env RCON_PORT). */
  rconPort: number;
  /** RCON password (env RCON_PASSWORD). Never stored in the config file. */
  rconPassword: string;
  /** Active permission tier for this PaperPilot instance. */
  tier: Tier;
  /**
   * Allowed command prefixes for run_command. A command is allowed when its
   * text equals an entry or starts with an entry followed by a space
   * (case-insensitive), e.g. entry "time set" allows "time set day".
   */
  allowlist: string[];
  /** Path to the Minecraft server log file (for read_logs). */
  logPath: string;
  /** Path to the JSONL audit log file. */
  auditLogPath: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEFAULTS = {
  rconHost: "127.0.0.1",
  rconPort: 25575,
  tier: "readonly" as Tier,
  allowlist: [] as string[],
  logPath: "logs/latest.log",
  auditLogPath: "paperpilot-audit.log",
};

interface RawFileConfig {
  tier?: unknown;
  allowlist?: unknown;
  logPath?: unknown;
  auditLogPath?: unknown;
}

function parseTier(value: unknown, source: string): Tier {
  if (typeof value !== "string" || !(TIERS as readonly string[]).includes(value)) {
    throw new ConfigError(
      `Invalid permission tier in ${source}: ${JSON.stringify(value)}. ` +
        `Expected one of: ${TIERS.join(", ")}.`,
    );
  }
  return value as Tier;
}

function parseAllowlist(value: unknown, source: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new ConfigError(
      `Invalid allowlist in ${source}: expected an array of command prefix strings.`,
    );
  }
  return value.map((v) => v.trim()).filter((v) => v.length > 0);
}

function parseString(value: unknown, field: string, source: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConfigError(`Invalid ${field} in ${source}: expected a non-empty string.`);
  }
  return value;
}

export interface LoadConfigOptions {
  /** Path to paperpilot.config.json. Defaults to $PAPERPILOT_CONFIG or ./paperpilot.config.json. */
  configPath?: string;
  /** Environment to read overrides from. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Working directory used to resolve relative paths. Defaults to process.cwd(). */
  cwd?: string;
}

/**
 * Load and validate the PaperPilot configuration.
 *
 * The JSON config file supplies tier/allowlist/log paths; RCON credentials
 * come from the environment (RCON_HOST, RCON_PORT, RCON_PASSWORD) so the
 * password never lives in a committable file. RCON_HOST / RCON_PORT fall
 * back to 127.0.0.1 / 25575. The config file itself is optional.
 *
 * Throws ConfigError with a clear message on any problem.
 */
export function loadConfig(options: LoadConfigOptions = {}): PaperPilotConfig {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const configPath = resolve(
    cwd,
    options.configPath ?? env.PAPERPILOT_CONFIG ?? "paperpilot.config.json",
  );

  let fileConfig: RawFileConfig = {};
  if (existsSync(configPath)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (err) {
      throw new ConfigError(
        `Could not parse config file ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new ConfigError(`Invalid config file ${configPath}: expected a JSON object.`);
    }
    fileConfig = parsed as RawFileConfig;
  }

  // --- RCON settings from the environment ---
  const rconHost = env.RCON_HOST?.trim() ? env.RCON_HOST.trim() : DEFAULTS.rconHost;

  let rconPort = DEFAULTS.rconPort;
  if (env.RCON_PORT !== undefined && env.RCON_PORT.trim() !== "") {
    const parsedPort = Number(env.RCON_PORT);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      throw new ConfigError(
        `Invalid RCON_PORT "${env.RCON_PORT}": expected an integer between 1 and 65535.`,
      );
    }
    rconPort = parsedPort;
  }

  const rconPassword = env.RCON_PASSWORD ?? "";
  if (rconPassword.length === 0) {
    throw new ConfigError(
      "RCON_PASSWORD is not set. Set it in the environment (see .env.example) — " +
        "PaperPilot never reads the RCON password from the config file.",
    );
  }

  // --- File settings with defaults ---
  const tier =
    fileConfig.tier === undefined
      ? DEFAULTS.tier
      : parseTier(fileConfig.tier, `config file ${configPath}`);
  const allowlist =
    fileConfig.allowlist === undefined
      ? [...DEFAULTS.allowlist]
      : parseAllowlist(fileConfig.allowlist, `config file ${configPath}`);
  const logPath =
    fileConfig.logPath === undefined
      ? DEFAULTS.logPath
      : parseString(fileConfig.logPath, "logPath", `config file ${configPath}`);
  const auditLogPath =
    fileConfig.auditLogPath === undefined
      ? DEFAULTS.auditLogPath
      : parseString(fileConfig.auditLogPath, "auditLogPath", `config file ${configPath}`);

  return { rconHost, rconPort, rconPassword, tier, allowlist, logPath, auditLogPath };
}
