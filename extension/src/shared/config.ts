/**
 * Static configuration shared by every extension context.
 *
 * Values here are intentionally compile-time constants pointing at the local backend server
 * `localhost` (see `docs/protocol.md`), so there is nothing to configure at runtime.
 *
 * @module shared/config
 */

/** WebSocket endpoint of the FastAPI translation backend. */
export const BACKEND_WS_URL = "ws://localhost:8000/ws/translate";

/** Sample rate (Hz) expected by the backend / Azure Speech. */
export const TARGET_SAMPLE_RATE = 16_000;

/** Duration of each PCM frame sent to the backend, in milliseconds. */
export const AUDIO_FRAME_MS = 100;

/** Spoken language of the captured audio (BCP-47). */
export const SPEECH_LANGUAGE = "pt-BR";

/**
 * Base URL from which the VLibras Unity player downloads sign animation bundles.
 *
 * The `static` path is a CDN-backed mirror that answers CORS requests from opaque (`null`)
 * origins, which is exactly what our sandboxed avatar page has.
 */
export const VLIBRAS_DICTIONARY_URL =
  "https://dicionario2.vlibras.gov.br/static/BUNDLES/2018.3.1/WEBGL/BR/";
