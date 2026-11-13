# PaperPilot Studio — Design

The official UI design for PaperPilot Studio (the graphical management app for PaperPilot) lives in Figma:

**https://www.figma.com/design/ET0oi4XQXyF4T6ZpUqrxVz**

## Screens

- **Overview** — TPS / MSPT / players / plugins stat cards, recent activity, quick actions
- **Tools** — all 13 PaperPilot tools as cards, grouped by permission tier (readonly / operator / admin)
- **Players** — online players list with a player detail panel (player_info) and operator/admin actions
- **Backups** — backup list, storage usage, create + rotate actions
- **Logs** — live log tail with level filters (info / warn / error)
- **AI Copilot** — chat where every tool call waits for the owner's approval before it runs
- **Settings** — RCON connection and safety options

## Design system

- Palette: Catppuccin Mocha (dark, calm) — machine-readable tokens in [tokens.json](tokens.json), mirrored as variables inside the Figma file.
- Type: Inter. Radius: cards 12, buttons 10, pills 17.
- Rule carried from the build spec: AI Copilot tool calls always need the owner's approval, and admin actions always ask for confirmation.
