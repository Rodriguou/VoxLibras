/**
 * Typed wrappers around `chrome.storage` built on WXT's storage helper.
 *
 * - `local:` survives browser restarts → user avatar preferences and onboarding state.
 * - `session:` lives in memory only and is wiped when the browser closes → volatile session state.
 *
 * Transcripts are NEVER stored here (volatile in-memory processing for LGPD/LBI compliance).
 *
 * @module shared/storage
 */
import { storage } from "wxt/utils/storage";

import { type AvatarSettings, DEFAULT_AVATAR_SETTINGS } from "./settings";
import { IDLE_STATE, type SessionState } from "./session";

/** Avatar preferences chosen in the settings screen. */
export const avatarSettingsItem = storage.defineItem<AvatarSettings>("local:avatarSettings", {
  fallback: { ...DEFAULT_AVATAR_SETTINGS },
});

/** Whether the user already went through the onboarding carousel. */
export const onboardingCompletedItem = storage.defineItem<boolean>("local:onboardingCompleted", {
  fallback: false,
});

/** Current translation session; written only by the service worker. */
export const sessionStateItem = storage.defineItem<SessionState>("session:sessionState", {
  fallback: IDLE_STATE,
});
