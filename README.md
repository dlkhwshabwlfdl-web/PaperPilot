# PaperPilot

**An MCP server that lets AI agents safely operate your Paper Minecraft server.**

PaperPilot connects any [Model Context Protocol](https://modelcontextprotocol.io) client (Claude, Cursor, your own agent, …) to a Paper server over RCON — and wraps every action in three layers of safety, so an agent can help run your server without ever holding the keys to the kingdom.

## The safety model

1. **Permission tiers.** Each PaperPilot instance runs as exactly one tier:
   - `readonly` — look, don't touch: status, player list, log reading.
   - `operator` — plus day-to-day moderation: kick and whitelist management.
   - `admin` — plus bans, world-backup preparation, and `run_command`.
2. **Command allowlist.** Even admins can't run arbitrary commands through `run_command` — only commands matching a configured prefix list (e.g. `say`, `time set`) get through. Everything else is rejected before it reaches the server.
3. **Audit log.** Every single tool call — allowed *and* denied — is appended as a JSON line to an audit file with the timestamp, tool, arguments summary, outcome and active tier. If an agent did it, it's in the log.

Player names are also validated before any moderation command is built, so a name can never smuggle extra commands into RCON.

## Quick start

```bash
git clone https://github.com/dlkhwshabwlfdl-web/PaperPilot.git
cd PaperPilot
npm install
cp .env.example .env                              # set RCON_PASSWORD (and host/port if needed)
cp config.example.json paperpilot.config.json     # adjust tier, allowlist, paths
npm run build
npm start
```

Prerequisites: Node.js 20+, and a Paper server with RCON enabled (`enable-rcon=true` in `server.properties`, plus `rcon.password` and `rcon.port`).

The server speaks MCP over **stdio** — your MCP client launches it as a subprocess.

## Tools

| Tool | Tier | What it does |
| --- | --- | --- |
| `server_status` | readonly | Server version, online/max players, player names, parsed TPS (1m/5m/15m, plus MSPT when reported) |
| `list_players` | readonly | Players currently online |
| `list_plugins` | readonly | Plugins installed on the server |
| `read_logs` | readonly | Tail of the server log (default 50 lines, max 500), optional substring search |
| `diagnose_crash` | readonly | Scans the last 200 log lines (max 500) for crash indicators — crash reports, OutOfMemoryError, ticking exceptions, watchdog stalls |
| `player_info` | readonly | Player position, health, food level, XP level and gamemode (via `data get entity`); reports cleanly when the player is offline |
| `kick_player` | operator | Kick a player, with an optional reason |
| `whitelist_add` | operator | Add a player to the whitelist |
| `whitelist_remove` | operator | Remove a player from the whitelist |
| `ban_player` | admin | Ban a player, with an optional reason |
| `run_command` | admin | Run a command — **only** if it matches the allowlist |
| `backup_world` | admin | Runs `save-all` → `save-off` → `save-on` and reports each step, so you can snapshot the world safely |

## Configuration

Two sources, deliberately split:

**Environment (`.env`) — connection & secret**

| Variable | Default | Description |
| --- | --- | --- |
| `RCON_HOST` | `127.0.0.1` | RCON host |
| `RCON_PORT` | `25575` | RCON port |
| `RCON_PASSWORD` | — (required) | RCON password. Never read from the config file, never written to the audit log |
| `PAPERPILOT_CONFIG` | `./paperpilot.config.json` | Path to the config file |

**Config file (`paperpilot.config.json`) — behaviour**

| Field | Default | Description |
| --- | --- | --- |
| `tier` | `"readonly"` | `"readonly"` \| `"operator"` \| `"admin"` |
| `allowlist` | `[]` | Command prefixes allowed for `run_command`. A command passes when it equals an entry or starts with an entry + a space, case-insensitive (entry `"time set"` allows `time set day`) |
| `logPath` | `"logs/latest.log"` | Path to the server log file read by `read_logs` |
| `auditLogPath` | `"paperpilot-audit.log"` | Path of the JSONL audit log |

See `config.example.json` for a ready-to-edit example. Start with `readonly` and the smallest allowlist that covers your needs.

## Connecting an MCP client

Add PaperPilot as a stdio server in your client's MCP configuration:

```json
{
  "mcpServers": {
    "paperpilot": {
      "command": "node",
      "args": ["/path/to/PaperPilot/dist/index.js"],
      "env": {
        "RCON_HOST": "127.0.0.1",
        "RCON_PORT": "25575",
        "RCON_PASSWORD": "your-rcon-password"
      }
    }
  }
}
```

## Development

```bash
npm run dev    # run from source with tsx
npm run build  # type-check + compile to dist/
npm test       # vitest — fake in-memory RCON, no real server needed
```

## License

MIT — see [LICENSE](LICENSE).
