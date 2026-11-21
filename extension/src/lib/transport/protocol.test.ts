import { describe, expect, it } from "vitest";

import { parseServerMessage } from "./protocol";

describe("parseServerMessage", () => {
  it("parses ready, segment (with and without gloss) and error frames", () => {
    expect(parseServerMessage('{"type":"ready"}')).toEqual({ type: "ready" });

    expect(
      parseServerMessage(
        '{"type":"segment","id":"u1","text":"Olá","gloss":"OI","metrics":{"sttLatencyMs":700,"glossLatencyMs":200}}',
      ),
    ).toEqual({
      type: "segment",
      id: "u1",
      text: "Olá",
      gloss: "OI",
      metrics: { sttLatencyMs: 700, glossLatencyMs: 200 },
    });

    expect(parseServerMessage('{"type":"segment","id":"u2","text":"Teste","gloss":null}')).toEqual({
      type: "segment",
      id: "u2",
      text: "Teste",
      gloss: null,
    });

    expect(
      parseServerMessage('{"type":"error","code":"STT_NOT_CONFIGURED","message":"Missing key"}'),
    ).toEqual({
      type: "error",
      code: "STT_NOT_CONFIGURED",
      message: "Missing key",
    });
  });

  it("returns null on malformed JSON or unknown payloads", () => {
    expect(parseServerMessage("not json")).toBeNull();
    expect(parseServerMessage('{"type":"unknown"}')).toBeNull();
    expect(parseServerMessage('{"type":"segment","id":123}')).toBeNull();
  });
});
