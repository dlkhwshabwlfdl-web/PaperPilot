# Changelog

All notable changes to PaperPilot are documented here.

## [1.1.0] — 2026-11-06

The v1.1 release rounds out the toolset with server insight, crash triage,
player detail, and backup housekeeping.

### Added

- `list_plugins` (readonly) — list the plugins installed on the server.
- `diagnose_crash` (readonly) — scan the recent log for crash indicators:
  crash reports, `OutOfMemoryError`, ticking exceptions, watchdog stalls.
- `player_info` (readonly) — player position, health, food level, XP level
  and gamemode via `data get entity`; reports cleanly when the player is
  offline.
- `rotate_backups` (admin) — prune the backup directory to the newest N
  backups (default 7, max 100); `dryRun` lists what would be deleted
  without deleting. New `backupDir` config field (default `"backups"`).
- TPS (1m/5m/15m) and MSPT parsing in `server_status` output.

### Changed

- `server_status` now reports parsed TPS values instead of raw text only.

## [1.0.0] — 2026-10-21

Initial public release: MCP server for operating a Paper server over RCON,
with permission tiers, a command allowlist, and a full audit log.
