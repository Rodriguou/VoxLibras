import { describe, expect, it } from "vitest";

import { IDLE_STATE } from "../../shared/session";
import { isCapturableUrl, transitionSession } from "./reducer";

describe("isCapturableUrl", () => {
  it("allows http and https video sites while rejecting internal and store URLs", () => {
    expect(isCapturableUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isCapturableUrl("http://localhost:3000/demo.html")).toBe(true);
    expect(isCapturableUrl("chrome://extensions")).toBe(false);
    expect(isCapturableUrl("edge://settings")).toBe(false);
    expect(isCapturableUrl("about:blank")).toBe(false);
    expect(isCapturableUrl("file:///C:/video.mp4")).toBe(false);
    expect(isCapturableUrl("https://chromewebstore.google.com/detail/foo")).toBe(false);
    expect(isCapturableUrl("https://chrome.google.com/webstore/category/extensions")).toBe(false);
    expect(isCapturableUrl(undefined)).toBe(false);
  });
});

describe("transitionSession", () => {
  it("follows happy lifecycle: idle -> starting -> active -> reconnecting -> active -> idle", () => {
    const s1 = transitionSession(IDLE_STATE, {
      type: "start-requested",
      tabId: 42,
      tabTitle: "YouTube",
    });
    expect(s1).toEqual({ status: "starting", tabId: 42, tabTitle: "YouTube" });

    const s2 = transitionSession(s1, { type: "backend-ready" });
    expect(s2).toEqual({ status: "active", tabId: 42, tabTitle: "YouTube", isSilent: false });

    const s3 = transitionSession(s2, { type: "silence-changed", isSilent: true });
    expect(s3).toEqual({ status: "active", tabId: 42, tabTitle: "YouTube", isSilent: true });

    const s4 = transitionSession(s3, { type: "reconnecting", attempt: 1 });
    expect(s4).toEqual({ status: "reconnecting", tabId: 42, tabTitle: "YouTube", attempt: 1 });

    const s5 = transitionSession(s4, { type: "backend-ready" });
    expect(s5).toEqual({ status: "active", tabId: 42, tabTitle: "YouTube", isSilent: false });

    const s6 = transitionSession(s5, { type: "stopped" });
    expect(s6).toEqual(IDLE_STATE);
  });

  it("handles error and dismissal", () => {
    const err = transitionSession(IDLE_STATE, { type: "failed", code: "UNSUPPORTED_PAGE" });
    expect(err).toEqual({ status: "error", code: "UNSUPPORTED_PAGE" });
    expect(transitionSession(err, { type: "error-dismissed" })).toEqual(IDLE_STATE);
  });
});
