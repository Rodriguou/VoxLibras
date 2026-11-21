/**
 * Stateful edge-triggered silence detector for captured tab audio.
 *
 * @module lib/audio/silence
 */

/** Configuration for {@link SilenceDetector}. */
export interface SilenceDetectorOptions {
  /** RMS threshold below which a frame counts as silence (default `0.005`). */
  rmsThreshold?: number;
  /** Duration of continuous silence before reporting `isSilent = true` (default `3000` ms). */
  silenceDurationMs?: number;
  /** Nominal duration represented by each `update` call (default `100` ms). */
  frameMs?: number;
}

/**
 * Tracks consecutive low-energy audio frames so the UI can warn when the active tab has no audio.
 */
export class SilenceDetector {
  private readonly rmsThreshold: number;
  private readonly thresholdFrames: number;
  private silentFrames = 0;
  private _isSilent = false;

  /**
   * Creates a silence detector with optional sensitivity tuning.
   *
   * @param options - Threshold and timing overrides.
   */
  public constructor(options: SilenceDetectorOptions = {}) {
    this.rmsThreshold = options.rmsThreshold ?? 0.005;
    const silenceDurationMs = options.silenceDurationMs ?? 3000;
    const frameMs = options.frameMs ?? 100;
    this.thresholdFrames = Math.max(1, Math.ceil(silenceDurationMs / frameMs));
  }

  /** Whether the tab is currently considered silent. */
  public get isSilent(): boolean {
    return this._isSilent;
  }

  /**
   * Updates silence state from the latest frame's RMS level.
   *
   * @param rms - Root-mean-square energy of the current frame.
   * @returns The new `isSilent` value ONLY when it changed, or `null` if unchanged.
   */
  public update(rms: number): boolean | null {
    if (rms < this.rmsThreshold) {
      this.silentFrames += 1;
      if (!this._isSilent && this.silentFrames >= this.thresholdFrames) {
        this._isSilent = true;
        return true;
      }
      return null;
    }

    this.silentFrames = 0;
    if (this._isSilent) {
      this._isSilent = false;
      return false;
    }
    return null;
  }

  /** Resets accumulated silence counters back to active state. */
  public reset(): void {
    this.silentFrames = 0;
    this._isSilent = false;
  }
}
