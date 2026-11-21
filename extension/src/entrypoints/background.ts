/**
 * Manifest V3 service worker coordinating capture lifecycle, offscreen document, overlay mounting
 * and session state stored in `chrome.storage.session`.
 *
 * @module entrypoints/background
 */
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { type ExtensionMessage, parseExtensionMessage } from "../lib/messaging/messages";
import { isCapturableUrl, type SessionEvent, transitionSession } from "../lib/session/reducer";
import { BACKEND_WS_URL } from "../shared/config";
import {
  IDLE_STATE,
  isSessionRunning,
  type SessionErrorCode,
  type SessionState,
} from "../shared/session";
import { sanitizeAvatarSettings } from "../shared/settings";
import { avatarSettingsItem, sessionStateItem } from "../shared/storage";

const OFFSCREEN_PATH = "/offscreen.html";

let sessionLock: Promise<void> = Promise.resolve();
let creatingOffscreen: Promise<void> | null = null;

function serialized(task: () => Promise<void>): void {
  sessionLock = sessionLock.then(task, task);
}

async function applyEvent(event: SessionEvent): Promise<SessionState> {
  const current = await sessionStateItem.getValue();
  const next = transitionSession(current, event);
  await sessionStateItem.setValue(next);
  return next;
}

async function sendToTab(tabId: number, message: ExtensionMessage): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch {
    // Tab may have closed or navigated before delivery.
  }
}

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = browser.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await browser.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });

  if (contexts.length > 0) {
    return;
  }

  if (creatingOffscreen !== null) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = browser.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA"],
    justification: "Capture active tab audio and stream PCM frames over WebSocket.",
  });

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function ensureOverlayMounted(tabId: number, sessionState: SessionState): Promise<void> {
  const settings = sanitizeAvatarSettings(await avatarSettingsItem.getValue());
  const mountMsg: ExtensionMessage = {
    type: "overlay/mount",
    settings,
    sessionState,
  };

  try {
    await browser.tabs.sendMessage(tabId, mountMsg);
  } catch {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["/content-scripts/overlay.js"],
    });
    await browser.tabs.sendMessage(tabId, mountMsg);
  }
}

async function stopActiveSession(options: { unmountOverlay: boolean }): Promise<void> {
  const state = await sessionStateItem.getValue();
  const activeTabId = isSessionRunning(state) ? state.tabId : null;

  await browser.runtime.sendMessage({ type: "offscreen/stop-capture" }).catch(() => undefined);

  if (options.unmountOverlay && activeTabId !== null) {
    await sendToTab(activeTabId, { type: "overlay/unmount" });
  }

  await applyEvent({ type: "stopped" });
}

function classifyCaptureError(err: unknown): SessionErrorCode {
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  if (message.includes("active stream") || message.includes("already being captured")) {
    return "TAB_ALREADY_CAPTURED";
  }
  if (message.includes("cannot be captured") || message.includes("permission")) {
    return "UNSUPPORTED_PAGE";
  }
  return "CAPTURE_FAILED";
}

