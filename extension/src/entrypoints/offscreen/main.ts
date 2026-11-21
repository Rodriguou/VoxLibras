/**
 * Offscreen document capturing tab audio via `getUserMedia`, routing playback back to speakers
 * so the tab is not muted, and streaming 16 kHz PCM16 frames to the backend WebSocket.
 *
 * Audio and transcripts are processed strictly in memory for privacy/LGPD compliance and never
 * touch disk.
 *
 * @module entrypoints/offscreen/main
 */
import { browser } from "wxt/browser";

import { SilenceDetector } from "../../lib/audio/silence";
import { type ExtensionMessage, parseExtensionMessage } from "../../lib/messaging/messages";
import { TranslationSocket } from "../../lib/transport/translation-socket";

interface TabCaptureConstraints extends MediaTrackConstraints {
  mandatory: {
    chromeMediaSource: "tab";
    chromeMediaSourceId: string;
  };
}

interface ActiveCapture {
  stream: MediaStream;
  audioContext: AudioContext;
  workletNode: AudioWorkletNode;
  socket: TranslationSocket;
}

let activeCapture: ActiveCapture | null = null;

function notifyServiceWorker(message: ExtensionMessage): void {
  void browser.runtime.sendMessage(message).catch(() => {
    // Ignore when service worker is restarting or extension is unloading.
  });
}

async function captureTabAudio(streamId: string): Promise<MediaStream> {
  const constraints: TabCaptureConstraints = {
    mandatory: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: streamId,
    },
  };
  return navigator.mediaDevices.getUserMedia({
    audio: constraints,
    video: false,
  });
}

async function teardownCapture(notifyStopped: boolean): Promise<void> {
  const current = activeCapture;
  activeCapture = null;
  if (!current) {
    if (notifyStopped) {
      notifyServiceWorker({ type: "offscreen/stopped" });
    }
    return;
  }

  current.workletNode.port.onmessage = null;
  current.workletNode.disconnect();
  current.socket.close();

  for (const track of current.stream.getTracks()) {
    track.onended = null;
    track.stop();
  }

  await current.audioContext.close().catch(() => undefined);

  if (notifyStopped) {
    notifyServiceWorker({ type: "offscreen/stopped" });
  }
}

async function startCapture(streamId: string, backendUrl: string): Promise<void> {
  await teardownCapture(false);

  let stream: MediaStream;
  try {
    stream = await captureTabAudio(streamId);
  } catch {
    notifyServiceWorker({ type: "offscreen/error", code: "CAPTURE_FAILED" });
    return;
  }

  const audioContext = new AudioContext();
  try {
    const source = audioContext.createMediaStreamSource(stream);
    // Connecting the captured stream back to `destination` keeps audio audible to the user.
    source.connect(audioContext.destination);

    await audioContext.audioWorklet.addModule(browser.runtime.getURL("/pcm-worklet.js"));
    const workletNode = new AudioWorkletNode(audioContext, "pcm-capture-processor");
    source.connect(workletNode);

    const silenceDetector = new SilenceDetector({
      rmsThreshold: 0.005,
      silenceDurationMs: 3000,
      frameMs: 100,
    });

    const socket = new TranslationSocket({
      url: backendUrl,
      handlers: {
        onReady: () => {
          notifyServiceWorker({ type: "offscreen/ready" });
        },
        onSegment: (segment) => {
          notifyServiceWorker({ type: "offscreen/segment", segment });
        },
        onReconnecting: (attempt) => {
          notifyServiceWorker({ type: "offscreen/reconnecting", attempt });
        },
        onError: (code) => {
          notifyServiceWorker({ type: "offscreen/error", code });
          void teardownCapture(false);
        },
        onClosed: () => {
          // Handled explicitly by `teardownCapture`.
        },
      },
    });

    const capture: ActiveCapture = { stream, audioContext, workletNode, socket };
    activeCapture = capture;

    workletNode.port.onmessage = (event: MessageEvent<unknown>) => {
      if (activeCapture !== capture) {
        return;
      }
      const data = event.data;
      if (typeof data !== "object" || data === null) {
        return;
      }
      const payload = data as { buffer?: unknown; rms?: unknown };
      if (!(payload.buffer instanceof ArrayBuffer) || typeof payload.rms !== "number") {
        return;
      }

      const silentChange = silenceDetector.update(payload.rms);
      if (silentChange !== null) {
        notifyServiceWorker({ type: "offscreen/silence-changed", isSilent: silentChange });
      }
      socket.sendAudio(payload.buffer);
    };

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.onended = () => {
        if (activeCapture === capture) {
          void teardownCapture(true);
        }
      };
    }

    socket.connect();
  } catch {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    await audioContext.close().catch(() => undefined);
    notifyServiceWorker({ type: "offscreen/error", code: "CAPTURE_FAILED" });
  }
}

browser.runtime.onMessage.addListener((raw: unknown) => {
  const msg = parseExtensionMessage(raw);
  if (msg === null) {
    return false;
  }

  switch (msg.type) {
    case "offscreen/start-capture":
      void startCapture(msg.streamId, msg.backendUrl);
      return false;
    case "offscreen/stop-capture":
      void teardownCapture(true);
      return false;
    default:
      return false;
  }
});
