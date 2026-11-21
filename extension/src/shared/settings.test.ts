import { describe, expect, it } from "vitest";

import {
  DEFAULT_AVATAR_SETTINGS,
  formatSpeed,
  normalizeSpeed,
  sanitizeAvatarSettings,
} from "./settings";

describe("settings", () => {
  it("sanitizes missing or malformed stored values field by field", () => {
    expect(sanitizeAvatarSettings(null)).toEqual(DEFAULT_AVATAR_SETTINGS);
    expect(sanitizeAvatarSettings({ size: "large", speed: 99, position: "invalid" })).toEqual({
      size: "large",
      speed: DEFAULT_AVATAR_SETTINGS.speed,
      position: DEFAULT_AVATAR_SETTINGS.position,
    });
    expect(sanitizeAvatarSettings({ size: "small", speed: 1.5, position: "top-left" })).toEqual({
      size: "small",
      speed: 1.5,
      position: "top-left",
    });
  });

  it("clamps and snaps speed to 0.25 increments", () => {
    expect(normalizeSpeed(0.1)).toBe(0.5);
    expect(normalizeSpeed(5)).toBe(2);
    expect(normalizeSpeed(1.13)).toBe(1.25);
    expect(normalizeSpeed(Number.NaN)).toBe(1);
  });

  it("formats speed cleanly", () => {
    expect(formatSpeed(0.5)).toBe("0.5x");
    expect(formatSpeed(1)).toBe("1.0x");
    expect(formatSpeed(1.25)).toBe("1.25x");
    expect(formatSpeed(2)).toBe("2.0x");
  });
});
