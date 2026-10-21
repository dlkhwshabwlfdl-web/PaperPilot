import { describe, expect, it } from "vitest";
import { encodePacket, tryDecodePacket } from "../src/rcon.js";

describe("RCON packet codec", () => {
  it("round-trips a packet", () => {
    const buf = encodePacket(7, 2, "say hello");
    const decoded = tryDecodePacket(buf);
    expect(decoded).not.toBeNull();
    expect(decoded?.packet).toEqual({ id: 7, type: 2, body: "say hello" });
    expect(decoded?.rest).toHaveLength(0);
  });

  it("returns null for an incomplete packet", () => {
    const buf = encodePacket(1, 3, "password");
    expect(tryDecodePacket(buf.subarray(0, 5))).toBeNull();
    expect(tryDecodePacket(Buffer.alloc(0))).toBeNull();
  });

  it("decodes the first of two concatenated packets and keeps the rest", () => {
    const first = encodePacket(1, 0, "part one");
    const second = encodePacket(2, 0, "part two");
    const combined = Buffer.concat([first, second]);
    const decoded = tryDecodePacket(combined);
    expect(decoded?.packet.body).toBe("part one");
    const secondDecoded = tryDecodePacket(decoded?.rest ?? Buffer.alloc(0));
    expect(secondDecoded?.packet).toEqual({ id: 2, type: 0, body: "part two" });
  });

  it("handles an empty body (sentinel packet)", () => {
    const buf = encodePacket(9, 0, "");
    const decoded = tryDecodePacket(buf);
    expect(decoded?.packet).toEqual({ id: 9, type: 0, body: "" });
  });
});
