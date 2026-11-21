/**
 * User-facing avatar customization preferences.
 *
 * Preferences are persisted only in `chrome.storage.local` (no backend, no account), which keeps
 * them available offline and instantly when the popup opens.
 *
 * @module shared/settings
 */
import { z } from "zod";

/** Allowed avatar sizes. */
export const AVATAR_SIZES = ["small", "medium", "large"] as const;

/** Allowed anchor corners for the floating avatar widget. */
export const AVATAR_POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;

/** Signing speed boundaries (multiplier applied to the VLibras player). */
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;
export const SPEED_STEP = 0.25;

/** Runtime schema for {@link AvatarSettings}; used to sanitize whatever is read from storage. */
export const avatarSettingsSchema = z.object({
  size: z.enum(AVATAR_SIZES),
  speed: z.number().min(SPEED_MIN).max(SPEED_MAX),
  position: z.enum(AVATAR_POSITIONS),
});

/** Avatar preferences configurable by the user. */
export type AvatarSettings = z.infer<typeof avatarSettingsSchema>;
/** One of {@link AVATAR_SIZES}. */
export type AvatarSize = AvatarSettings["size"];
/** One of {@link AVATAR_POSITIONS}. */
export type AvatarPosition = AvatarSettings["position"];

/** Factory defaults, restored by the "Restaurar Padrões" button. */
export const DEFAULT_AVATAR_SETTINGS: Readonly<AvatarSettings> = Object.freeze({
  size: "medium",
  speed: 1,
  position: "bottom-right",
});

/** Pixel dimensions of the avatar viewport for each size. */
export const AVATAR_DIMENSIONS: Readonly<Record<AvatarSize, { width: number; height: number }>> = {
  small: { width: 200, height: 220 },
  medium: { width: 260, height: 290 },
  large: { width: 340, height: 380 },
};

/** PT-BR labels shown in the UI. */
export const AVATAR_SIZE_LABELS: Readonly<Record<AvatarSize, string>> = {
  small: "Pequeno",
  medium: "Médio",
  large: "Grande",
};

/** PT-BR labels shown in the UI. */
export const AVATAR_POSITION_LABELS: Readonly<Record<AvatarPosition, string>> = {
  "bottom-right": "Canto inferior direito",
  "bottom-left": "Canto inferior esquerdo",
  "top-right": "Canto superior direito",
  "top-left": "Canto superior esquerdo",
};

/**
 * Parses an untrusted value (e.g. from storage written by an older version) into valid settings.
 *
 * @param value - Anything read from storage.
 * @returns Valid settings; falls back to {@link DEFAULT_AVATAR_SETTINGS} field by field.
 */
export function sanitizeAvatarSettings(value: unknown): AvatarSettings {
  const parsed = avatarSettingsSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_AVATAR_SETTINGS };
  }
  const record = value as Record<string, unknown>;
  const size = avatarSettingsSchema.shape.size.safeParse(record["size"]);
  const speed = avatarSettingsSchema.shape.speed.safeParse(record["speed"]);
  const position = avatarSettingsSchema.shape.position.safeParse(record["position"]);
  return {
    size: size.success ? size.data : DEFAULT_AVATAR_SETTINGS.size,
    speed: speed.success ? speed.data : DEFAULT_AVATAR_SETTINGS.speed,
    position: position.success ? position.data : DEFAULT_AVATAR_SETTINGS.position,
  };
}

/**
 * Snaps a raw slider value to the nearest valid speed step inside the allowed range.
 *
 * @param raw - Value coming from an `<input type="range">`.
 * @returns A speed in `[SPEED_MIN, SPEED_MAX]`, multiple of `SPEED_STEP`.
 */
export function normalizeSpeed(raw: number): number {
  if (!Number.isFinite(raw)) {
    return DEFAULT_AVATAR_SETTINGS.speed;
  }
  const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, raw));
  return Math.round(clamped / SPEED_STEP) * SPEED_STEP;
}

/**
 * Formats a speed multiplier for display, e.g. `1` → `"1.0x"`, `1.25` → `"1.25x"`.
 *
 * @param speed - Speed multiplier.
 * @returns Human readable label.
 */
export function formatSpeed(speed: number): string {
  const text = Number.isInteger(speed * 10) ? speed.toFixed(1) : speed.toFixed(2);
  return `${text}x`;
}
