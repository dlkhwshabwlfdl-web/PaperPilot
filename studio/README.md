# PaperPilot Studio

A native Windows-style desktop app for managing a Paper Minecraft server — the graphical companion to the **PaperPilot** MCP server in this repo.

Studio does not reimplement anything: it hosts the real PaperPilot core (`src/` at the repo root, vendored into `src/core/` — see “Core sync” below) inside its Electron main process. Every screen runs on **live data only** — there is no demo or placeholder data anywhere in the app. If the server is unreachable, Studio says so and shows you where to fix the connection.

![Design: Fluent v2](https://www.figma.com/design/ET0oi4XQXyF4T6ZpUqrxVz) — the UI follows the Fluent v2 design in `design/` (Mica window, accent `#4CC2FF`, Segoe UI). Themes can be switched in Settings → Appearance: **Fluent Dark**, **Fluent Light** and **Catppuccin Mocha**, plus six accent colors.

## Features

- **Overview** — live version, TPS (with a sampling chart), MSPT when the server reports it, players online, plugin count, quick diagnostics, and the latest audit activity.
- **Tools** — all 13 PaperPilot tools as cards, grouped by permission tier (readonly / operator / admin), with a run dialog generated from each tool’s real schema.
- **Players** — live roster, `player_info` detail panel, kick / whitelist / ban actions.
- **Backups** — the server’s backup folder read live from disk, storage total, `backup_world` preparation and `rotate_backups` with dry-run first.
- **Logs** — live `latest.log` tail (via `read_logs`) with level filters, search and auto-refresh.
- **Audit Log** — every tool run recorded by the core’s append-only JSONL audit log, allowed *and* denied, with `.jsonl` export.
- **AI Copilot** — describe what you want in plain words (“back up the world and clean out the old backups”, “kick Alex”); Copilot drafts the tool calls and **nothing runs until you approve them**. In 1.20.0 the drafting is a local intent parser — no external AI service or API key is involved.
- **Settings** — RCON connection (with a live test), Appearance (themes / accent / density), Safety (approval gate for admin tools, editable `run_command` allowlist). Settings are stored locally in the app’s user-data folder, never in this repo.

Safety model is inherited from the core, unchanged: tier checks, the `run_command` allowlist and the audit log all live in the guarded tool handlers, so the UI (and Copilot) can never do anything the MCP server couldn’t. Studio runs its core instance at the admin tier because it is the server owner’s own app, and adds its own approval prompts for admin actions (Settings → Safety).

## Run / build

```bash
cd studio
npm install
npm run dev        # development
npm run build      # typecheck + bundle
npm run build:win  # Windows portable + installer (electron-builder)
```

Configure the connection in **Settings → Connection** (RCON host/port/password and the server folder, used to find `logs/latest.log` and `backups/`). The RCON password can also come from the `PAPERPILOT_RCON_PASSWORD` environment variable, which takes precedence.

## Core sync

`src/core/` is a vendored copy of the PaperPilot core (`tools.ts`, `config.ts`, `rcon.ts`, `audit.ts`) so Studio stays buildable on its own. After changing the core at the repo root, refresh the copies:

```bash
npm run sync-core
```

## Notes

- MSPT is shown only when the server’s `tps` response reports it; some Paper builds don’t, and Studio shows “—” instead of inventing a number.
- Player counts come from the core’s `server_status`; on Paper builds whose `list` format the core parser doesn’t recognize, Studio falls back to parsing the raw `list_players` output.
