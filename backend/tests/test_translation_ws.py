import json
from typing import cast

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from starlette.websockets import WebSocketDisconnect
from tests.fakes import FakeGlossTranslator, FakeSpeechRecognizer, FakeSpeechRecognizerFactory

from voxlibras.config import Settings
from voxlibras.domain.errors import SpeechRecognitionError
from voxlibras.domain.models import TranscriptSegment
from voxlibras.main import create_app

_VALID_HEADERS = {"Origin": "chrome-extension://abcdefghijklmnop"}


def _make_settings(*, speech_key: str | None = "dummy") -> Settings:
    return Settings(
        azure_speech_key=SecretStr(speech_key) if speech_key is not None else None,
        allowed_origin_prefixes=["chrome-extension://"],
    )


def test_health_reports_stt_configured_flag() -> None:
    app_unconfigured = create_app(settings=_make_settings(speech_key=None))
    with TestClient(app_unconfigured) as client:
        resp = cast("httpx.Client", client).get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "sttConfigured": False}

    app_configured = create_app(settings=_make_settings(speech_key="secret-key"))
    with TestClient(app_configured) as client:
        resp = cast("httpx.Client", client).get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "sttConfigured": True}


def test_ws_rejects_missing_or_disallowed_origin() -> None:
    app = create_app(
        settings=_make_settings(),
        recognizer_factory=FakeSpeechRecognizerFactory(),
        gloss_translator=FakeGlossTranslator(),
    )
    with TestClient(app) as client:
        with (
            client.websocket_connect("/ws/translate") as ws,
            pytest.raises(WebSocketDisconnect) as exc,
        ):
            ws.receive_text()
        assert exc.value.code == 1008

        with (
            client.websocket_connect(
                "/ws/translate",
                headers={"Origin": "https://evil.example"},
            ) as ws,
            pytest.raises(WebSocketDisconnect) as exc2,
        ):
            ws.receive_text()
        assert exc2.value.code == 1008


def test_ws_happy_path_streams_audio_and_closes_cleanly() -> None:
    def on_chunk(rec: FakeSpeechRecognizer, _chunk: bytes) -> None:
        rec.emit(
            TranscriptSegment(
                text="Olá mundo",
                offset_ms=0,
                duration_ms=500,
                recognized_at=1000.0,
            )
        )

    recognizer = FakeSpeechRecognizer(on_chunk=on_chunk)
    factory = FakeSpeechRecognizerFactory(recognizer)
    translator = FakeGlossTranslator(responses={"Olá mundo": "OI MUNDO"})
    app = create_app(
        settings=_make_settings(),
        recognizer_factory=factory,
        gloss_translator=translator,
    )

    with (
        TestClient(app) as client,
        client.websocket_connect("/ws/translate", headers=_VALID_HEADERS) as ws,
    ):
        ws.send_text('{"type":"start","sampleRate":16000,"language":"pt-BR"}')
        assert json.loads(ws.receive_text()) == {"type": "ready"}

        ws.send_bytes(b"\x01\x00" * 1600)
        segment = json.loads(ws.receive_text())
        assert segment["type"] == "segment"
        assert segment["text"] == "Olá mundo"
        assert segment["gloss"] == "OI MUNDO"
        assert isinstance(segment["id"], str)
        assert segment["id"]
        assert set(segment["metrics"].keys()) == {"sttLatencyMs", "glossLatencyMs"}

        ws.send_text('{"type":"stop"}')
        with pytest.raises(WebSocketDisconnect) as close_exc:
            ws.receive_text()
        assert close_exc.value.code == 1000

    assert factory.calls == [(16000, "pt-BR")]
    assert len(recognizer.chunks) == 1
    assert recognizer.stopped is True


