# PaperPilot Studio — Design

The official UI design for PaperPilot Studio (the graphical management app for PaperPilot) lives in Figma:

**https://www.figma.com/design/ET0oi4XQXyF4T6ZpUqrxVz**

## Current design — Fluent v2

A native Windows 11 Fluent look, like a high-end Windows app: Mica window background, acrylic navigation pane with window controls, accent #4CC2FF, cards with a 1px stroke and soft shadow, Segoe UI type (Inter fallback).

Frames: `v2 · 00 Tokens`, `v2 · 01 Overview`, `v2 · 02 Tools`, `v2 · 03 Players`, `v2 · 04 AI Copilot`, `v2 · 05 Backups`, `v2 · 06 Logs`, `v2 · 07 Settings` — a full window mockup per screen. The earlier v1 frames (flat Catppuccin web style) are kept in the same file for history.

## Screens

- **Overview** — TPS / MSPT / players / plugins stat cards, performance chart, quick actions, alerts, recent activity
- **Tools** — all 13 PaperPilot tools as cards, grouped by permission tier (readonly / operator / admin)
- **Players** — online players table with a player detail panel (player_info) and kick/ban actions
- **Backups** — backup list, storage ring, create + rotate actions
- **Logs** — terminal-style live log tail with level filters (all / info / warnings / errors)
- **AI Copilot** — chat where every tool call waits for the owner's approval before it runs
- **Settings** — RCON connection and safety toggles

## Design system

- Machine-readable tokens: [tokens.json](tokens.json) (v2.0.0), mirrored as a tokens frame inside the Figma file.
- Rule carried from the build spec: AI Copilot tool calls always need the owner's approval, and admin actions always ask for confirmation.
