import { describe, expect, it } from "vitest";

import { SilenceDetector } from "./silence";

describe("SilenceDetector", () => {
  it("emits true after sustained silence and false as soon as audio resumes", () => {
    const detector = new SilenceDetector({
      rmsThreshold: 0.01,
      silenceDurationMs: 300,
      frameMs: 100,
    });

    expect(detector.isSilent).toBe(false);
    expect(detector.update(0.001)).toBeNull();
    expect(detector.update(0.002)).toBeNull();
    expect(detector.update(0.003)).toBe(true);
    expect(detector.update(0.001)).toBeNull();

    expect(detector.update(0.05)).toBe(false);
    expect(detector.isSilent).toBe(false);
  });
});
