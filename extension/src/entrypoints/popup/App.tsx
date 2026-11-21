/**
 * Root popup state coordinator subscribing to storage items and active tab info.
 *
 * The popup closes whenever focus leaves it, so it holds no session state of its own;
 * `chrome.storage.session` + the service worker remain the single source of truth.
 *
 * @module entrypoints/popup/App
 */
import { type ReactNode, useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { DashboardScreen } from "../../features/dashboard/DashboardScreen";
import { OnboardingScreen } from "../../features/onboarding/OnboardingScreen";
import { SettingsScreen } from "../../features/settings/SettingsScreen";
import type { ExtensionMessage } from "../../lib/messaging/messages";
import { IDLE_STATE, type SessionState } from "../../shared/session";
import {
  type AvatarSettings,
  DEFAULT_AVATAR_SETTINGS,
  sanitizeAvatarSettings,
} from "../../shared/settings";
import {
  avatarSettingsItem,
  onboardingCompletedItem,
  sessionStateItem,
} from "../../shared/storage";

type PopupRoute = "dashboard" | "settings";

interface ActiveTabInfo {
  id: number | null;
  title: string;
  url: string | undefined;
}

/**
 * Top-level popup router choosing between Onboarding, Dashboard and Settings.
 */
export function App(): ReactNode {
  const [loaded, setLoaded] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [route, setRoute] = useState<PopupRoute>("dashboard");
  const [settings, setSettings] = useState<AvatarSettings>(DEFAULT_AVATAR_SETTINGS);
  const [sessionState, setSessionState] = useState<SessionState>(IDLE_STATE);
  const [activeTab, setActiveTab] = useState<ActiveTabInfo>({
    id: null,
    title: "",
    url: undefined,
  });

  useEffect(() => {
    let active = true;

    async function hydrate(): Promise<void> {
      const [done, rawSettings, currentSession, tabs] = await Promise.all([
        onboardingCompletedItem.getValue(),
        avatarSettingsItem.getValue(),
        sessionStateItem.getValue(),
        browser.tabs.query({ active: true, currentWindow: true }),
      ]);
      if (!active) {
        return;
      }
      const tab = tabs[0];
      setOnboardingDone(done);
      setSettings(sanitizeAvatarSettings(rawSettings));
      setSessionState(currentSession);
      setActiveTab({
        id: tab?.id ?? null,
        title: tab?.title ?? "",
        url: tab?.url,
      });
      setLoaded(true);
    }

    void hydrate();

    const unwatchOnboarding = onboardingCompletedItem.watch((next) => {
      setOnboardingDone(next);
    });
    const unwatchSettings = avatarSettingsItem.watch((next) => {
      setSettings(sanitizeAvatarSettings(next));
    });
    const unwatchSession = sessionStateItem.watch((next) => {
      setSessionState(next);
    });

    return () => {
      active = false;
      unwatchOnboarding();
      unwatchSettings();
      unwatchSession();
    };
  }, []);

  if (!loaded) {
    return <div className="bg-surface min-h-[460px] w-[340px]" />;
  }

  if (!onboardingDone) {
    return (
      <OnboardingScreen
        onComplete={() => {
          setOnboardingDone(true);
          void onboardingCompletedItem.setValue(true);
        }}
      />
    );
  }

  if (route === "settings") {
    return (
      <SettingsScreen
        settings={settings}
        onChange={(next) => {
          setSettings(next);
          void avatarSettingsItem.setValue(next);
        }}
        onBack={() => {
          setRoute("dashboard");
        }}
      />
    );
  }

  function sendToBackground(message: ExtensionMessage): void {
    void browser.runtime.sendMessage(message);
  }

  return (
    <DashboardScreen
      sessionState={sessionState}
      currentTabId={activeTab.id}
      onStart={() => {
        if (activeTab.id === null) {
          return;
        }
        sendToBackground({
          type: "session/start",
          tabId: activeTab.id,
          tabTitle: activeTab.title,
          ...(activeTab.url !== undefined ? { tabUrl: activeTab.url } : {}),
        });
      }}
      onStop={() => {
        sendToBackground({ type: "session/stop" });
      }}
      onDismissError={() => {
        sendToBackground({ type: "session/dismiss-error" });
      }}
      onOpenSettings={() => {
        setRoute("settings");
      }}
    />
  );
}
