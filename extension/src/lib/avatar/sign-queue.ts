/**
 * Bounded FIFO queue governing which translated segment the 3D avatar signs next.
 *
 * Because spoken Portuguese can outpace Libras signing at 1.0x speed, an unbounded queue would
 * accumulate multi-minute lag. This queue caps pending segments (`maxPending`) and drops the
 * oldest backlog items so the avatar stays synchronized with recent speech at low latency.
 *
 * @module lib/avatar/sign-queue
 */
import type { GlossSegment } from "../../shared/segment";

/** Options configuring {@link SignQueue}. */
export interface SignQueueOptions {
  /** Maximum number of queued segments waiting behind the current one (default `3`). */
  maxPending?: number;
  /** Invoked whenever a segment should begin signing immediately on the avatar. */
  onStartSegment: (segment: GlossSegment) => void;
  /** Invoked whenever the queue drains completely and no segment is playing. */
  onIdle?: () => void;
}

/**
 * Coordinates sequential playback and bounded backlog shedding for Libras segments.
 */
export class SignQueue {
  private readonly maxPending: number;
  private readonly onStartSegment: (segment: GlossSegment) => void;
  private readonly onIdle: (() => void) | undefined;

  private pending: GlossSegment[] = [];
  private _current: GlossSegment | null = null;
  private _paused = false;
  private _droppedCount = 0;

  /**
   * Creates a sign queue.
   *
   * @param options - Queue capacity and playback callbacks.
   */
  public constructor(options: SignQueueOptions) {
    this.maxPending = Math.max(1, options.maxPending ?? 3);
    this.onStartSegment = options.onStartSegment;
    this.onIdle = options.onIdle;
  }

  /** Segment currently being signed, or `null` when idle. */
  public get current(): GlossSegment | null {
    return this._current;
  }

  /** Number of pending segments waiting behind the current one. */
  public get pendingCount(): number {
    return this.pending.length;
  }

  /** Whether playback is currently paused by the user. */
  public get isPaused(): boolean {
    return this._paused;
  }

  /** Total segments dropped due to backlog overflow (useful for diagnostics). */
  public get droppedCount(): number {
    return this._droppedCount;
  }

  /**
   * Enqueues a newly translated segment, starting it immediately if idle and unpaused.
   *
   * @param segment - Segment produced by the backend.
   */
  public enqueue(segment: GlossSegment): void {
    if (!this._paused && this._current === null) {
      this._current = segment;
      this.onStartSegment(segment);
      return;
    }

    this.pending.push(segment);
    while (this.pending.length > this.maxPending) {
      this.pending.shift();
      this._droppedCount += 1;
    }
  }

  /** Advances to the next queued segment once the avatar finishes signing the current one. */
  public onAnimationEnd(): void {
    this._current = null;
    if (this._paused) {
      return;
    }
    this.dispatchNext();
  }

  /** Suspends dispatching new segments; current playback pause is handled by the bridge. */
  public pause(): void {
    this._paused = true;
  }

  /** Resumes dispatching; starts the next queued segment if nothing is currently active. */
  public resume(): void {
    if (!this._paused) {
      return;
    }
    this._paused = false;
    if (this._current === null) {
      this.dispatchNext();
    }
  }

  /** Empties all pending and active state. */
  public clear(): void {
    this.pending = [];
    this._current = null;
    this._paused = false;
    this.onIdle?.();
  }

  private dispatchNext(): void {
    const next = this.pending.shift();
    if (next === undefined) {
      this.onIdle?.();
      return;
    }
    this._current = next;
    this.onStartSegment(next);
  }
}
