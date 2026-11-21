/**
 * Internal runtime messages exchanged across extension contexts (popup, service worker,
 * offscreen document and content script overlay).
 *
 * All messages are validated at the receiver boundary with Zod because Chrome's message bus
 * delivers untyped `unknown` payloads.
 *
 * @module lib/messaging/messages
 */
import { z } from "zod";

import { glossSegmentSchema } from "../../shared/segment";
import { sessionErrorCodeSchema, sessionStateSchema } from "../../shared/session";
import { avatarSettingsSchema } from "../../shared/settings";

/** Zod schema covering every internal extension message. */
export const extensionMessageSchema = z.discriminatedUnion("type", [
  // Popup -> Service Worker
  z.object({
    type: z.literal("session/start"),
    tabId: z.number().int(),
    tabTitle: z.string(),
    tabUrl: z.string().optional(),
  }),
  z.object({ type: z.literal("session/stop") }),
  z.object({ type: z.literal("session/dismiss-error") }),
  z.object({ type: z.literal("session/get-state") }),

  // Service Worker -> Offscreen Document
  z.object({
    type: z.literal("offscreen/start-capture"),
    streamId: z.string(),
    backendUrl: z.string(),
  }),
  z.object({ type: z.literal("offscreen/stop-capture") }),

  // Offscreen Document -> Service Worker
  z.object({ type: z.literal("offscreen/ready") }),
  z.object({ type: z.literal("offscreen/segment"), segment: glossSegmentSchema }),
  z.object({ type: z.literal("offscreen/silence-changed"), isSilent: z.boolean() }),
  z.object({ type: z.literal("offscreen/reconnecting"), attempt: z.number().int() }),
  z.object({ type: z.literal("offscreen/error"), code: sessionErrorCodeSchema }),
  z.object({ type: z.literal("offscreen/stopped") }),

  // Service Worker -> Overlay Content Script
  z.object({
    type: z.literal("overlay/mount"),
    settings: avatarSettingsSchema,
    sessionState: sessionStateSchema,
  }),
  z.object({ type: z.literal("overlay/unmount") }),
  z.object({ type: z.literal("overlay/segment"), segment: glossSegmentSchema }),
  z.object({ type: z.literal("overlay/state"), sessionState: sessionStateSchema }),
  z.object({ type: z.literal("overlay/settings"), settings: avatarSettingsSchema }),

  // Overlay Content Script -> Service Worker
  z.object({ type: z.literal("overlay/closed-by-user") }),
  z.object({ type: z.literal("overlay/avatar-ready") }),
  z.object({ type: z.literal("overlay/avatar-error") }),
]);

/** Discriminated union of all internal extension messages. */
export type ExtensionMessage = z.infer<typeof extensionMessageSchema>;

/**
 * Parses an untrusted runtime message into a typed {@link ExtensionMessage}.
 *
 * @param raw - Value received from `chrome.runtime.onMessage`.
 * @returns The typed message, or `null` when it does not match the protocol.
 */
export function parseExtensionMessage(raw: unknown): ExtensionMessage | null {
  const result = extensionMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}
