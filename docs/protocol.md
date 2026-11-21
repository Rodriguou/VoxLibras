# WebSocket protocol — `/ws/translate`

Contract between the extension's **offscreen document** (client) and the **FastAPI backend** (server).
The backend is the single source of truth for this contract (`backend/src/voxlibras/api/schemas.py`);
the extension mirrors it with Zod schemas (`extension/src/lib/transport/protocol.ts`).

All JSON keys are **camelCase**. Every JSON message has a `type` discriminator.

## Connection

- URL (local development): `ws://localhost:8000/ws/translate`
- The server only accepts connections whose `Origin` header starts with `chrome-extension://`
  (configurable through `ALLOWED_ORIGIN_PREFIXES`). Other origins are rejected with close code `1008`.

## Client → server

| Frame  | Payload                                                         | Notes                                      |
|--------|-----------------------------------------------------------------|--------------------------------------------|
| text   | `{"type":"start","sampleRate":16000,"language":"pt-BR"}`        | Must be the first message.                 |
| binary | raw PCM, signed 16-bit little-endian, mono, `sampleRate` Hz     | ~100 ms per frame (3200 bytes at 16 kHz).  |
| text   | `{"type":"stop"}`                                               | Graceful end; server closes with `1000`.   |

## Server → client

| Payload | When |
|---------|------|
| `{"type":"ready"}` | Speech recognizer started; client may stream audio. |
| `{"type":"segment","id":"<uuid>","text":"Olá, tudo bem?","gloss":"OI TUDO_BEM [INTERROGAÇÃO]","metrics":{"sttLatencyMs":812,"glossLatencyMs":254}}` | A final recognized sentence. `gloss` is `null` when the gloss translator failed — the client must then fall back to signing `text`. |
| `{"type":"error","code":"STT_NOT_CONFIGURED","message":"..."}` | Recoverable or fatal error. |

### Error codes

| Code | Meaning | Fatal? |
|------|---------|--------|
| `INVALID_MESSAGE` | Malformed JSON / unknown `type` / audio before `start`. | yes |
| `STT_NOT_CONFIGURED` | Azure Speech key/region missing on the server. | yes |
| `STT_FAILED` | Azure Speech canceled the session (auth, quota, network). | yes |

After a fatal error the server closes the socket (code `1011`, or `1008` for `INVALID_MESSAGE`).

## Privacy

Audio frames and transcripts live only in memory for the duration of a single message hop
(volatile in-memory processing for privacy/LGPD compliance). Nothing is written to disk, and
logs never contain transcript text (only sizes and latencies).