async function startSession(
  tabId: number,
  initialTitle: string,
  initialUrl: string | undefined,
): Promise<void> {
  let tabTitle = initialTitle;
  let tabUrl = initialUrl;

  if (tabUrl === undefined) {
    const tab = await browser.tabs.get(tabId).catch(() => null);
    tabUrl = tab?.url;
    if (!tabTitle && tab?.title) {
      tabTitle = tab.title;
    }
  }

  if (!isCapturableUrl(tabUrl)) {
    await stopActiveSession({ unmountOverlay: true });
    await applyEvent({ type: "failed", code: "UNSUPPORTED_PAGE" });
    return;
  }

  const current = await sessionStateItem.getValue();
  if (isSessionRunning(current)) {
    await stopActiveSession({ unmountOverlay: true });
  }

  const startingState = await applyEvent({
    type: "start-requested",
    tabId,
    tabTitle,
  });

  let streamId: string;
  try {
    await ensureOffscreenDocument();
    streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (err: unknown) {
    await applyEvent({ type: "failed", code: classifyCaptureError(err) });
    return;
  }

  try {
    await ensureOverlayMounted(tabId, startingState);
  } catch {
    await applyEvent({ type: "failed", code: "UNSUPPORTED_PAGE" });
    return;
  }

  await browser.runtime.sendMessage({
    type: "offscreen/start-capture",
    streamId,
    backendUrl: BACKEND_WS_URL,
  });
}

export default defineBackground(() => {
  // Always reset volatile session state when the browser profile starts fresh.
  void sessionStateItem.setValue(IDLE_STATE);

  avatarSettingsItem.watch((next) => {
    void sessionStateItem.getValue().then((state) => {
      if (isSessionRunning(state)) {
        void sendToTab(state.tabId, {
          type: "overlay/settings",
          settings: sanitizeAvatarSettings(next),
        });
      }
    });
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    serialized(async () => {
      const state = await sessionStateItem.getValue();
      if (isSessionRunning(state) && state.tabId === tabId) {
        await stopActiveSession({ unmountOverlay: false });
      }
    });
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    serialized(async () => {
      const state = await sessionStateItem.getValue();
      if (!isSessionRunning(state) || state.tabId !== tabId) {
        return;
      }

      if (changeInfo.url !== undefined && !isCapturableUrl(changeInfo.url)) {
        await stopActiveSession({ unmountOverlay: false });
        return;
      }

      if (changeInfo.status === "complete") {
        await ensureOverlayMounted(tabId, state).catch(() => undefined);
      }
    });
  });

  browser.runtime.onMessage.addListener((raw: unknown) => {
    const msg = parseExtensionMessage(raw);
    if (msg === null) {
      return false;
    }

    switch (msg.type) {
      case "session/start":
        serialized(() => startSession(msg.tabId, msg.tabTitle, msg.tabUrl));
        return false;

      case "session/stop":
      case "overlay/closed-by-user":
        serialized(() => stopActiveSession({ unmountOverlay: msg.type === "session/stop" }));
        return false;

      case "session/dismiss-error":
        serialized(async () => {
          await applyEvent({ type: "error-dismissed" });
        });
        return false;

      case "offscreen/ready":
        serialized(async () => {
          const next = await applyEvent({ type: "backend-ready" });
          if (isSessionRunning(next)) {
            await sendToTab(next.tabId, { type: "overlay/state", sessionState: next });
          }
        });
        return false;

      case "offscreen/segment":
        void sessionStateItem.getValue().then((state) => {
          if (isSessionRunning(state)) {
            void sendToTab(state.tabId, { type: "overlay/segment", segment: msg.segment });
          }
        });
        return false;

      case "offscreen/silence-changed":
        serialized(async () => {
          const next = await applyEvent({ type: "silence-changed", isSilent: msg.isSilent });
          if (isSessionRunning(next)) {
            await sendToTab(next.tabId, { type: "overlay/state", sessionState: next });
          }
        });
        return false;

      case "offscreen/reconnecting":
        serialized(async () => {
          const next = await applyEvent({ type: "reconnecting", attempt: msg.attempt });
          if (isSessionRunning(next)) {
            await sendToTab(next.tabId, { type: "overlay/state", sessionState: next });
          }
        });
        return false;

      case "offscreen/error":
        serialized(async () => {
          const previous = await sessionStateItem.getValue();
          const prevTabId = isSessionRunning(previous) ? previous.tabId : null;
          const next = await applyEvent({ type: "failed", code: msg.code });
          if (prevTabId !== null) {
            await sendToTab(prevTabId, { type: "overlay/state", sessionState: next });
          }
        });
        return false;

      case "offscreen/stopped":
        serialized(async () => {
          const state = await sessionStateItem.getValue();
          if (isSessionRunning(state)) {
            await sendToTab(state.tabId, { type: "overlay/unmount" });
            await applyEvent({ type: "stopped" });
          }
        });
        return false;

      default:
        return false;
    }
  });
});
