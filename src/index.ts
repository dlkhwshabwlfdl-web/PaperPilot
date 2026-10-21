#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AuditLogger } from "./audit.js";
import { loadConfig } from "./config.js";
import { RconClient } from "./rcon.js";
import { createTools } from "./tools.js";

async function main(): Promise<void> {
  // NOTE: stdout is the MCP channel — all diagnostics go to stderr.
  const config = loadConfig();
  const rcon = new RconClient({
    host: config.rconHost,
    port: config.rconPort,
    password: config.rconPassword,
  });
  const audit = new AuditLogger(config.auditLogPath);
  const tools = createTools({ config, rcon, audit });

  const server = new McpServer({ name: "paperpilot", version: "1.0.0" });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>) => {
        try {
          const text = await tool.handler(args ?? {});
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `PaperPilot MCP server running (tier: ${config.tier}, RCON: ${config.rconHost}:${config.rconPort}).`,
  );
}

main().catch((err) => {
  console.error(`PaperPilot failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
