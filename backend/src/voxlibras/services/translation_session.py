"""Orchestration service for a single streaming translation session.

Coordinates audio ingestion, speech recognition and gloss translation while keeping segment
order intact, enforcing the per-segment gloss timeout and emitting privacy-safe metrics.
"""

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Callable
from uuid import uuid4

from voxlibras.domain.errors import GlossTranslationError
from voxlibras.domain.models import GlossSegment
from voxlibras.domain.ports import GlossTranslator, SpeechRecognizer

logger = logging.getLogger(__name__)

_MS_PER_SECOND = 1_000


class TranslationSession:
    """Runs the real-time pipeline ``audio -> STT -> gloss`` for one WebSocket connection.

    Privacy (LGPD): audio chunks and transcripts are kept strictly in memory for the duration of
    the session; logs record only segment IDs, failure reasons and latency timings.
    """

    def __init__(
        self,
        recognizer: SpeechRecognizer,
        gloss_translator: GlossTranslator,
        *,
        gloss_timeout_s: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """Initialize the session.

        Args:
            recognizer: Speech-to-text stream consumer.
            gloss_translator: PT-BR to Libras gloss converter.
            gloss_timeout_s: Maximum seconds to wait for each gloss request before falling back
                to ``gloss = None``.
            clock: Monotonic clock function used for latency calculations and testing.
        """
        self._recognizer = recognizer
        self._gloss_translator = gloss_translator
        self._gloss_timeout_s = gloss_timeout_s
        self._clock = clock
        self._audio_started_at: float | None = None

    async def start(self) -> None:
        """Start the underlying speech recognizer.

        Raises:
            SpeechRecognitionError: If the recognizer fails to initialize.
        """
        await self._recognizer.start()

    def push_audio(self, chunk: bytes) -> None:
        """Forward a PCM16 audio chunk to the recognizer and anchor the audio clock.

        Args:
            chunk: Raw PCM16 little-endian mono bytes. Empty chunks are ignored.
        """
        if not chunk:
            return
        if self._audio_started_at is None:
            self._audio_started_at = self._clock()
        self._recognizer.push_audio(chunk)

    async def segments(self) -> AsyncIterator[GlossSegment]:
        """Yield translated :class:`GlossSegment` instances in recognition order.

        If gloss translation times out or raises :class:`GlossTranslationError`, the segment
        is still yielded with ``gloss=None`` so the avatar can fall back to signing ``text``.

        Yields:
            Ordered segments ready to be sent over the WebSocket.

        Raises:
            SpeechRecognitionError: If the speech recognizer fails mid-stream.
        """
        async for transcript in self._recognizer.results():
            segment_id = str(uuid4())
            gloss_started_at = self._clock()
            gloss = await self._translate_with_fallback(segment_id, transcript.text)
            gloss_latency_ms = max(0, round((self._clock() - gloss_started_at) * _MS_PER_SECOND))

            if self._audio_started_at is None:
                stt_latency_ms = 0
            else:
                utterance_ended_at = self._audio_started_at + (transcript.end_ms / _MS_PER_SECOND)
                stt_latency_ms = max(
                    0,
                    round((transcript.recognized_at - utterance_ended_at) * _MS_PER_SECOND),
                )

            logger.info(
                "segment_ready id=%s stt_ms=%d gloss_ms=%d fallback=%s",
                segment_id,
                stt_latency_ms,
                gloss_latency_ms,
                gloss is None,
            )

            yield GlossSegment(
                segment_id=segment_id,
                text=transcript.text,
                gloss=gloss,
                stt_latency_ms=stt_latency_ms,
                gloss_latency_ms=gloss_latency_ms,
            )

    async def stop(self) -> None:
        """Stop the underlying speech recognizer and release resources (idempotent)."""
        await self._recognizer.stop()

    async def _translate_with_fallback(self, segment_id: str, text: str) -> str | None:
        """Translate ``text`` into gloss within ``_gloss_timeout_s`` (``None`` on failure)."""
        try:
            return await asyncio.wait_for(
                self._gloss_translator.translate(text),
                timeout=self._gloss_timeout_s,
            )
        except TimeoutError:
            logger.warning("gloss_fallback id=%s reason=timeout", segment_id)
            return None
        except GlossTranslationError as exc:
            logger.warning("gloss_fallback id=%s reason=%s", segment_id, exc.reason)
            return None
