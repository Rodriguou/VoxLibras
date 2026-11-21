"""Ports (structural interfaces) the service layer depends on.

Adapters in :mod:`voxlibras.adapters` implement them for real providers; tests implement them
with in-memory fakes. Swapping the gloss translator (e.g. for an LLM) only requires a new
adapter that satisfies :class:`GlossTranslator`.
"""

from collections.abc import AsyncIterator
from typing import Protocol

from voxlibras.domain.models import TranscriptSegment


class SpeechRecognizer(Protocol):
    """A single continuous speech-to-text session fed with raw PCM audio.

    Lifecycle: ``start()`` once, ``push_audio()`` any number of times, then ``stop()``.
    Implementations must keep audio and transcripts in memory only (LGPD privacy compliance).
    """

    async def start(self) -> None:
        """Open the recognition session.

        Raises:
            SpeechRecognitionError: If the provider session cannot be started.
        """
        ...

    def push_audio(self, chunk: bytes) -> None:
        """Feed a chunk of PCM16 little-endian mono audio. Must not block the event loop.

        Args:
            chunk: Raw audio bytes at the sample rate the recognizer was created with.
        """
        ...

    def results(self) -> AsyncIterator[TranscriptSegment]:
        """Iterate over final results in recognition order.

        The iterator ends after ``stop()`` has flushed every pending result.

        Returns:
            An async iterator of non-empty final transcripts.

        Raises:
            SpeechRecognitionError: While iterating, if the provider cancels the session.
        """
        ...

    async def stop(self) -> None:
        """Flush pending audio, end ``results()`` and release provider resources.

        Must be idempotent and safe to call even if ``start()`` was never called or failed.
        """
        ...


class SpeechRecognizerFactory(Protocol):
    """Creates one :class:`SpeechRecognizer` per WebSocket connection."""

    def __call__(self, *, sample_rate: int, language: str) -> SpeechRecognizer:
        """Create a recognizer for the given audio format and language.

        Args:
            sample_rate: PCM sample rate in Hz.
            language: BCP-47 language tag (e.g. ``pt-BR``).

        Returns:
            A new, not yet started recognizer.

        Raises:
            SpeechNotConfiguredError: If the provider credentials are missing.
        """
        ...


class GlossTranslator(Protocol):
    """Converts Portuguese text into Libras gloss.

    Implementations must be stateless and never persist or log input text (LGPD privacy compliance).
    """

    async def translate(self, text: str) -> str:
        """Translate a Portuguese sentence into gloss.

        Args:
            text: A single recognized PT-BR sentence.

        Returns:
            The gloss (non-empty), e.g. ``"OI TUDO_BEM [INTERROGAÇÃO]"``.

        Raises:
            GlossTranslationError: If the upstream service fails or returns no gloss.
        """
        ...
