/**
 * Pure session state machine and URL eligibility rules owned by the background service worker.
 *
 * Keeping transitions pure lets Vitest cover every edge case without mocking Chrome APIs.
 *
 * @module lib/session/reducer
 */
import { IDLE_STATE, type SessionErrorCode, type SessionState } from "../../shared/session";

/** Events that drive {@link transitionSession}. */
export type SessionEvent =
  | { type: "start-requested"; tabId: number; tabTitle: string }
  | { type: "backend-ready" }
  | { type: "silence-changed"; isSilent: boolean }
  | { type: "reconnecting"; attempt: number }
  | { type: "failed"; code: SessionErrorCode }
  | { type: "stopped" }
  | { type: "error-dismissed" };

const BLOCKED_HOSTS = new Set(["chromewebstore.google.com"]);

/**
 * Checks whether Chrome permits `tabCapture` and content-script injection on a URL.
 *
 * Only regular `http:` / `https:` pages can be captured; internal browser pages (`chrome://`,
 * `edge://`, `about:`), PDF/extension pages and the Chrome Web Store are rejected up front.
 *
 * @param rawUrl - Candidate tab URL.
 * @returns `true` if the tab can be captured and overlaid.
 */
export function isCapturableUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  if (BLOCKED_HOSTS.has(parsed.hostname)) {
    return false;
  }
  if (parsed.hostname === "chrome.google.com" && parsed.pathname.startsWith("/webstore")) {
    return false;
  }
  return true;
}

/**
 * Advances the single translation session state machine.
 *
 * @param state - Current session state.
 * @param event - Event produced by user action, offscreen capture or tab lifecycle.
 * @returns Next immutable session state.
 */
export function transitionSession(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case "start-requested":
      return {
        status: "starting",
        tabId: event.tabId,
        tabTitle: event.tabTitle,
      };

    case "backend-ready":
      if (state.status === "starting" || state.status === "reconnecting") {
        return {
          status: "active",
          tabId: state.tabId,
          tabTitle: state.tabTitle,
          isSilent: false,
        };
      }
      return state;

    case "silence-changed":
      if (state.status === "active") {
        return { ...state, isSilent: event.isSilent };
      }
      return state;

    case "reconnecting":
      if (
        state.status === "starting" ||
        state.status === "active" ||
        state.status === "reconnecting"
      ) {
        return {
          status: "reconnecting",
          tabId: state.tabId,
          tabTitle: state.tabTitle,
          attempt: event.attempt,
        };
      }
      return state;

    case "failed":
      return { status: "error", code: event.code };

    case "stopped":
      return IDLE_STATE;

    case "error-dismissed":
      return state.status === "error" ? IDLE_STATE : state;
  }
}
