import pytest
from pydantic import TypeAdapter, ValidationError

from voxlibras.api.schemas import (
    ClientMessage,
    ErrorMessage,
    HealthResponse,
    ReadyMessage,
    SegmentMessage,
    SegmentMetrics,
    StartMessage,
    StopMessage,
)


def test_client_message_parses_camel_case_start_and_stop() -> None:
    adapter: TypeAdapter[ClientMessage] = TypeAdapter(ClientMessage)

    start = adapter.validate_json('{"type":"start","sampleRate":16000,"language":"pt-BR"}')
    assert isinstance(start, StartMessage)
    assert start.sample_rate == 16000
    assert start.language == "pt-BR"

    stop = adapter.validate_json('{"type":"stop"}')
    assert isinstance(stop, StopMessage)


def test_client_message_rejects_invalid_sample_rate_and_unknown_type() -> None:
    adapter: TypeAdapter[ClientMessage] = TypeAdapter(ClientMessage)

    with pytest.raises(ValidationError):
        adapter.validate_json('{"type":"start","sampleRate":4000,"language":"pt-BR"}')

    with pytest.raises(ValidationError):
        adapter.validate_json('{"type":"ping"}')


def test_outbound_messages_serialize_to_camel_case() -> None:
    ready_json = ReadyMessage().model_dump_json(by_alias=True)
    assert ready_json == '{"type":"ready"}'

    seg = SegmentMessage(
        id="seg-1",
        text="Olá mundo",
        gloss="OI MUNDO",
        metrics=SegmentMetrics(stt_latency_ms=800, gloss_latency_ms=210),
    ).model_dump(by_alias=True)
    assert seg == {
        "type": "segment",
        "id": "seg-1",
        "text": "Olá mundo",
        "gloss": "OI MUNDO",
        "metrics": {"sttLatencyMs": 800, "glossLatencyMs": 210},
    }

    err = ErrorMessage(code="STT_NOT_CONFIGURED", message="Missing key").model_dump(by_alias=True)
    assert err == {"type": "error", "code": "STT_NOT_CONFIGURED", "message": "Missing key"}

    health = HealthResponse(stt_configured=False).model_dump(by_alias=True)
    assert health == {"status": "ok", "sttConfigured": False}
