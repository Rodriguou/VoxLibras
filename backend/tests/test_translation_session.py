import pytest
from tests.fakes import FakeGlossTranslator, FakeSpeechRecognizer

from voxlibras.domain.errors import SpeechRecognitionError
from voxlibras.domain.models import TranscriptSegment
from voxlibras.services.translation_session import TranslationSession


class _StepClock:
    def __init__(self, times: list[float]) -> None:
        self._times = iter(times)

    def __call__(self) -> float:
        return next(self._times)


async def test_session_preserves_order_and_computes_latencies() -> None:
    recognizer = FakeSpeechRecognizer()
    translator = FakeGlossTranslator(
        responses={"Primeira frase": "PRIMEIRO FRASE", "Segunda": "DOIS"}
    )
    # Clock calls: push_audio (10.0) -> seg1 gloss (11.5, 11.75) -> seg2 gloss (13.0, 13.1).
    clock = _StepClock([10.0, 11.5, 11.75, 13.0, 13.1])
    session = TranslationSession(recognizer, translator, gloss_timeout_s=2.0, clock=clock)

    await session.start()
    session.push_audio(b"")  # ignored
    session.push_audio(b"\x01\x02" * 1600)

    # Utterance ended at 1.0s (200ms + 800ms); recognized_at=11.5 -> sttLatency=500ms.
    recognizer.emit(
        TranscriptSegment(text="Primeira frase", offset_ms=200, duration_ms=800, recognized_at=11.5)
    )
    recognizer.emit(
        TranscriptSegment(text="Segunda", offset_ms=1200, duration_ms=1300, recognized_at=13.0)
    )
    recognizer.finish()

    results = [seg async for seg in session.segments()]
    await session.stop()

    assert [r.text for r in results] == ["Primeira frase", "Segunda"]
    assert [r.gloss for r in results] == ["PRIMEIRO FRASE", "DOIS"]
    assert results[0].stt_latency_ms == 500
    assert results[0].gloss_latency_ms == 250
    assert results[1].stt_latency_ms == 500
    assert results[1].gloss_latency_ms == 100
    assert len(recognizer.chunks) == 1
    assert recognizer.stop_calls == 1


async def test_session_falls_back_to_none_on_gloss_error() -> None:
    recognizer = FakeSpeechRecognizer()
    translator = FakeGlossTranslator(error_reason="http_502")
    session = TranslationSession(recognizer, translator, gloss_timeout_s=1.0)

    await session.start()
    recognizer.emit(
        TranscriptSegment(text="Olá mundo", offset_ms=0, duration_ms=500, recognized_at=1.0)
    )
    recognizer.finish()

    results = [seg async for seg in session.segments()]
    assert len(results) == 1
    assert results[0].text == "Olá mundo"
    assert results[0].gloss is None


async def test_session_falls_back_to_none_on_gloss_timeout() -> None:
    recognizer = FakeSpeechRecognizer()
    translator = FakeGlossTranslator(delay_s=0.2)
    session = TranslationSession(recognizer, translator, gloss_timeout_s=0.02)

    await session.start()
    recognizer.emit(
        TranscriptSegment(text="Demorou", offset_ms=0, duration_ms=300, recognized_at=1.0)
    )
    recognizer.finish()

    results = [seg async for seg in session.segments()]
    assert len(results) == 1
    assert results[0].text == "Demorou"
    assert results[0].gloss is None


async def test_session_propagates_speech_recognition_error() -> None:
    recognizer = FakeSpeechRecognizer()
    translator = FakeGlossTranslator()
    session = TranslationSession(recognizer, translator, gloss_timeout_s=1.0)

    await session.start()
    recognizer.fail("AuthenticationFailure")

    with pytest.raises(SpeechRecognitionError) as exc_info:
        _ = [seg async for seg in session.segments()]

    assert exc_info.value.reason == "AuthenticationFailure"
