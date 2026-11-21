/**
 * Floating draggable Libras avatar overlay rendered inside the page's Shadow DOM.
 *
 * Hosts the sandboxed VLibras WebGL iframe, enforces the bounded {@link SignQueue} backlog
 * policy, keeps drag offsets session-only and renders only the active segment's caption without
 * history or text selection (accessibility-only usage under LBI guidelines).
 *
 * @module features/overlay/OverlayWidget
 */
import { GripVertical, Loader2, Pause, Play, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";

import { AvatarBridge } from "../../lib/avatar/avatar-bridge";
import { SignQueue } from "../../lib/avatar/sign-queue";
import { type GlossSegment, signableText } from "../../shared/segment";
import { SESSION_ERROR_MESSAGES, type SessionState } from "../../shared/session";
import { AVATAR_DIMENSIONS, type AvatarPosition, type AvatarSettings } from "../../shared/settings";

const VIEWPORT_MARGIN_PX = 20;

/** Props for {@link OverlayWidget}. */
export interface OverlayWidgetProps {
  settings: AvatarSettings;
  sessionState: SessionState;
  latestSegment: GlossSegment | null;
  onClose: () => void;
  onAvatarReady: () => void;
  onAvatarError: () => void;
}

interface DragOffset {
  forPosition: AvatarPosition;
  x: number;
  y: number;
}

function getAnchorStyle(position: AvatarPosition): Record<string, string> {
  const margin = `${String(VIEWPORT_MARGIN_PX)}px`;
  switch (position) {
    case "bottom-right":
      return { bottom: margin, right: margin };
    case "bottom-left":
      return { bottom: margin, left: margin };
    case "top-right":
      return { top: margin, right: margin };
    case "top-left":
      return { top: margin, left: margin };
  }
}

function getOverlayStatus(
  sessionState: SessionState,
  avatarReady: boolean,
  avatarError: string | null,
  isPaused: boolean,
  isSigning: boolean,
): { label: string; dotClass: string } {
  if (avatarError !== null) {
    return { label: "Erro no avatar", dotClass: "bg-danger" };
  }
  if (sessionState.status === "error") {
    return { label: "Erro na conexão", dotClass: "bg-danger" };
  }
  if (!avatarReady || sessionState.status === "starting") {
    return { label: "Carregando avatar…", dotClass: "bg-warning animate-pulse" };
  }
  if (sessionState.status === "reconnecting") {
    return { label: "Reconectando…", dotClass: "bg-warning animate-pulse" };
  }
  if (isPaused) {
    return { label: "Pausado", dotClass: "bg-text-muted" };
  }
  if (isSigning) {
    return { label: "Sinalizando", dotClass: "bg-accent animate-pulse" };
  }
  if (sessionState.status === "active" && sessionState.isSilent) {
    return { label: "Sem áudio…", dotClass: "bg-text-muted" };
  }
  return { label: "Aguardando fala…", dotClass: "bg-accent" };
}

/**
 * Draggable dark-mode widget floating over web video players.
 *
 * @param props - Live settings, session state, incoming segments and lifecycle callbacks.
 */
export function OverlayWidget({
  settings,
  sessionState,
  latestSegment,
  onClose,
  onAvatarReady,
  onAvatarError,
}: OverlayWidgetProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const bridgeRef = useRef<AvatarBridge | null>(null);
  const queueRef = useRef<SignQueue | null>(null);

  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [dragOffset, setDragOffset] = useState<DragOffset>({
    forPosition: settings.position,
    x: 0,
    y: 0,
  });
  const offset =
    dragOffset.forPosition === settings.position
      ? { x: dragOffset.x, y: dragOffset.y }
      : { x: 0, y: 0 };
  const [avatarReady, setAvatarReady] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [currentCaption, setCurrentCaption] = useState<string | null>(null);

  const speedRef = useRef(settings.speed);
  const callbacksRef = useRef({ onAvatarReady, onAvatarError });

  useEffect(() => {
    speedRef.current = settings.speed;
  }, [settings.speed]);

  useEffect(() => {
    callbacksRef.current = { onAvatarReady, onAvatarError };
  }, [onAvatarReady, onAvatarError]);

  // Wire the SignQueue and AvatarBridge once the iframe mounts.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    const queue = new SignQueue({
      maxPending: 3,
      onStartSegment: (segment) => {
        setIsSigning(true);
        setCurrentCaption(segment.text);
        bridgeRef.current?.play(signableText(segment));
      },
      onIdle: () => {
        setIsSigning(false);
        setCurrentCaption(null);
      },
    });
    queueRef.current = queue;

    const bridge = new AvatarBridge(iframe, {
      onReady: () => {
        setAvatarReady(true);
        setAvatarError(null);
        bridge.setSpeed(speedRef.current);
        callbacksRef.current.onAvatarReady();
      },
      onProgress: () => {
        // Progress ticks are absorbed by the loading spinner until `avatar/ready` fires.
      },
      onAnimationStart: () => {
        setIsSigning(true);
      },
      onAnimationEnd: () => {
        queue.onAnimationEnd();
      },
      onError: (message) => {
        setAvatarError(message);
        callbacksRef.current.onAvatarError();
      },
    });
    bridgeRef.current = bridge;

    return () => {
      bridge.stop();
      bridge.dispose();
      queue.clear();
      bridgeRef.current = null;
      queueRef.current = null;
    };
  }, []);

  // Apply speed changes immediately whenever the user drags the speed slider.
  useEffect(() => {
    if (avatarReady) {
      bridgeRef.current?.setSpeed(settings.speed);
    }
  }, [avatarReady, settings.speed]);

  // Enqueue each distinct translated segment delivered from the background script.
  useEffect(() => {
    if (latestSegment === null) {
      return;
    }
    queueRef.current?.enqueue(latestSegment);
  }, [latestSegment]);

  function togglePause(): void {
    const queue = queueRef.current;
    const bridge = bridgeRef.current;
    if (!queue || !bridge || !avatarReady) {
      return;
    }
    if (isPaused) {
      queue.resume();
      bridge.resume();
      setIsPaused(false);
    } else {
      queue.pause();
      bridge.pause();
      setIsPaused(true);
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragStateRef.current;
    const node = containerRef.current;
    if (!drag || !node) {
      return;
    }

    const rawX = drag.originX + (event.clientX - drag.startX);
    const rawY = drag.originY + (event.clientY - drag.startY);

    const rect = node.getBoundingClientRect();
    const baseLeft = rect.left - offset.x;
    const baseTop = rect.top - offset.y;
    const minX = VIEWPORT_MARGIN_PX - baseLeft;
    const maxX = window.innerWidth - VIEWPORT_MARGIN_PX - rect.width - baseLeft;
    const minY = VIEWPORT_MARGIN_PX - baseTop;
    const maxY = window.innerHeight - VIEWPORT_MARGIN_PX - rect.height - baseTop;

    setDragOffset({
      forPosition: settings.position,
      x: Math.min(Math.max(rawX, minX), Math.max(minX, maxX)),
      y: Math.min(Math.max(rawY, minY), Math.max(minY, maxY)),
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (dragStateRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
  }

  const dimensions = AVATAR_DIMENSIONS[settings.size];
  const anchorStyle = getAnchorStyle(settings.position);
  const status = getOverlayStatus(sessionState, avatarReady, avatarError, isPaused, isSigning);
  const avatarUrl = browser.runtime.getURL("/avatar.html");

  return (
    <aside
      ref={containerRef}
      aria-label="Tradutor em Libras VoxLibras"
      style={{
        ...anchorStyle,
        transform: `translate3d(${String(offset.x)}px, ${String(offset.y)}px, 0)`,
        width: `${String(dimensions.width)}px`,
      }}
      className="border-border-subtle bg-card text-text-primary fixed z-[2147483640] overflow-hidden rounded-2xl border shadow-2xl shadow-black/60 select-none"
    >
      <header className="border-border-subtle bg-surface/95 flex items-center justify-between gap-2 border-b px-2.5 py-2">
        <div
          role="presentation"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title="Arrastar janela"
          className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-1.5 active:cursor-grabbing"
        >
          <GripVertical className="text-text-muted h-4 w-4 shrink-0" aria-hidden="true" />
          <span className={`h-2 w-2 shrink-0 rounded-full ${status.dotClass}`} aria-hidden="true" />
          <span className="text-text-primary truncate text-xs font-medium">{status.label}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={togglePause}
            disabled={!avatarReady || avatarError !== null}
            aria-label={isPaused ? "Retomar sinalização" : "Pausar sinalização"}
            title={isPaused ? "Retomar sinalização" : "Pausar sinalização"}
            className="border-border-subtle bg-card text-text-primary hover:bg-card-elevated flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPaused ? (
              <Play className="text-accent h-3.5 w-3.5 fill-current" aria-hidden="true" />
            ) : (
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              bridgeRef.current?.stop();
              queueRef.current?.clear();
              onClose();
            }}
            aria-label="Fechar tradutor de Libras"
            title="Fechar tradutor de Libras"
            className="border-border-subtle bg-card text-text-muted hover:border-danger/40 hover:bg-danger/20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition-colors hover:text-red-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        className="relative w-full bg-[#18181b]"
        style={{ height: `${String(dimensions.height)}px` }}
      >
        <iframe
          ref={iframeRef}
          src={avatarUrl}
          title="Avatar 3D de Libras VoxLibras"
          className="h-full w-full border-0"
        />

        {!avatarReady && avatarError === null ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#18181b]/95 px-4 text-center">
            <Loader2 className="text-accent h-7 w-7 animate-spin" aria-hidden="true" />
            <p className="text-text-muted text-xs font-medium">Carregando avatar 3D…</p>
          </div>
        ) : null}

        {avatarError !== null ? (
          <div className="bg-surface/95 absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-danger text-xs font-semibold">Não foi possível carregar o avatar</p>
            <p className="text-text-muted text-[11px]">{avatarError}</p>
          </div>
        ) : null}

        {sessionState.status === "error" && avatarError === null ? (
          <div
            role="alert"
            className="border-danger/50 bg-surface/95 absolute inset-x-2 bottom-2 rounded-xl border px-3 py-2 text-[11px] leading-snug text-red-200 shadow-lg"
          >
            {SESSION_ERROR_MESSAGES[sessionState.code]}
          </div>
        ) : null}
      </div>

      <footer className="border-border-subtle bg-surface/95 border-t px-3 py-2">
        <p
          aria-live="polite"
          className={`line-clamp-2 min-h-[2rem] text-xs leading-snug ${
            currentCaption !== null ? "text-text-primary" : "text-text-muted"
          }`}
        >
          {currentCaption ?? "Aguardando fala no vídeo…"}
        </p>
      </footer>
    </aside>
  );
}
