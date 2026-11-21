import { describe, expect, it, vi } from "vitest";

import type { GlossSegment } from "../../shared/segment";
import { SignQueue } from "./sign-queue";

const seg = (id: string): GlossSegment => ({ id, text: `texto ${id}`, gloss: `GLOSA_${id}` });

describe("SignQueue", () => {
  it("plays immediately when idle and drains pending segments FIFO", () => {
    const started: string[] = [];
    const onIdle = vi.fn();
    const queue = new SignQueue({
      maxPending: 3,
      onStartSegment: (s) => started.push(s.id),
      onIdle,
    });

    queue.enqueue(seg("1"));
    queue.enqueue(seg("2"));
    expect(started).toEqual(["1"]);
    expect(queue.current?.id).toBe("1");
    expect(queue.pendingCount).toBe(1);

    queue.onAnimationEnd();
    expect(started).toEqual(["1", "2"]);
    expect(queue.current?.id).toBe("2");

    queue.onAnimationEnd();
    expect(queue.current).toBeNull();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("drops oldest pending segments when backlog exceeds maxPending", () => {
    const started: string[] = [];
    const queue = new SignQueue({
      maxPending: 2,
      onStartSegment: (s) => started.push(s.id),
    });

    queue.enqueue(seg("1")); // active
    queue.enqueue(seg("2"));
    queue.enqueue(seg("3"));
    queue.enqueue(seg("4")); // drops "2"

    expect(queue.droppedCount).toBe(1);
    expect(queue.pendingCount).toBe(2);

    queue.onAnimationEnd();
    queue.onAnimationEnd();
    expect(started).toEqual(["1", "3", "4"]);
  });

  it("supports pause, resume and clear", () => {
    const started: string[] = [];
    const queue = new SignQueue({
      onStartSegment: (s) => started.push(s.id),
    });

    queue.pause();
    queue.enqueue(seg("1"));
    expect(started).toEqual([]);
    expect(queue.isPaused).toBe(true);

    queue.resume();
    expect(started).toEqual(["1"]);

    queue.enqueue(seg("2"));
    queue.clear();
    expect(queue.current).toBeNull();
    expect(queue.pendingCount).toBe(0);
  });
});
