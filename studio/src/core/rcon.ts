import { Socket } from "node:net";

/**
 * Minimal interface the rest of PaperPilot depends on. Tests substitute an
 * in-memory fake; production uses {@link RconClient}.
 */
export interface RconConnection {
  /** Send one command and resolve with the full (possibly multi-packet) response text. */
  send(command: string): Promise<string>;
  /** Close the connection. Safe to call when not connected. */
  close(): Promise<void>;
}

// Source RCON packet types.
const SERVERDATA_RESPONSE_VALUE = 0;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;

export interface DecodedPacket {
  id: number;
  type: number;
  body: string;
}

/**
 * Encode one RCON packet:
 * [int32 LE size][int32 LE id][int32 LE type][body bytes][0x00][0x00]
 * where size counts everything after the size field itself.
 */
export function encodePacket(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body, "utf8");
  const size = 4 + 4 + bodyBuf.length + 2;
  const buf = Buffer.alloc(4 + size);
  buf.writeInt32LE(size, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  buf.writeInt8(0, 12 + bodyBuf.length);
  buf.writeInt8(0, 13 + bodyBuf.length);
  return buf;
}

/**
 * Try to decode one packet from the front of `buffer`. Returns null when the
 * buffer does not yet hold a complete packet; throws on a malformed size.
 */
export function tryDecodePacket(
  buffer: Buffer,
): { packet: DecodedPacket; rest: Buffer } | null {
  if (buffer.length < 4) return null;
  const size = buffer.readInt32LE(0);
  if (size < 10) {
    throw new Error(`Malformed RCON packet: declared size ${size} is too small.`);
  }
  if (buffer.length < 4 + size) return null;
  const id = buffer.readInt32LE(4);
  const type = buffer.readInt32LE(8);
  const body = buffer.toString("utf8", 12, 4 + size - 2);
  return { packet: { id, type, body }, rest: buffer.subarray(4 + size) };
}

export interface RconClientOptions {
  host: string;
  port: number;
  password: string;
  /** Per-operation timeout in milliseconds. Default 10_000. */
  timeoutMs?: number;
}

/**
 * A Source RCON client for a Minecraft (Paper) server.
 *
 * Connects lazily on the first send() and reconnects if the socket drops.
 * Command responses that span several packets are reassembled using the
 * standard sentinel-packet trick: after the command packet we send an empty
 * RESPONSE_VALUE packet with a different id; the server answers command
 * packets first, so everything received before the sentinel's response
 * belongs to the command.
 */
export class RconClient implements RconConnection {
  private socket: Socket | null = null;
  private connectPromise: Promise<void> | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private packetQueue: DecodedPacket[] = [];
  private packetWaiters: Array<{
    resolve: (p: DecodedPacket) => void;
    reject: (err: Error) => void;
  }> = [];
  private nextId = 2;
  private sendChain: Promise<unknown> = Promise.resolve();
  private readonly timeoutMs: number;

  constructor(private readonly options: RconClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async send(command: string): Promise<string> {
    // Serialize sends: the sentinel trick assumes one command in flight.
    const run = this.sendChain.then(() => this.sendNow(command));
    this.sendChain = run.catch(() => undefined);
    return run;
  }

  async close(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connectPromise = null;
    this.failWaiters(new Error("RCON connection closed."));
  }

  private async sendNow(command: string): Promise<string> {
    await this.ensureConnected();
    const commandId = this.nextId++;
    const sentinelId = this.nextId++;
    this.writePacket(commandId, SERVERDATA_EXECCOMMAND, command);
    this.writePacket(sentinelId, SERVERDATA_RESPONSE_VALUE, "");

    const deadline = Date.now() + this.timeoutMs;
    let response = "";
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`RCON command timed out after ${this.timeoutMs} ms: ${command}`);
      }
      const packet = await this.readPacket(remaining);
      if (packet.id === sentinelId) break;
      if (packet.id === commandId) response += packet.body;
      // Packets with any other id are ignored (should not happen).
    }
    return response;
  }

  private writePacket(id: number, type: number, body: string): void {
    if (!this.socket) throw new Error("RCON socket is not connected.");
    this.socket.write(encodePacket(id, type, body));
  }

  private ensureConnected(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    if (!this.connectPromise) {
      this.connectPromise = this.connect().catch((err) => {
        this.connectPromise = null;
        throw err;
      });
    }
    return this.connectPromise;
  }

  private async connect(): Promise<void> {
    const { host, port, password } = this.options;
    const socket = new Socket();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.packetQueue = [];

    socket.on("data", (chunk: Buffer) => {
      try {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        for (;;) {
          const decoded = tryDecodePacket(this.buffer);
          if (!decoded) break;
          this.buffer = Buffer.from(decoded.rest);
          this.deliverPacket(decoded.packet);
        }
      } catch (err) {
        this.failWaiters(err instanceof Error ? err : new Error(String(err)));
      }
    });
    socket.on("error", (err) => {
      this.failWaiters(err);
    });
    socket.on("close", () => {
      if (this.socket === socket) this.socket = null;
      this.connectPromise = null;
      this.failWaiters(new Error("RCON connection closed by the server."));
    });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        socket.destroy();
        rejectPromise(
          new Error(`RCON connection to ${host}:${port} timed out after ${this.timeoutMs} ms.`),
        );
      }, this.timeoutMs);
      socket.connect(port, host, () => {
        clearTimeout(timer);
        resolvePromise();
      });
      socket.once("error", (err) => {
        clearTimeout(timer);
        rejectPromise(new Error(`RCON connection to ${host}:${port} failed: ${err.message}`));
      });
    });

    // Authenticate: id 1, type SERVERDATA_AUTH. The server replies with an
    // (optional) empty RESPONSE_VALUE followed by an AUTH_RESPONSE whose id
    // mirrors ours on success, or -1 on failure.
    const authId = 1;
    this.writePacket(authId, SERVERDATA_AUTH, password);
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error("RCON authentication timed out.");
      }
      const packet = await this.readPacket(remaining);
      if (packet.type === SERVERDATA_AUTH_RESPONSE) {
        if (packet.id === -1) {
          await this.close();
          throw new Error("RCON authentication failed: wrong password.");
        }
        if (packet.id === authId) return;
      }
    }
  }

  private deliverPacket(packet: DecodedPacket): void {
    const waiter = this.packetWaiters.shift();
    if (waiter) waiter.resolve(packet);
    else this.packetQueue.push(packet);
  }

  private failWaiters(err: Error): void {
    const waiters = this.packetWaiters;
    this.packetWaiters = [];
    for (const waiter of waiters) waiter.reject(err);
  }

  private readPacket(timeoutMs: number): Promise<DecodedPacket> {
    const queued = this.packetQueue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise<DecodedPacket>((resolvePromise, rejectPromise) => {
      const waiter = {
        resolve: (p: DecodedPacket) => {
          clearTimeout(timer);
          resolvePromise(p);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          rejectPromise(err);
        },
      };
      const timer = setTimeout(() => {
        this.packetWaiters = this.packetWaiters.filter((w) => w !== waiter);
        rejectPromise(new Error(`Timed out waiting for an RCON response (${timeoutMs} ms).`));
      }, timeoutMs);
      this.packetWaiters.push(waiter);
    });
  }
}
