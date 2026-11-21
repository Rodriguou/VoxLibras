"""WebSocket transport handler for ``/ws/translate``.

Responsible solely for origin validation, framing, protocol deserialization/serialization and
clean task/session teardown. Business orchestration lives in :class:`TranslationSession`.
"""

import asyncio
import contextlib
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter, ValidationError

from voxlibras.api.schemas import (
    ClientMessage,
    ErrorCode,
    ErrorMessage,
    ReadyMessage,
    SegmentMessage,
    SegmentMetrics,
    StartMessage,
    StopMessage,
)
from voxlibras.config import Settings
from voxlibras.domain.errors import SpeechNotConfiguredError, SpeechRecognitionError
from voxlibras.domain.ports import GlossTranslator, SpeechRecognizerFactory
from voxlibras.services.translation_session import TranslationSession

logger = logging.getLogger(__name__)

router = APIRouter(tags=["translation"])

_CLIENT_MESSAGE_ADAPTER: TypeAdapter[ClientMessage] = TypeAdapter(ClientMessage)

_WS_CLOSE_NORMAL = 1000
_WS_CLOSE_POLICY_VIOLATION = 1008
_WS_CLOSE_INTERNAL_ERROR = 1011


class _ClientProtocolError(Exception):
    """Internal signal raised when the client sends an invalid frame mid-session."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class _EmptyFrameError(_ClientProtocolError):
    """Raised when a mid-stream WebSocket frame contains neither text nor bytes."""

    def __init__(self) -> None:
        super().__init__("Unexpected empty WebSocket frame.")


class _MalformedControlError(_ClientProtocolError):
    """Raised when a mid-stream control frame cannot be validated."""

    def __init__(self) -> None:
        super().__init__("Malformed control message.")


class _UnexpectedStartError(_ClientProtocolError):
    """Raised when a client sends a second ``start`` frame mid-stream."""

    def __init__(self) -> None:
        super().__init__("Unexpected start message during active stream.")


def get_ws_settings(websocket: WebSocket) -> Settings:
    """Resolve :class:`Settings` from ``websocket.app.state``."""
    return websocket.app.state.settings  # type: ignore[no-any-return]


def get_recognizer_factory(websocket: WebSocket) -> SpeechRecognizerFactory:
    """Resolve the configured :class:`SpeechRecognizerFactory` from ``websocket.app.state``."""
    return websocket.app.state.recognizer_factory  # type: ignore[no-any-return]


def get_gloss_translator(websocket: WebSocket) -> GlossTranslator:
    """Resolve the configured :class:`GlossTranslator` from ``websocket.app.state``."""
    return websocket.app.state.gloss_translator  # type: ignore[no-any-return]


def _is_origin_allowed(origin: str | None, allowed_prefixes: list[str]) -> bool:
    """Check whether the WebSocket ``Origin`` matches an allowed prefix."""
    if not origin:
        return False
    return any(origin.startswith(prefix) for prefix in allowed_prefixes)


async def _send_error(websocket: WebSocket, code: ErrorCode, message: str) -> None:
    """Send a serialized :class:`ErrorMessage` frame."""
    payload = ErrorMessage(code=code, message=message).model_dump_json(by_alias=True)
    await websocket.send_text(payload)


async def _read_start_message(websocket: WebSocket, settings: Settings) -> StartMessage | None:
    """Await and validate the mandatory initial ``start`` frame.

    Returns:
        Validated :class:`StartMessage`, or ``None`` after sending an error and closing.
    """
    raw = await websocket.receive()
    if raw.get("type") == "websocket.disconnect":
        return None

    text = raw.get("text")
    if not isinstance(text, str):
        await _send_error(
            websocket,
            "INVALID_MESSAGE",
            "First frame must be a JSON start message.",
        )
        await websocket.close(code=_WS_CLOSE_POLICY_VIOLATION)
        return None

    try:
        parsed = _CLIENT_MESSAGE_ADAPTER.validate_json(text)
    except ValidationError:
        await _send_error(websocket, "INVALID_MESSAGE", "Malformed start message.")
        await websocket.close(code=_WS_CLOSE_POLICY_VIOLATION)
        return None

    if not isinstance(parsed, StartMessage):
        await _send_error(websocket, "INVALID_MESSAGE", "Expected a start message.")
        await websocket.close(code=_WS_CLOSE_POLICY_VIOLATION)
        return None

    if parsed.language != settings.speech_language:
        await _send_error(
            websocket,
            "INVALID_MESSAGE",
            f"Unsupported language; expected {settings.speech_language}.",
        )
        await websocket.close(code=_WS_CLOSE_POLICY_VIOLATION)
        return None

    return parsed


async def _pump_inbound(websocket: WebSocket, session: TranslationSession) -> str:
    """Receive binary PCM frames and control messages until ``stop`` or disconnect."""
    try:
        while True:
            raw = await websocket.receive()
            if raw.get("type") == "websocket.disconnect":
                return "disconnected"

            audio = raw.get("bytes")
            if isinstance(audio, bytes):
                session.push_audio(audio)
                continue

            text = raw.get("text")
            if not isinstance(text, str):
                raise _EmptyFrameError

            try:
                parsed = _CLIENT_MESSAGE_ADAPTER.validate_json(text)
            except ValidationError as exc:
                raise _MalformedControlError from exc

            if isinstance(parsed, StopMessage):
                await session.stop()
                return "stopped"

            raise _UnexpectedStartError
    except WebSocketDisconnect:
        return "disconnected"


async def _pump_outbound(websocket: WebSocket, session: TranslationSession) -> str:
    """Stream translated segments from ``session`` to the client socket."""
    try:
        async for segment in session.segments():
            msg = SegmentMessage(
                id=segment.segment_id,
                text=segment.text,
                gloss=segment.gloss,
                metrics=SegmentMetrics(
                    stt_latency_ms=segment.stt_latency_ms,
                    gloss_latency_ms=segment.gloss_latency_ms,
                ),
            )
            await websocket.send_text(msg.model_dump_json(by_alias=True))
    except SpeechRecognitionError as exc:
        with contextlib.suppress(RuntimeError, WebSocketDisconnect):
            await _send_error(websocket, "STT_FAILED", str(exc))
            await websocket.close(code=_WS_CLOSE_INTERNAL_ERROR)
        return "stt_failed"
    else:
        return "completed"


async def _handle_completed_reader(
    websocket: WebSocket,
    reader: asyncio.Task[str],
    sender: asyncio.Task[str],
) -> None:
    """Finish draining outbound segments on graceful stop, or abort on client error."""
    exc = reader.exception()
    if isinstance(exc, _ClientProtocolError):
        await _send_error(websocket, "INVALID_MESSAGE", exc.reason)
        await websocket.close(code=_WS_CLOSE_POLICY_VIOLATION)
        return

    if reader.result() == "stopped":
        sender_result = await sender
        if sender_result == "completed":
            await websocket.close(code=_WS_CLOSE_NORMAL)


async def _run_session_loops(websocket: WebSocket, session: TranslationSession) -> None:
    """Coordinate inbound audio reading and outbound segment streaming until completion."""
    reader = asyncio.create_task(_pump_inbound(websocket, session), name="ws-reader")
    sender = asyncio.create_task(_pump_outbound(websocket, session), name="ws-sender")

    try:
        done, _ = await asyncio.wait({reader, sender}, return_when=asyncio.FIRST_COMPLETED)
        if reader in done:
            await _handle_completed_reader(websocket, reader, sender)
    finally:
        for task in (reader, sender):
            if not task.done():
                task.cancel()
            with contextlib.suppress(asyncio.CancelledError, _ClientProtocolError):
                await task
        await session.stop()


@router.websocket("/ws/translate")
async def translate_ws(
    websocket: WebSocket,
    settings: Annotated[Settings, Depends(get_ws_settings)],
    recognizer_factory: Annotated[SpeechRecognizerFactory, Depends(get_recognizer_factory)],
    gloss_translator: Annotated[GlossTranslator, Depends(get_gloss_translator)],
) -> None:
    """Handle one streaming audio-to-Libras WebSocket session.

    Args:
        websocket: Incoming FastAPI WebSocket connection.
        settings: Injected runtime settings.
        recognizer_factory: Injected factory creating per-session STT recognizers.
        gloss_translator: Injected PT-BR to Libras gloss translator.
    """
    await websocket.accept()

    if not _is_origin_allowed(
        websocket.headers.get("origin"),
        settings.allowed_origin_prefixes,
    ):
        logger.warning("ws_origin_rejected")
        await websocket.close(code=_WS_CLOSE_POLICY_VIOLATION)
        return

    try:
        start_msg = await _read_start_message(websocket, settings)
    except WebSocketDisconnect:
        return
    if start_msg is None:
        return

    try:
        recognizer = recognizer_factory(
            sample_rate=start_msg.sample_rate,
            language=start_msg.language,
        )
    except SpeechNotConfiguredError as exc:
        await _send_error(websocket, "STT_NOT_CONFIGURED", str(exc))
        await websocket.close(code=_WS_CLOSE_INTERNAL_ERROR)
        return

    session = TranslationSession(
        recognizer=recognizer,
        gloss_translator=gloss_translator,
        gloss_timeout_s=settings.gloss_timeout_s,
    )

    try:
        await session.start()
    except SpeechRecognitionError as exc:
        await _send_error(websocket, "STT_FAILED", str(exc))
        await websocket.close(code=_WS_CLOSE_INTERNAL_ERROR)
        await session.stop()
        return

    await websocket.send_text(ReadyMessage().model_dump_json(by_alias=True))
    logger.info("ws_session_started sample_rate=%d", start_msg.sample_rate)

    await _run_session_loops(websocket, session)
    logger.info("ws_session_closed")
