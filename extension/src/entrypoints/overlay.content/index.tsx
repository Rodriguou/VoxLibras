/**
 * Content script injecting the Shadow DOM host for {@link OverlayWidget} on demand.
 *
 * Mounting inside a Shadow Root (`cssInjectionMode: "ui"`) isolates Tailwind styles from the host
 * webpage, and explicitly resetting `font-size: 16px` prevents sites such as YouTube from scaling
 * `rem`-based layout dimensions.
 *
 * @module entrypoints/overlay.content
 */
import "../../styles/globals.css";

import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";

import { OverlayWidget } from "../../features/overlay/OverlayWidget";
import { parseExtensionMessage } from "../../lib/messaging/messages";
import type { GlossSegment } from "../../shared/segment";
import { IDLE_STATE, type SessionState } from "../../shared/session";
import {
  type AvatarSettings,
  DEFAULT_AVATAR_SETTINGS,
  sanitizeAvatarSettings,
} from "../../shared/settings";
import { avatarSettingsItem } from "../../shared/storage";

interface OverlayStoreSnapshot {
  settings: AvatarSettings;
  sessionState: SessionState;
  latestSegment: GlossSegment | null;
}

type Listener = (snapshot: OverlayStoreSnapshot) => void;

class OverlayStore {
  private snapshot: OverlayStoreSnapshot = {
    settings: DEFAULT_AVATAR_SETTINGS,
    sessionState: IDLE_STATE,
    latestSegment: null,
  };
  private listeners = new Set<Listener>();

  public getSnapshot(): OverlayStoreSnapshot {
    return this.snapshot;
  }

  public update(patch: Partial<OverlayStoreSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

function OverlayContainer({ store, onClose }: { store: OverlayStore; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<OverlayStoreSnapshot>(() => store.getSnapshot());

  useEffect(() => store.subscribe(setSnapshot), [store]);

  return (
    <OverlayWidget
      settings={snapshot.settings}
      sessionState={snapshot.sessionState}
      latestSegment={snapshot.latestSegment}
      onClose={onClose}
      onAvatarReady={() => {
        void browser.runtime.sendMessage({ type: "overlay/avatar-ready" });
      }}
      onAvatarError={() => {
        void browser.runtime.sendMessage({ type: "overlay/avatar-error" });
      }}
    />
  );
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  cssInjectionMode: "ui",

  main(ctx) {
    const store = new OverlayStore();
    let ui: ShadowRootContentScriptUi<Root> | null = null;

    const unmountOverlay = (): void => {
      if (ui) {
        ui.remove();
        ui = null;
      }
      store.update({ latestSegment: null });
    };

    const mountOverlay = async (
      settings: AvatarSettings,
      sessionState: SessionState,
    ): Promise<void> => {
      store.update({
        settings: sanitizeAvatarSettings(settings),
        sessionState,
      });

      if (ui) {
        return;
      }

      ui = await createShadowRootUi(ctx, {
        name: "voxlibras-overlay",
        position: "overlay",
        anchor: "body",
        onMount: (container) => {
          const wrapper = document.createElement("div");
          wrapper.style.fontSize = "16px";
          container.append(wrapper);
          const root = createRoot(wrapper);
          root.render(
            <OverlayContainer
              store={store}
              onClose={() => {
                unmountOverlay();
                void browser.runtime.sendMessage({ type: "overlay/closed-by-user" });
              }}
            />,
          );
          return root;
        },
        onRemove: (root) => {
          root?.unmount();
        },
      });

      ui.mount();
    };

    const unwatchSettings = avatarSettingsItem.watch((next) => {
      store.update({ settings: sanitizeAvatarSettings(next) });
    });

    browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
      const msg = parseExtensionMessage(raw);
      if (msg === null) {
        return false;
      }

      switch (msg.type) {
        case "overlay/mount":
          void mountOverlay(msg.settings, msg.sessionState).then(() => {
            sendResponse({ ok: true });
          });
          return true;
        case "overlay/unmount":
          unmountOverlay();
          sendResponse({ ok: true });
          return false;
        case "overlay/segment":
          store.update({ latestSegment: msg.segment });
          return false;
        case "overlay/state":
          store.update({ sessionState: msg.sessionState });
          return false;
        case "overlay/settings":
          store.update({ settings: sanitizeAvatarSettings(msg.settings) });
          return false;
        default:
          return false;
      }
    });

    ctx.onInvalidated(() => {
      unwatchSettings();
      unmountOverlay();
    });
  },
});
