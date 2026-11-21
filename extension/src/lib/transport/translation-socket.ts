/**
 * Reconnecting WebSocket client speaking the VoxLibras `/ws/translate` protocol.
 *
 * Audio frames sent while the socket is still connecting or reconnecting are dropped (real-time
 * streams never replay stale audio). Fatal server errors (`INVALID_MESSAGE`, `STT_NOT_CONFIGURED`,
 * `STT_FAILED`) stop reconnection immediately and surface the mapped {@link SessionErrorCode}.
 *
 * @module lib/transport/translation-socket
 */
import { SPEECH_LANGUAGE, TARGET_SAMPLE_RATE } from "../../shared/config";
import type { GlossSegment } from "../../shared/segment";
import type { SessionErrorCode } from "../../shared/session";
import { parseServerMessage, type StartMessage, type StopMessage } from "./protocol";

const RECONNECT_DELAYS_MS = [500, 1500, 3000] as const;

/** Callbacks invoked by {@link TranslationSocket} as connection and segment events arrive. */
export interface TranslationSocketHandlers {
  onReady: () => void;
  onSegment: (segment: GlossSegment) => void;
  onReconnecting: (attempt: number) => void;
  onError: (code: SessionErrorCode) => void;
  onClosed: () => void;
}

/** Options configuring a {@link TranslationSocket} connection. */
export interface TranslationSocketOptions {
  url: string;
  sampleRate?: number;
  language?: string;
  handlers: TranslationSocketHandlers;
}

function mapServerErrorCode(code: string): SessionErrorCode {
  switch (code) {
    case "STT_NOT_CONFIGURED":
      return "STT_NOT_CONFIGURED";
    case "STT_FAILED":
      return "STT_FAILED";
    default:
      return "UNKNOWN";
  }
}

/**
 * Manages the WebSocket lifecycle, handshake, binary PCM streaming and bounded reconnects.
 */
export class TranslationSocket {
  private readonly url: string;
  private readonly sampleRate: number;
  private readonly language: string;
  private readonly handlers: TranslationSocketHandlers;

  private ws: WebSocket | null = null;
  private ready = false;
  private closedByCaller = false;
  private fatalErrorReceived = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Builds a socket wrapper; call {@link connect} to open the connection.
   *
   * @param options - Connection settings and lifecycle handlers.
   */
  public constructor(options: TranslationSocketOptions) {
    this.url = options.url;
    this.sampleRate = options.sampleRate ?? TARGET_SAMPLE_RATE;
    this.language = options.language ?? SPEECH_LANGUAGE;
    this.handlers = options.handlers;
  }

  /** Opens the WebSocket and initiates the `start`/`ready` handshake. */
  public connect(): void {
    if (this.closedByCaller) {
      return;
    }
    this.openSocket();
  }

  /**
   * Sends a raw PCM16 frame if the handshake is complete and the socket is open.
   *
   * @param buffer - PCM16 little-endian mono bytes.
   */
  public sendAudio(buffer: ArrayBuffer): void {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(buffer);
  }

  /** Gracefully stops the remote recognition stream and closes the socket without reconnecting. */
  public close(): void {
    this.closedByCaller = true;
    this.ready = false;
    this.clearReconnectTimer();

    const socket = this.ws;
    this.ws = null;
    if (!socket) {
      this.handlers.onClosed();
      return;
    }

    if (socket.readyState === WebSocket.OPEN) {
      const stopMessage: StopMessage = { type: "stop" };
      socket.send(JSON.stringify(stopMessage));
      socket.close(1000, "client_stop");
    } else if (socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    this.handlers.onClosed();
  }

  private openSocket(): void {
    const socket = new WebSocket(this.url);
    socket.binaryType = "arraybuffer";
    this.ws = socket;
    this.ready = false;

    socket.onopen = () => {
      if (this.ws !== socket || this.closedByCaller) {
        return;
      }
      const startMessage: StartMessage = {
        type: "start",
        sampleRate: this.sampleRate,
        language: this.language,
      };
      socket.send(JSON.stringify(startMessage));
    };

    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (this.ws !== socket || typeof event.data !== "string") {
        return;
      }
      const message = parseServerMessage(event.data);
      if (!message) {
        return;
      }

      switch (message.type) {
        case "ready":
          this.ready = true;
          this.reconnectAttempt = 0;
          this.handlers.onReady();
          break;
        case "segment":
          this.handlers.onSegment({
            id: message.id,
            text: message.text,
            gloss: message.gloss,
          });
          break;
        case "error":
          this.fatalErrorReceived = true;
          this.ready = false;
          this.handlers.onError(mapServerErrorCode(message.code));
          break;
      }
    };

    socket.onclose = () => {
      if (this.ws !== socket) {
        return;
      }
      this.ws = null;
      this.ready = false;

      if (this.closedByCaller || this.fatalErrorReceived) {
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt];
    if (delay === undefined) {
      this.handlers.onError("BACKEND_UNAVAILABLE");
      return;
    }
    this.reconnectAttempt += 1;
    this.handlers.onReconnecting(this.reconnectAttempt);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByCaller) {
        this.openSocket();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
