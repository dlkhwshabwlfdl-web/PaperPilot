import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { AuditLogger, summarizeArgs } from "./audit.js";
import { tierAtLeast, type PaperPilotConfig, type Tier } from "./config.js";
import type { RconConnection } from "./rcon.js";

export class ToolDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolDeniedError";
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** Minimum permission tier required to run this tool. */
  tier: Tier;
  /** Zod raw shape for the tool's arguments ({} for no arguments). */
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface ToolDeps {
  config: PaperPilotConfig;
  rcon: RconConnection;
  audit: AuditLogger;
}

const PLAYER_NAME = /^[A-Za-z0-9_]{1,16}$/;

function requirePlayerName(value: unknown, field = "player"): string {
  if (typeof value !== "string" || !PLAYER_NAME.test(value)) {
    throw new ToolDeniedError(
      `Invalid ${field} ${JSON.stringify(value)}: expected a Minecraft username (1-16 letters, digits or underscores).`,
    );
  }
  return value;
}

/**
 * Check whether `command` is allowed by the allowlist: the command must
 * equal an entry or start with an entry followed by a space
 * (case-insensitive). E.g. entry "time set" allows "time set day".
 */
export function isCommandAllowed(command: string, allowlist: string[]): boolean {
  const normalized = command.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized.length === 0) return false;
  return allowlist.some((entry) => {
    const prefix = entry.trim().replace(/\s+/g, " ").toLowerCase();
    return prefix.length > 0 && (normalized === prefix || normalized.startsWith(`${prefix} `));
  });
}

/**
 * Return the last `lines` lines of a text file, optionally only the lines
 * containing `search` (case-insensitive substring).
 */
export function tailLog(content: string, lines: number, search?: string): string[] {
  let all = content.split(/\r?\n/);
  if (all.length > 0 && all[all.length - 1] === "") all = all.slice(0, -1);
  if (search !== undefined && search !== "") {
    const needle = search.toLowerCase();
    all = all.filter((line) => line.toLowerCase().includes(needle));
  }
  return all.slice(-lines);
}

interface ParsedList {
  online: number | null;
  max: number | null;
  players: string[];
}

export function parseListOutput(raw: string): ParsedList {
  const match = raw.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)/is);
  if (!match) return { online: null, max: null, players: [] };
  const names = match[3]
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  return { online: Number(match[1]), max: Number(match[2]), players: names };
}

export function parseVersionOutput(raw: string): string {
  const match = raw.match(/running .+? version ([^\s]+)/i) ?? raw.match(/version ([^\s]+)/i);
  return match ? match[1] : raw.trim();
}

export interface ParsedTps {
  /** TPS over the last 1m, 5m and 15m. */
  tps: [number, number, number];
  /** Milliseconds per tick, when the server reports it in the same output. */
  mspt: number | null;
}

/**
 * Parse the output of the `tps` command. Returns the 1m/5m/15m TPS triple
 * (plus MSPT when the server reports it), or null when the output is not in
 * the expected "TPS from last 1m, 5m, 15m: a, b, c" shape (callers fall back
 * to the raw text). Colour codes (§x / ANSI) are stripped first, since RCON
 * output may carry them.
 */
export function parseTpsOutput(raw: string): ParsedTps | null {
  const stripped = raw.replace(/§./g, "").replace(/\x1b\[[0-9;]*m/g, "");
  const match = stripped.match(
    /TPS from last 1m, 5m, 15m:\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/i,
  );
  if (!match) return null;
  const msptMatch = stripped.match(/MSPT[:\s]+([0-9.]+)/i);
  return {
    tps: [Number(match[1]), Number(match[2]), Number(match[3])],
    mspt: msptMatch ? Number(msptMatch[1]) : null,
  };
}

/**
 * Parse the output of the `plugins` command. Returns the plugin names, an
 * empty array for an empty list, or null when the output is not in the
 * expected "Plugins (n): a, b, c" shape (callers fall back to the raw text).
 * Colour codes (§x / ANSI) are stripped first, since RCON output may carry
 * them for enabled/disabled plugins.
 */
/**
 * Log-line patterns that indicate a server crash (as opposed to ordinary
 * warnings). Matched case-insensitively against a single log line.
 */
export const CRASH_PATTERNS: RegExp[] = [
  /crash[ -]?report/i,
  /outofmemoryerror/i,
  /ticking (entity|blockentity|world|player)/i,
  /exception ticking/i,
  /server has stopped responding/i,
  /a single server tick took/i,
  /java\.lang\.\w*(?:exception|error)/i,
  /failed to tick/i,
];

/**
 * Return the log lines (trimmed, in order) that match a crash pattern.
 * Callers pass the tail of the log they want scanned; an empty result
 * means no crash indicator was found in that window.
 */
export function findCrashIndicators(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && CRASH_PATTERNS.some((pattern) => pattern.test(line)));
}

