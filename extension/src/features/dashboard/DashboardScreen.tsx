/**
 * Main popup dashboard showing session controls, live status and quick accessibility tips.
 *
 * @module features/dashboard/DashboardScreen
 */
import {
  AlertCircle,
  AudioLines,
  Keyboard,
  Lightbulb,
  Loader2,
  Settings,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../../components/ui/Button";
import { isSessionRunning, SESSION_ERROR_MESSAGES, type SessionState } from "../../shared/session";

/** Props for {@link DashboardScreen}. */
export interface DashboardScreenProps {
  sessionState: SessionState;
  currentTabId: number | null;
  onStart: () => void;
  onStop: () => void;
  onDismissError: () => void;
  onOpenSettings: () => void;
}

function getStatusLabel(state: SessionState, isCurrentTab: boolean): string {
  switch (state.status) {
    case "idle":
      return "Status: Aguardando ativação…";
    case "starting":
      return isCurrentTab ? "Status: Conectando…" : "Status: Ativo em outra aba";
    case "active":
      if (!isCurrentTab) {
        return "Status: Ativo em outra aba";
      }
      return state.isSilent ? "Status: Sem áudio detectado…" : "Status: Ouvindo áudio…";
    case "reconnecting":
      return isCurrentTab
        ? `Status: Reconectando (${String(state.attempt)}/3)…`
        : "Status: Reconectando em outra aba";
    case "error":
      return "Status: Erro na tradução";
  }
}

/**
 * Primary popup view allowing the user to start/stop live translation on the current tab.
 *
 * @param props - Session state, active tab id and action handlers.
 */
export function DashboardScreen({
  sessionState,
  currentTabId,
  onStart,
  onStop,
  onDismissError,
  onOpenSettings,
}: DashboardScreenProps): ReactNode {
  const running = isSessionRunning(sessionState);
  const runningOnCurrentTab =
    running && currentTabId !== null && sessionState.tabId === currentTabId;
  const runningOnOtherTab =
    running && (currentTabId === null || sessionState.tabId !== currentTabId);

  const statusText = getStatusLabel(sessionState, runningOnCurrentTab);

  return (
    <div className="bg-surface text-text-primary flex min-h-[460px] flex-col">
      <header className="border-border-subtle flex items-center justify-between border-b px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="bg-accent flex h-9 w-9 items-center justify-center rounded-xl">
            <AudioLines className="text-accent-ink h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm leading-tight font-bold">VoxLibras</h1>
            <p className="text-text-muted text-xs">Extensão de navegador</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Configurações do Avatar"
          className="border-border-subtle bg-card text-text-primary hover:bg-card-elevated flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition-colors"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-5">
        {runningOnOtherTab ? (
          <div className="border-accent/30 bg-card w-full rounded-xl border p-3 text-xs">
            <p className="text-text-muted">
              Tradução ativa em:{" "}
              <span className="text-text-primary font-semibold">
                {sessionState.tabTitle || "outra aba"}
              </span>
            </p>
            <div className="mt-2.5">
              <Button variant="danger" fullWidth onClick={onStop} className="py-1.5 text-xs">
                Parar tradução
              </Button>
            </div>
          </div>
        ) : null}

        {sessionState.status === "error" ? (
          <div
            role="alert"
            className="border-danger/40 bg-card w-full space-y-3 rounded-2xl border p-4 text-center"
          >
            <div className="bg-danger/15 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
              <AlertCircle className="text-danger h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold">Não foi possível traduzir</h2>
              <p className="text-text-muted text-xs leading-relaxed">
                {SESSION_ERROR_MESSAGES[sessionState.code]}
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={onDismissError} className="flex-1">
                Fechar
              </Button>
              <Button variant="primary" onClick={onStart} className="flex-1">
                Tentar novamente
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <button
              type="button"
              onClick={runningOnCurrentTab ? onStop : onStart}
              disabled={runningOnCurrentTab && sessionState.status === "starting"}
              aria-label={runningOnCurrentTab ? "Parar Tradução" : "Ativar Tradução"}
              className={`relative flex h-20 w-20 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95 disabled:cursor-wait ${
                runningOnCurrentTab
                  ? sessionState.status === "reconnecting"
                    ? "bg-warning text-accent-ink shadow-warning/20 shadow-lg"
                    : "bg-card-elevated text-accent ring-accent shadow-accent/15 shadow-lg ring-2"
                  : "bg-accent text-accent-ink hover:bg-accent-hover shadow-accent/20 shadow-lg"
              }`}
            >
              {runningOnCurrentTab && sessionState.status === "starting" ? (
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
              ) : runningOnCurrentTab ? (
                <Square className="h-7 w-7 fill-current" aria-hidden="true" />
              ) : (
                <AudioLines className="h-8 w-8" aria-hidden="true" />
              )}
            </button>

            <h2 className="mt-4 text-xl font-bold">
              {runningOnCurrentTab
                ? sessionState.status === "starting"
                  ? "Conectando…"
                  : sessionState.status === "reconnecting"
                    ? "Reconectando…"
                    : "Parar Tradução"
                : "Ativar Tradução"}
            </h2>
            <p className="text-text-muted mt-1 text-xs">
              {runningOnCurrentTab
                ? "A tradução em Libras está exibida na aba."
                : "Toque para começar a tradução."}
            </p>
          </div>
        )}

        <div
          role="status"
          aria-live="polite"
          className="border-border-subtle bg-card text-text-muted inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs"
        >
          {sessionState.status === "active" && sessionState.isSilent && runningOnCurrentTab ? (
            <VolumeX className="text-warning h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Volume2
              className={`h-3.5 w-3.5 ${
                runningOnCurrentTab && sessionState.status === "active"
                  ? "text-accent animate-pulse"
                  : "text-text-muted"
              }`}
              aria-hidden="true"
            />
          )}
          <span>{statusText}</span>
        </div>
      </main>

      <section
        aria-label="Atalhos rápidos"
        className="border-border-subtle bg-card/70 border-t px-4 py-3.5"
      >
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-text-primary text-xs font-semibold">Atalhos rápidos</h3>
          <span className="border-border-subtle bg-surface text-text-primary inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium">
            <Lightbulb className="text-accent h-3 w-3" aria-hidden="true" />
            Dicas
          </span>
        </div>

        <ul className="text-text-muted space-y-2 text-xs">
          <li className="flex items-center gap-2.5">
            <AudioLines className="text-accent h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Clique no ícone para ativar a tradução.</span>
          </li>
          <li className="flex items-center gap-2.5">
            <Settings className="text-accent h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Ajuste tamanho, velocidade e posição nas configurações.</span>
          </li>
          <li className="flex items-center gap-2.5">
            <Keyboard className="text-accent h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Use Tab para navegar e Enter para ativar.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