def test_ws_rejects_binary_before_start_and_malformed_start() -> None:
    app = create_app(
        settings=_make_settings(),
        recognizer_factory=FakeSpeechRecognizerFactory(),
        gloss_translator=FakeGlossTranslator(),
    )
    with TestClient(app) as client:
        with client.websocket_connect("/ws/translate", headers=_VALID_HEADERS) as ws:
            ws.send_bytes(b"\x00\x00")
            err = json.loads(ws.receive_text())
            assert err["type"] == "error"
            assert err["code"] == "INVALID_MESSAGE"
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_text()
            assert exc.value.code == 1008

        with client.websocket_connect("/ws/translate", headers=_VALID_HEADERS) as ws:
            ws.send_text('{"type":"start","sampleRate":16000,"language":"en-US"}')
            err = json.loads(ws.receive_text())
            assert err["type"] == "error"
            assert err["code"] == "INVALID_MESSAGE"
            with pytest.raises(WebSocketDisconnect) as exc2:
                ws.receive_text()
            assert exc2.value.code == 1008


def test_ws_returns_stt_not_configured_when_key_missing() -> None:
    app = create_app(
        settings=_make_settings(speech_key=None),
        recognizer_factory=FakeSpeechRecognizerFactory(not_configured=True),
        gloss_translator=FakeGlossTranslator(),
    )
    with (
        TestClient(app) as client,
        client.websocket_connect("/ws/translate", headers=_VALID_HEADERS) as ws,
    ):
        ws.send_text('{"type":"start","sampleRate":16000,"language":"pt-BR"}')
        err = json.loads(ws.receive_text())
        assert err["type"] == "error"
        assert err["code"] == "STT_NOT_CONFIGURED"
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
        assert exc.value.code == 1011


def test_ws_emits_stt_failed_on_start_and_midstream_errors() -> None:
    start_fail_rec = FakeSpeechRecognizer(start_error=SpeechRecognitionError("start_failed"))
    app_start_fail = create_app(
        settings=_make_settings(),
        recognizer_factory=FakeSpeechRecognizerFactory(start_fail_rec),
        gloss_translator=FakeGlossTranslator(),
    )
    with (
        TestClient(app_start_fail) as client,
        client.websocket_connect("/ws/translate", headers=_VALID_HEADERS) as ws,
    ):
        ws.send_text('{"type":"start","sampleRate":16000,"language":"pt-BR"}')
        err = json.loads(ws.receive_text())
        assert err["code"] == "STT_FAILED"
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
        assert exc.value.code == 1011
    assert start_fail_rec.stopped is True

    midstream_rec = FakeSpeechRecognizer(
        on_chunk=lambda rec, _c: rec.fail("ConnectionFailure"),
    )
    app_midstream = create_app(
        settings=_make_settings(),
        recognizer_factory=FakeSpeechRecognizerFactory(midstream_rec),
        gloss_translator=FakeGlossTranslator(),
    )
    with (
        TestClient(app_midstream) as client,
        client.websocket_connect("/ws/translate", headers=_VALID_HEADERS) as ws,
    ):
        ws.send_text('{"type":"start","sampleRate":16000,"language":"pt-BR"}')
        assert json.loads(ws.receive_text()) == {"type": "ready"}
        ws.send_bytes(b"\x00\x01")
        err = json.loads(ws.receive_text())
        assert err["type"] == "error"
        assert err["code"] == "STT_FAILED"
        with pytest.raises(WebSocketDisconnect) as exc2:
            ws.receive_text()
        assert exc2.value.code == 1011
    assert midstream_rec.stopped is True


def test_ws_stops_recognizer_on_abrupt_disconnect() -> None:
    recognizer = FakeSpeechRecognizer()
    app = create_app(
        settings=_make_settings(),
        recognizer_factory=FakeSpeechRecognizerFactory(recognizer),
        gloss_translator=FakeGlossTranslator(),
    )
    with (
        TestClient(app) as client,
        client.websocket_connect("/ws/translate", headers=_VALID_HEADERS) as ws,
    ):
        ws.send_text('{"type":"start","sampleRate":16000,"language":"pt-BR"}')
        assert json.loads(ws.receive_text()) == {"type": "ready"}
        ws.send_bytes(b"\x01\x02")
    assert recognizer.stopped is True
