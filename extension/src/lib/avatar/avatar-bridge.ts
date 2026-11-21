/**
 * Typed `postMessage` bridge to the sandboxed VLibras iframe (`avatar.html`).
 *
 * @module lib/avatar/avatar-bridge
 */
import { type AvatarCommand, type AvatarEvent, parseAvatarEvent } from "./protocol";

/** Callbacks notified as the sandboxed VLibras iframe reports lifecycle events. */
export interface AvatarBridgeHandlers {
  onReady: () => void;
  onProgress: (progress: number) => void;
  onAnimationStart: () => void;
  onAnimationEnd: () => void;
  onError: (message: string) => void;
}

/**
 * Wraps `iframe.contentWindow.postMessage` and filters inbound `window` messages to events
 * emitted strictly by that iframe instance.
 */
export class AvatarBridge {
  private readonly iframe: HTMLIFrameElement;
  private readonly handlers: AvatarBridgeHandlers;
  private readonly onMessageBound: (event: MessageEvent<unknown>) => void;
  private disposed = false;

  /**
   * Attaches a message listener scoped to `iframe.contentWindow`.
   *
   * @param iframe - Mounted iframe pointing at `avatar.html`.
   * @param handlers - Lifecycle and animation completion callbacks.
   */
  public constructor(iframe: HTMLIFrameElement, handlers: AvatarBridgeHandlers) {
    this.iframe = iframe;
    this.handlers = handlers;
    this.onMessageBound = (event) => {
      this.handleMessage(event);
    };
    window.addEventListener("message", this.onMessageBound);
  }

  /**
   * Sends a gloss string for immediate signing by the avatar.
   *
   * @param gloss - Gloss or fallback text string to sign.
   */
  public play(gloss: string): void {
    this.post({ type: "avatar/play", gloss });
  }

  /** Pauses the currently playing sign animation. */
  public pause(): void {
    this.post({ type: "avatar/pause" });
  }

  /** Resumes a paused sign animation. */
  public resume(): void {
    this.post({ type: "avatar/resume" });
  }

  /** Stops the current sign animation and clears player state. */
  public stop(): void {
    this.post({ type: "avatar/stop" });
  }

  /**
   * Sets the avatar signing speed multiplier (`0.5` to `2.0`).
   *
   * @param speed - Playback speed multiplier.
   */
  public setSpeed(speed: number): void {
    this.post({ type: "avatar/set-speed", speed });
  }

  /** Removes global listeners when the overlay unmounts. */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    window.removeEventListener("message", this.onMessageBound);
  }

  private post(command: AvatarCommand): void {
    if (this.disposed) {
      return;
    }
    // Sandboxed pages have an opaque (`null`) origin, so targetOrigin must be `*`.
    // Inbound messages are verified strictly via `event.source === this.iframe.contentWindow`.
    this.iframe.contentWindow?.postMessage(command, "*");
  }

  private handleMessage(event: MessageEvent<unknown>): void {
    if (this.disposed || event.source !== this.iframe.contentWindow) {
      return;
    }
    const parsed: AvatarEvent | null = parseAvatarEvent(event.data);
    if (parsed === null) {
      return;
    }

    switch (parsed.type) {
      case "avatar/ready":
        this.handlers.onReady();
        break;
      case "avatar/progress":
        this.handlers.onProgress(parsed.progress);
        break;
      case "avatar/animation-start":
        this.handlers.onAnimationStart();
        break;
      case "avatar/animation-end":
        this.handlers.onAnimationEnd();
        break;
      case "avatar/error":
        this.handlers.onError(parsed.message);
        break;
    }
  }
}
