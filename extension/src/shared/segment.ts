/**
 * Domain types for translated speech segments.
 *
 * @module shared/segment
 */
import { z } from "zod";

/** Runtime schema for {@link GlossSegment}. */
export const glossSegmentSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** `null` when the gloss translator failed; the avatar then signs the raw text. */
  gloss: z.string().nullable(),
});

/** A recognized sentence and its Libras gloss, ready to be signed by the avatar. */
export type GlossSegment = z.infer<typeof glossSegmentSchema>;

/**
 * Chooses what the avatar should sign for a segment.
 *
 * When the backend could not produce a gloss we fall back to the upper-cased Portuguese text,
 * mirroring what the official VLibras player does (unknown words are fingerspelled).
 *
 * @param segment - Segment received from the backend.
 * @returns The string to send to the VLibras player.
 */
export function signableText(segment: GlossSegment): string {
  const gloss = segment.gloss?.trim();
  return gloss !== undefined && gloss !== "" ? gloss : segment.text.trim().toUpperCase();
}
