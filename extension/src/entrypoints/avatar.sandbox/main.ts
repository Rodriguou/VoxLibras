/**
 * Sandboxed page hosting the bundled VLibras Unity WebGL avatar.
 *
 * Chrome Manifest V3 allows `unsafe-eval` only inside sandboxed pages (`avatar.html`).
 * Because sandboxed pages have an opaque (`null`) origin and zero `chrome.*` APIs, all commands
 * and lifecycle events cross the boundary strictly via `window.postMessage`.
 *
 * @module entrypoints/avatar.sandbox/main
 */
import { type AvatarEvent, parseAvatarCommand } from "../../lib/avatar/protocol";
import { VLIBRAS_DICTIONARY_URL } from "../../shared/config";

interface UnityInstance {
  SendMessage: (gameObject: string, method: string, param?: string | number) => void;
}

interface UnityLoaderGlobal {
  SystemInfo: { hasWebGL: boolean };
  instantiate: (
    containerId: string,
    manifestUrl: string,
    options: {
      compatibilityCheck: (instance: unknown, accept: () => void, deny: () => void) => void;
    },
  ) => UnityInstance;
}

declare global {
  interface Window {
    UnityLoader?: UnityLoaderGlobal;
    onLoadPlayer?: () => void;
    updateProgress?: (progress: number) => void;
    onPlayingStateChange?: (
      isPlaying: boolean | string,
      isPaused: boolean | string,
      isPlayingIntervalAnimation: boolean | string,
      isLoading: boolean | string,
      isRepeatable: boolean | string,
    ) => void;
    CounterGloss?: (counter: number, glossLength: number) => void;
    GetAvatar?: (avatar: string) => void;
    FinishWelcome?: (finished: boolean | string) => void;
  }
}

const GAME_OBJECT = "PlayerManager";

type GlossState = "idle" | "preparing" | "playing";

let unityInstance: UnityInstance | null = null;
let loaded = false;
let glossState: GlossState = "idle";

function postToHost(event: AvatarEvent): void {
  window.parent.postMessage(event, "*");
}

function toUnityBool(value: boolean | string): boolean {
  return value === true || value === "True";
}

function sendToPlayer(method: string, param?: string | number): void {
  if (!unityInstance || !loaded) {
    return;
  }
  unityInstance.SendMessage(GAME_OBJECT, method, param);
}

// Unity WebGL invokes these global callbacks on `window` from Emscripten.
window.onLoadPlayer = () => {
  loaded = true;
  sendToPlayer("initRandomAnimationsProcess");
  sendToPlayer("setBaseUrl", VLIBRAS_DICTIONARY_URL);
  sendToPlayer("setSubtitlesState", 0);
  postToHost({ type: "avatar/ready" });
};

window.updateProgress = (progress: number) => {
  postToHost({ type: "avatar/progress", progress });
};

window.onPlayingStateChange = (isPlaying, isPaused, _interval, isLoading) => {
  const playing = toUnityBool(isPlaying);
  const paused = toUnityBool(isPaused);
  const loading = toUnityBool(isLoading);

  if (playing && !paused && glossState === "preparing") {
    glossState = "playing";
    postToHost({ type: "avatar/animation-start" });
  } else if (!playing && !loading && glossState === "playing") {
    glossState = "idle";
    postToHost({ type: "avatar/animation-end" });
  }
};

window.CounterGloss = () => {
  // Expected by Unity build; unused in VoxLibras.
};

window.GetAvatar = () => {
  // Expected by Unity build; unused in VoxLibras.
};

window.FinishWelcome = () => {
  // Expected by Unity build; unused in VoxLibras.
};

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent) {
    return;
  }
  const command = parseAvatarCommand(event.data);
  if (command === null) {
    return;
  }

  switch (command.type) {
    case "avatar/play": {
      const gloss = command.gloss.trim();
      if (!gloss) {
        glossState = "idle";
        postToHost({ type: "avatar/animation-end" });
        return;
      }
      glossState = "preparing";
      sendToPlayer("playNow", gloss);
      break;
    }
    case "avatar/pause":
      sendToPlayer("setPauseState", 1);
      break;
    case "avatar/resume":
      sendToPlayer("setPauseState", 0);
      break;
    case "avatar/stop":
      glossState = "idle";
      sendToPlayer("stopAll");
      break;
    case "avatar/set-speed":
      sendToPlayer("setSlider", command.speed);
      break;
  }
});

function bootUnity(): void {
  const loader = window.UnityLoader;
  if (!loader) {
    postToHost({ type: "avatar/error", message: "UnityLoader não foi encontrado no pacote." });
    return;
  }

  try {
    unityInstance = loader.instantiate("gameContainer", "vlibras/playerweb.json", {
      compatibilityCheck: (_instance, accept, deny) => {
        if (loader.SystemInfo.hasWebGL) {
          accept();
          return;
        }
        postToHost({
          type: "avatar/error",
          message: "Seu navegador não possui suporte a WebGL ativo.",
        });
        deny();
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Falha ao inicializar Unity WebGL.";
    postToHost({ type: "avatar/error", message });
  }
}

bootUnity();
