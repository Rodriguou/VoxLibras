/**
 * Mirror of the backend WebSocket contract (see `docs/protocol.md`).
 *
 * Everything that arrives over the network is `unknown` until proven otherwise, so each server
 * message is parsed with Zod before the rest of the code touches it.
 *
 * @module lib/transport/protocol
 */
import { z } from "zod";

/** First message sent by the client after the socket opens. */
export interface StartMessage {
  type: "start";
  sampleRate: number;
  language: string;
}

/** Graceful end of the stream. */
export interface StopMessage {
  type: "stop";
}

/** JSON messages the client may send (audio goes as binary frames). */
export type ClientMessage = StartMessage | StopMessage;

/** Error codes defined by the backend. */
export const SERVER_ERROR_CODES = ["INVALID_MESSAGE", "STT_NOT_CONFIGURED", "STT_FAILED"] as const;

/** Runtime schema for {@link ServerMessage}. */
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({
    type: z.literal("segment"),
    id: z.string(),
    text: z.string(),
    gloss: z.string().nullable(),
    metrics: z
      .object({
        sttLatencyMs: z.number().nullable().optional(),
        glossLatencyMs: z.number().nullable().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("error"),
    // Unknown future codes must not break the client, hence `string` instead of an enum.
    code: z.string(),
    message: z.string(),
  }),
]);

/** Messages sent by the backend. */
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/**
 * Parses a raw text frame coming from the backend.
 *
 * @param raw - The `MessageEvent.data` string.
 * @returns The typed message, or `null` if the frame is not valid JSON / not part of the contract.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = serverMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}
