"""In-memory test doubles implementing the domain ports."""

import asyncio
from collections.abc import AsyncIterator, Callable

from voxlibras.domain.errors import (
    GlossTranslationError,
    SpeechNotConfiguredError,
    SpeechRecognitionError,
)
from voxlibras.domain.models import TranscriptSegment
from voxlibras.domain.ports import SpeechRecognizer


class FakeSpeechRecognizer:
    """Configurable in-memory recognizer for service and WebSocket tests."""

    def __init__(
        self,
        *,
        start_error: SpeechRecognitionError | None = None,
        on_chunk: Callable[["FakeSpeechRecognizer", bytes], None] | None = None,
    ) -> None:
        self.started = False
        self.stop_calls = 0
        self.chunks: list[bytes] = []
        self._start_error = start_error
        self._on_chunk = on_chunk
        self._queue: asyncio.Queue[TranscriptSegment | SpeechRecognitionError | None] = (
            asyncio.Queue()
        )
        self._ended = False

    @property
    def stopped(self) -> bool:
        return self.stop_calls > 0

    async def start(self) -> None:
        if self._start_error is not None:
            raise self._start_error
        self.started = True

    def push_audio(self, chunk: bytes) -> None:
        self.chunks.append(chunk)
        if self._on_chunk is not None:
            self._on_chunk(self, chunk)

    def emit(self, segment: TranscriptSegment) -> None:
        self._queue.put_nowait(segment)

    def fail(self, reason: str = "provider_error") -> None:
        self._queue.put_nowait(SpeechRecognitionError(reason))
        self.finish()

    def finish(self) -> None:
        if not self._ended:
            self._ended = True
            self._queue.put_nowait(None)

    async def results(self) -> AsyncIterator[TranscriptSegment]:
        while True:
            item = await self._queue.get()
            if item is None:
                return
            if isinstance(item, SpeechRecognitionError):
                raise item
            yield item

    async def stop(self) -> None:
        self.stop_calls += 1
        self.finish()


class FakeSpeechRecognizerFactory:
    """Factory returning pre-built fake recognizers or raising ``SpeechNotConfiguredError``."""

    def __init__(
        self,
        recognizer: FakeSpeechRecognizer | None = None,
        *,
        not_configured: bool = False,
    ) -> None:
        self._recognizer = recognizer
        self._not_configured = not_configured
        self.calls: list[tuple[int, str]] = []

    def __call__(self, *, sample_rate: int, language: str) -> SpeechRecognizer:
        self.calls.append((sample_rate, language))
        if self._not_configured:
            raise SpeechNotConfiguredError
        if self._recognizer is None:
            return FakeSpeechRecognizer()
        return self._recognizer


class FakeGlossTranslator:
    """In-memory gloss translator supporting fixed responses, errors and artificial delays."""

    def __init__(
        self,
        *,
        responses: dict[str, str] | None = None,
        error_reason: str | None = None,
        delay_s: float = 0.0,
    ) -> None:
        self._responses = responses or {}
        self._error_reason = error_reason
        self._delay_s = delay_s
        self.seen_texts: list[str] = []

    async def translate(self, text: str) -> str:
        self.seen_texts.append(text)
        if self._delay_s > 0:
            await asyncio.sleep(self._delay_s)
        if self._error_reason is not None:
            raise GlossTranslationError(self._error_reason)
        return self._responses.get(text, text.upper())
