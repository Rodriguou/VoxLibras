import { describe, expect, it } from "vitest";

import {
  PcmFrameAccumulator,
  computeRms,
  downsampleLinear,
  float32ToInt16Pcm,
  mixToMono,
} from "./pcm";

describe("pcm helpers", () => {
  it("mixes stereo channels to mono", () => {
    const left = new Float32Array([1, -0.5, 0]);
    const right = new Float32Array([0, 0.5, -1]);
    expect(Array.from(mixToMono([left, right]))).toEqual([0.5, 0, -0.5]);
  });

  it("downsamples 48kHz to 16kHz preserving constant and ramp signals", () => {
    const input = new Float32Array(480);
    for (let i = 0; i < input.length; i += 1) {
      input[i] = i / 480;
    }
    const down = downsampleLinear(input, 48_000, 16_000);
    expect(down.length).toBe(160);
    expect(down[0]).toBeCloseTo(0, 5);
    expect(down[80]).toBeCloseTo(240 / 480, 4);
  });

  it("quantizes float32 samples to signed int16 with clipping", () => {
    const pcm = float32ToInt16Pcm(new Float32Array([-2, -1, 0, 0.5, 1, 2]));
    expect(Array.from(pcm)).toEqual([-32_768, -32_768, 0, 16_384, 32_767, 32_767]);
  });

  it("computes RMS amplitude", () => {
    expect(computeRms(new Float32Array(0))).toBe(0);
    expect(computeRms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 5);
  });

  it("accumulates variable chunks into exact 1600-sample frames", () => {
    const acc = new PcmFrameAccumulator(1600);
    expect(acc.push(new Int16Array(1000))).toEqual([]);
    const frames = acc.push(new Int16Array(2300)); // 3300 total -> 2 frames, 100 remaining
    expect(frames).toHaveLength(2);
    expect(frames[0]?.length).toBe(1600);
    expect(frames[1]?.length).toBe(1600);
    acc.reset();
    expect(acc.push(new Int16Array(1599))).toEqual([]);
  });
});
