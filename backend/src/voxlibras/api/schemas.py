"""Pydantic schemas defining the HTTP and WebSocket JSON wire contract.

Every schema follows ``docs/protocol.md``: keys are serialized as camelCase via
:class:`CamelModel` and messages are discriminated by their ``type`` field.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

SAMPLE_RATE_MIN_HZ = 8_000
SAMPLE_RATE_MAX_HZ = 48_000
DEFAULT_SAMPLE_RATE_HZ = 16_000

ErrorCode = Literal["INVALID_MESSAGE", "STT_NOT_CONFIGURED", "STT_FAILED"]


class CamelModel(BaseModel):
    """Base model configured for camelCase JSON aliases and Python snake_case access."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class StartMessage(CamelModel):
    """Initial client frame opening a recognition stream.

    Attributes:
        type: Message discriminator (always ``"start"``).
        sample_rate: PCM sample rate in Hz.
        language: BCP-47 language tag (e.g. ``"pt-BR"``).
    """

    type: Literal["start"]
    sample_rate: Annotated[
        int,
        Field(ge=SAMPLE_RATE_MIN_HZ, le=SAMPLE_RATE_MAX_HZ),
    ] = DEFAULT_SAMPLE_RATE_HZ
    language: str = "pt-BR"


class StopMessage(CamelModel):
    """Graceful end-of-stream client frame."""

    type: Literal["stop"]


ClientMessage = Annotated[StartMessage | StopMessage, Field(discriminator="type")]


class ReadyMessage(CamelModel):
    """Server confirmation that speech recognition has started and audio may stream."""

    type: Literal["ready"] = "ready"


class SegmentMetrics(CamelModel):
    """Per-segment latency measurements in milliseconds.

    Attributes:
        stt_latency_ms: Elapsed ms from utterance end in audio to STT final result.
        gloss_latency_ms: Elapsed ms spent translating the recognized text into gloss.
    """

    stt_latency_ms: int
    gloss_latency_ms: int


class SegmentMessage(CamelModel):
    """Server message carrying one recognized sentence and its Libras gloss.

    Attributes:
        type: Message discriminator (always ``"segment"``).
        id: Unique segment identifier (UUID4 string).
        text: Recognized PT-BR text.
        gloss: Libras gloss, or ``None`` when gloss translation failed or timed out.
        metrics: Latency measurements for performance monitoring.
    """

    type: Literal["segment"] = "segment"
    id: str
    text: str
    gloss: str | None
    metrics: SegmentMetrics


class ErrorMessage(CamelModel):
    """Server error frame emitted before closing (or recovering) a session.

    Attributes:
        type: Message discriminator (always ``"error"``).
        code: Protocol error code.
        message: Operator/user-safe explanation without transcript content.
    """

    type: Literal["error"] = "error"
    code: ErrorCode
    message: str


class HealthResponse(CamelModel):
    """Response payload for ``GET /health``.

    Attributes:
        status: Always ``"ok"`` when the process is alive.
        stt_configured: Whether Azure Speech credentials are set.
    """

    status: Literal["ok"] = "ok"
    stt_configured: bool
