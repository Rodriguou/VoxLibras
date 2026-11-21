/**
 * Translation session state shared between the service worker (owner) and the UI (readers).
 *
 * The state is a discriminated union so that each status carries exactly the data it needs,
 * and TypeScript forces every consumer to handle all statuses (`switch` + `never` checks).
 *
 * @module shared/session
 */
import { z } from "zod";

/** Machine-readable reasons why a session could not start or had to end. */
export const SESSION_ERROR_CODES = [
  "UNSUPPORTED_PAGE",
  "TAB_ALREADY_CAPTURED",
  "CAPTURE_FAILED",
  "BACKEND_UNAVAILABLE",
  "STT_NOT_CONFIGURED",
  "STT_FAILED",
  "AVATAR_FAILED",
  "UNKNOWN",
] as const;

export const sessionErrorCodeSchema = z.enum(SESSION_ERROR_CODES);
/** One of {@link SESSION_ERROR_CODES}. */
export type SessionErrorCode = z.infer<typeof sessionErrorCodeSchema>;

const tabInfo = {
  tabId: z.number().int(),
  tabTitle: z.string(),
};

/** Runtime schema for {@link SessionState}. */
export const sessionStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle") }),
  z.object({ status: z.literal("starting"), ...tabInfo }),
  z.object({ status: z.literal("active"), ...tabInfo, isSilent: z.boolean() }),
  z.object({ status: z.literal("reconnecting"), ...tabInfo, attempt: z.number().int() }),
  z.object({ status: z.literal("error"), code: sessionErrorCodeSchema }),
]);

/** Current state of the (single) translation session. */
export type SessionState = z.infer<typeof sessionStateSchema>;
/** Discriminator values of {@link SessionState}. */
export type SessionStatus = SessionState["status"];

/** The state used when nothing is running. */
export const IDLE_STATE: SessionState = { status: "idle" };

/**
 * Tells whether the session is bound to a tab (i.e. capture is starting or running).
 *
 * @param state - Current session state.
 * @returns `true` for `starting`, `active` and `reconnecting`.
 */
export function isSessionRunning(
  state: SessionState,
): state is Extract<SessionState, { tabId: number }> {
  return (
    state.status === "starting" || state.status === "active" || state.status === "reconnecting"
  );
}

/** PT-BR messages displayed for each error code. */
export const SESSION_ERROR_MESSAGES: Readonly<Record<SessionErrorCode, string>> = {
  UNSUPPORTED_PAGE:
    "Esta página não permite captura de áudio. Abra um site de vídeo, como o YouTube, e tente novamente.",
  TAB_ALREADY_CAPTURED: "O áudio desta aba já está sendo capturado por outro recurso.",
  CAPTURE_FAILED: "Não foi possível capturar o áudio desta aba.",
  BACKEND_UNAVAILABLE:
    "Servidor de tradução indisponível. Verifique se o backend está em execução e tente novamente.",
  STT_NOT_CONFIGURED: "O serviço de transcrição não está configurado no servidor.",
  STT_FAILED: "O serviço de transcrição falhou. Tente novamente em instantes.",
  AVATAR_FAILED: "Não foi possível carregar o avatar de Libras.",
  UNKNOWN: "Ocorreu um erro inesperado. Tente novamente.",
};