/**
 * Parse the output of `data get entity <player> <path>`: the server answers
 * "<player> has the following entity data: <value>". Returns the value
 * (colour codes stripped), or null when the output is not in that shape
 * (e.g. the player is offline and no entity was found).
 */
export function parseDataGetOutput(raw: string): string | null {
  const stripped = raw.replace(/§./g, "").replace(/\x1b\[[0-9;]*m/g, "");
  const match = stripped.match(/has the following entity data:\s*(.+)/is);
  return match ? match[1].trim() : null;
}

/** Minecraft gamemode names by their numeric `playerGameType` value. */
export const GAMEMODE_NAMES: Record<string, string> = {
  "0": "Survival",
  "1": "Creative",
  "2": "Adventure",
  "3": "Spectator",
};

export function parsePluginsOutput(raw: string): string[] | null {
  const stripped = raw.replace(/§./g, "").replace(/\x1b\[[0-9;]*m/g, "");
  const match = stripped.match(/Plugins\s*\(\d+\)\s*:\s*(.*)/is);
  if (!match) return null;
  return match[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/** Build all PaperPilot tool definitions bound to the given dependencies. */
export function createTools(deps: ToolDeps): ToolDefinition[] {
  const { config, rcon, audit } = deps;

  /**
   * Wrap a tool implementation with tier enforcement + audit logging.
   * Every call is audited: "denied" when a check rejects it, otherwise
   * "allowed" (with the error attached if execution itself failed).
   */
  function guarded(
    name: string,
    requiredTier: Tier,
    fn: (args: Record<string, unknown>) => Promise<string>,
    extraCheck?: (args: Record<string, unknown>) => void,
  ): ToolDefinition["handler"] {
    return async (args) => {
      const base = {
        ts: new Date().toISOString(),
        tool: name,
        args: summarizeArgs(args),
        tier: config.tier,
      };
      if (!tierAtLeast(config.tier, requiredTier)) {
        const detail =
          `Tool "${name}" requires the "${requiredTier}" tier, ` +
          `but this PaperPilot instance is configured as "${config.tier}".`;
        audit.log({ ...base, outcome: "denied", detail });
        throw new ToolDeniedError(detail);
      }
      try {
        extraCheck?.(args);
      } catch (err) {
        audit.log({
          ...base,
          outcome: "denied",
          detail: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      try {
        const result = await fn(args);
        audit.log({ ...base, outcome: "allowed" });
        return result;
      } catch (err) {
        audit.log({
          ...base,
          outcome: "allowed",
          detail: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        });
        throw err;
      }
    };
  }

  const noArgs: z.ZodRawShape = {};
  const playerArg: z.ZodRawShape = {
    player: z.string().describe("Minecraft username (1-16 letters, digits or underscores)"),
  };

  const tools: ToolDefinition[] = [
    {
      name: "server_status",
      description:
        "Get the Paper server's version, online/max players, player names and parsed TPS (1m/5m/15m, plus MSPT when reported) (runs version, list and tps via RCON).",
      tier: "readonly",
      inputSchema: noArgs,
      handler: guarded("server_status", "readonly", async () => {
        const [versionRaw, listRaw, tpsRaw] = [
          await rcon.send("version"),
          await rcon.send("list"),
          await rcon.send("tps"),
        ];
        const list = parseListOutput(listRaw);
        const tps = parseTpsOutput(tpsRaw);
        const tpsLine =
          tps === null
            ? `TPS (raw): ${tpsRaw.trim()}`
            : `TPS (1m/5m/15m): ${tps.tps.join(", ")}` +
              (tps.mspt !== null ? ` — MSPT: ${tps.mspt}` : "");
        return [
          `Version: ${parseVersionOutput(versionRaw)}`,
          `Players: ${list.online ?? "?"} / ${list.max ?? "?"} online` +
            (list.players.length > 0 ? ` — ${list.players.join(", ")}` : ""),
          tpsLine,
        ].join("\n");
      }),
    },
    {
      name: "list_players",
      description: "List the players currently online on the Paper server.",
      tier: "readonly",
      inputSchema: noArgs,
      handler: guarded("list_players", "readonly", async () => {
        const raw = await rcon.send("list");
        const list = parseListOutput(raw);
        if (list.online === null) return raw.trim();
        if (list.players.length === 0) return `No players online (max ${list.max ?? "?"}).`;
        return `${list.online} player(s) online: ${list.players.join(", ")}`;
      }),
    },
    {
      name: "list_plugins",
      description:
        "List the plugins installed on the Paper server (runs plugins via RCON).",
      tier: "readonly",
      inputSchema: noArgs,
      handler: guarded("list_plugins", "readonly", async () => {
        const raw = await rcon.send("plugins");
        const plugins = parsePluginsOutput(raw);
        if (plugins === null) return raw.trim();
        if (plugins.length === 0) return "No plugins installed.";
        return `${plugins.length} plugin(s): ${plugins.join(", ")}`;
      }),
    },
    {
      name: "player_info",
      description:
        "Show info about an online player: position, health, food level, XP level and gamemode (runs data get entity via RCON).",
      tier: "readonly",
      inputSchema: playerArg,
      handler: guarded("player_info", "readonly", async (args) => {
        const player = requirePlayerName(args.player);
        const pos = parseDataGetOutput(await rcon.send(`data get entity ${player} Pos`));
        if (pos === null) {
          return `${player} is not online (no entity data found).`;
        }
        const health = parseDataGetOutput(await rcon.send(`data get entity ${player} Health`));
        const food = parseDataGetOutput(await rcon.send(`data get entity ${player} foodLevel`));
        const xp = parseDataGetOutput(await rcon.send(`data get entity ${player} XpLevel`));
        const gameType = parseDataGetOutput(
          await rcon.send(`data get entity ${player} playerGameType`),
        );
        const gamemode =
          gameType === null ? "unknown" : (GAMEMODE_NAMES[gameType] ?? `unknown (${gameType})`);
        const stripFloatSuffix = (value: string | null): string =>
          value === null ? "unknown" : value.replace(/([0-9])f$/, "$1");
        return [
          `Player: ${player}`,
          `Position: ${pos}`,
          `Health: ${stripFloatSuffix(health)}`,
          `Food level: ${food ?? "unknown"}`,
          `XP level: ${xp ?? "unknown"}`,
          `Gamemode: ${gamemode}`,
        ].join("\n");
      }),
    },
    {
      name: "read_logs",
      description:
        "Read the tail of the Minecraft server log file, optionally filtered by a search substring.",
      tier: "readonly",
      inputSchema: {
        lines: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("How many lines to return (default 50, max 500)"),
        search: z
          .string()
          .optional()
          .describe("Optional case-insensitive substring filter"),
      },
      handler: guarded("read_logs", "readonly", async (args) => {
        const lines = typeof args.lines === "number" ? args.lines : 50;
        const search = typeof args.search === "string" ? args.search : undefined;
        if (!existsSync(config.logPath)) {
          throw new Error(`Log file not found: ${config.logPath}`);
        }
        const content = readFileSync(config.logPath, "utf8");
        const tail = tailLog(content, lines, search);
        if (tail.length === 0) {
          return search
            ? `No log lines match "${search}".`
            : "The log file is empty.";
        }
        return tail.join("\n");
      }),
    },
    {
      name: "diagnose_crash",
      description:
        "Scan the tail of the server log for crash indicators (crash reports, OutOfMemoryError, ticking exceptions, watchdog stalls) and report the matching lines, if any.",
      tier: "readonly",
      inputSchema: {
        lines: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("How many trailing log lines to scan (default 200, max 500)"),
      },
      handler: guarded("diagnose_crash", "readonly", async (args) => {
        const lines = typeof args.lines === "number" ? args.lines : 200;
        if (!existsSync(config.logPath)) {
          throw new Error(`Log file not found: ${config.logPath}`);
        }
        const content = readFileSync(config.logPath, "utf8");
        const tail = tailLog(content, lines);
        const hits = findCrashIndicators(tail.join("\n"));
        if (hits.length === 0) {
          return `No crash indicators found in the last ${tail.length} log line(s).`;
        }
        const shown = hits.slice(-5);
        return [
          `Found ${hits.length} crash indicator(s) in the last ${tail.length} log line(s):`,
          ...shown,
          "Check the server's crash-reports/ folder for the full crash report.",
        ].join("\n");
      }),
    },
    {
      name: "run_command",
      description:
        "Run a server command via RCON. Only commands matching the configured allowlist are accepted; everything else is rejected.",
      tier: "admin",
      inputSchema: {
        command: z.string().describe("The full command to run, without a leading slash"),
      },
      handler: guarded(
        "run_command",
        "admin",
        async (args) => {
          const command = String(args.command ?? "");
          const response = await rcon.send(command);
          return response.trim() === "" ? "(command executed, no output)" : response.trim();
        },
        (args) => {
          const command = typeof args.command === "string" ? args.command : "";
          if (!isCommandAllowed(command, config.allowlist)) {
            throw new ToolDeniedError(
              `Command rejected: "${command}" does not match the configured allowlist ` +
                `[${config.allowlist.join(", ") || "(empty)"}].`,
            );
          }
        },
      ),
    },
    {
      name: "kick_player",
      description: "Kick a player from the server, with an optional reason.",
      tier: "operator",
      inputSchema: {
        ...playerArg,
        reason: z.string().optional().describe("Optional kick reason shown to the player"),
      },
      handler: guarded("kick_player", "operator", async (args) => {
        const player = requirePlayerName(args.player);
        const reason =
          typeof args.reason === "string" && args.reason.trim() !== ""
            ? ` ${args.reason.trim()}`
            : "";
        const response = await rcon.send(`kick ${player}${reason}`);
        return response.trim() || `Kicked ${player}.`;
      }),
    },
    {
      name: "whitelist_add",
      description: "Add a player to the server whitelist.",
      tier: "operator",
      inputSchema: playerArg,
      handler: guarded("whitelist_add", "operator", async (args) => {
        const player = requirePlayerName(args.player);
        const response = await rcon.send(`whitelist add ${player}`);
        return response.trim() || `Added ${player} to the whitelist.`;
      }),
    },
    {
      name: "whitelist_remove",
      description: "Remove a player from the server whitelist.",
      tier: "operator",
      inputSchema: playerArg,
      handler: guarded("whitelist_remove", "operator", async (args) => {
        const player = requirePlayerName(args.player);
        const response = await rcon.send(`whitelist remove ${player}`);
        return response.trim() || `Removed ${player} from the whitelist.`;
      }),
    },
    {
      name: "ban_player",
      description: "Ban a player from the server, with an optional reason.",
      tier: "admin",
      inputSchema: {
        ...playerArg,
        reason: z.string().optional().describe("Optional ban reason"),
      },
      handler: guarded("ban_player", "admin", async (args) => {
        const player = requirePlayerName(args.player);
        const reason =
          typeof args.reason === "string" && args.reason.trim() !== ""
            ? ` ${args.reason.trim()}`
            : "";
        const response = await rcon.send(`ban ${player}${reason}`);
        return response.trim() || `Banned ${player}.`;
      }),
    },
    {
      name: "backup_world",
      description:
        "Prepare the world for a backup: runs save-all, then save-off, then save-on via RCON and reports each step's response. (Copy the world files while saving is off on the server side / via your backup tooling.)",
      tier: "admin",
      inputSchema: noArgs,
      handler: guarded("backup_world", "admin", async () => {
        const steps: string[] = [];
        for (const command of ["save-all", "save-off", "save-on"]) {
          const response = await rcon.send(command);
          steps.push(`${command}: ${response.trim() || "(no output)"}`);
        }
        return steps.join("\n");
      }),
    },
  ];

  return tools;
}
