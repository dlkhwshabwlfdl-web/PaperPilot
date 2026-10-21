import type { RconConnection } from "../src/rcon.js";

/**
 * In-memory fake RCON transport for tests. Records every command sent and
 * answers with canned responses (exact-match map, falling back to a
 * per-instance default or a generic "OK").
 */
export class FakeRcon implements RconConnection {
  readonly sent: string[] = [];
  private readonly responses: Map<string, string>;
  private readonly defaultResponse: string;

  constructor(responses: Record<string, string> = {}, defaultResponse = "OK") {
    this.responses = new Map(Object.entries(responses));
    this.defaultResponse = defaultResponse;
  }

  async send(command: string): Promise<string> {
    this.sent.push(command);
    return this.responses.get(command) ?? this.defaultResponse;
  }

  async close(): Promise<void> {
    // Nothing to close in memory.
  }
}
