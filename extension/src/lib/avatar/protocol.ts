/**
 * Typed `postMessage` contract between the shadow-DOM overlay host and the sandboxed VLibras
 * iframe (`avatar.html`).
 *
 * @module lib/avatar/protocol
 */
import { z } from "zod";

/** Commands sent from the overlay host to the sandboxed VLibras iframe. */
export const avatarCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("avatar/play"), gloss: z.string() }),
  z.object({ type: z.literal("avatar/pause") }),
  z.object({ type: z.literal("avatar/resume") }),
  z.object({ type: z.literal("avatar/stop") }),
  z.object({ type: z.literal("avatar/set-speed"), speed: z.number() }),
]);

/** Command payload sent into the avatar iframe. */
export type AvatarCommand = z.infer<typeof avatarCommandSchema>;

/** Events emitted by the sandboxed VLibras iframe to the overlay host. */
export const avatarEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("avatar/ready") }),
  z.object({ type: z.literal("avatar/progress"), progress: z.number() }),
  z.object({ type: z.literal("avatar/animation-start") }),
  z.object({ type: z.literal("avatar/animation-end") }),
  z.object({ type: z.literal("avatar/error"), message: z.string() }),
]);

/** Event payload emitted by the avatar iframe. */
export type AvatarEvent = z.infer<typeof avatarEventSchema>;

/**
 * Validates an untrusted `MessageEvent.data` coming from the avatar iframe.
 *
 * @param raw - Value from `window` `message` event.
 * @returns Parsed {@link AvatarEvent}, or `null` if unrelated/malformed.
 */
export function parseAvatarEvent(raw: unknown): AvatarEvent | null {
  const result = avatarEventSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Validates an untrusted `MessageEvent.data` coming into the sandboxed avatar page.
 *
 * @param raw - Value from `window` `message` event.
 * @returns Parsed {@link AvatarCommand}, or `null` if unrelated/malformed.
 */
export function parseAvatarCommand(raw: unknown): AvatarCommand | null {
  const result = avatarCommandSchema.safeParse(raw);
  return result.success ? result.data : null;
}
