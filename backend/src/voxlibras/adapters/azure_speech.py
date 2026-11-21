"""Azure AI Speech adapter implementing :class:`voxlibras.domain.ports.SpeechRecognizer`.

This is the ONLY module in the codebase allowed to import ``azure.cognitiveservices.speech``.
Because the official Azure Speech SDK lacks complete type stubs, narrowly scoped
``pyright: ignore`` comments are isolated here so the rest of the project stays strict.
"""

import asyncio
import logging
from collections.abc import AsyncIterator

import azure.cognitiveservices.speech as speechsdk  # pyright: ignore[reportMissingTypeStubs]

from voxlibras.config import Settings
from voxlibras.domain.errors import SpeechNotConfiguredError, SpeechRecognitionError
from voxlibras.domain.models import TranscriptSegment

logger = logging.getLogger(__name__)

_BITS_PER_SAMPLE = 16
_MONO_CHANNELS = 1
_TICKS_PER_MS = 10_000


class AzureSpeechRecognizer:
    """Continuous PT-BR recognizer backed by Azure Speech ``PushAudioInputStream``.

    SDK callbacks fire on native background threads; they push immutable domain objects onto
    an ``asyncio.Queue`` via ``loop.call_soon_threadsafe`` without ever blocking the loop or
    touching disk (volatile in-memory processing for privacy/LGPD compliance).
    """

    def __init__(
        self,
        *,
        speech_key: str,
        speech_region: str,
        sample_rate: int,
        language: str,
        segmentation_silence_ms: int,
    ) -> None:
        """Configure the Azure Speech SDK stream and recognizer without opening the network yet.

        Args:
            speech_key: Azure Speech resource subscription key.
            speech_region: Azure Speech resource region (e.g. ``brazilsouth``).
            sample_rate: PCM sample rate in Hz (16000 expected).
            language: BCP-47 recognition language tag (e.g. ``pt-BR``).
            segmentation_silence_ms: Silence threshold (ms) that closes a sentence.
        """
        stream_format = speechsdk.audio.AudioStreamFormat(
            samples_per_second=sample_rate,
            bits_per_sample=_BITS_PER_SAMPLE,
            channels=_MONO_CHANNELS,
        )
        self._push_stream = speechsdk.audio.PushAudioInputStream(stream_format=stream_format)
        audio_config = speechsdk.audio.AudioConfig(stream=self._push_stream)

        speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
        speech_config.speech_recognition_language = language
        speech_config.set_property(
            speechsdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
            str(segmentation_silence_ms),
        )

        self._recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config,
        )
        self._queue: asyncio.Queue[TranscriptSegment | SpeechRecognitionError | None] = (
            asyncio.Queue()
        )
        self._loop: asyncio.AbstractEventLoop | None = None
        self._started = False
        self._stopped = False
        self._sentinel_sent = False

        self._wire_callbacks()

    async def start(self) -> None:
        """Start continuous recognition on the Azure Speech SDK thread pool.

        Raises:
            SpeechRecognitionError: If the SDK fails to begin recognition.
        """
        self._loop = asyncio.get_running_loop()
        try:
            # ResultFuture.get() is synchronous and blocks until the WS handshake completes.
            future = self._recognizer.start_continuous_recognition_async()
            await asyncio.to_thread(future.get)
        except Exception as exc:
            logger.warning("azure_stt_start_failed error=%s", type(exc).__name__)
            raise SpeechRecognitionError("start_failed") from exc
        else:
            self._started = True

    def push_audio(self, chunk: bytes) -> None:
        """Write raw PCM16 bytes into the in-memory Azure push stream.

        Args:
            chunk: Raw PCM16 little-endian mono audio frame.
        """
        if self._stopped or not chunk:
            return
        self._push_stream.write(chunk)

    async def results(self) -> AsyncIterator[TranscriptSegment]:
        """Yield final recognized sentences until the session stops or fails.

        Yields:
            Ordered non-empty :class:`TranscriptSegment` instances.

        Raises:
            SpeechRecognitionError: If Azure Speech cancels the session with an error.
        """
        while True:
            item = await self._queue.get()
            if item is None:
                return
            if isinstance(item, SpeechRecognitionError):
                raise item
            yield item

    async def stop(self) -> None:
        """Close the push stream, stop recognition and flush pending items (idempotent)."""
        if self._stopped:
            return
        self._stopped = True

        try:
            self._push_stream.close()
            if self._started:
                future = self._recognizer.stop_continuous_recognition_async()
                await asyncio.to_thread(future.get)
        except Exception as exc:
            logger.warning("azure_stt_stop_warning error=%s", type(exc).__name__)
        finally:
            self._send_sentinel()

    def _wire_callbacks(self) -> None:
        """Attach thread-safe SDK event handlers to forward results to asyncio."""
        # Azure SDK signal types omit full typing for `.connect(...)`.
        self._recognizer.recognized.connect(self._on_recognized)  # pyright: ignore[reportUnknownMemberType]
        self._recognizer.canceled.connect(self._on_canceled)  # pyright: ignore[reportUnknownMemberType]
        self._recognizer.session_stopped.connect(self._on_session_stopped)  # pyright: ignore[reportUnknownMemberType]

    def _on_recognized(self, evt: speechsdk.SpeechRecognitionEventArgs) -> None:
        """Handle a final recognized phrase on an SDK worker thread."""
        result = evt.result
        if result.reason != speechsdk.ResultReason.RecognizedSpeech:
            return
        text = result.text.strip()
        if not text:
            return

        # Azure SDK leaves `.offset` and `.duration` partially untyped on SpeechRecognitionResult.
        offset_ticks = int(result.offset)  # pyright: ignore[reportUnknownArgumentType,reportUnknownMemberType]
        duration_ticks = int(result.duration)  # pyright: ignore[reportUnknownArgumentType,reportUnknownMemberType]

        segment = TranscriptSegment(
            text=text,
            offset_ms=offset_ticks // _TICKS_PER_MS,
            duration_ms=duration_ticks // _TICKS_PER_MS,
            recognized_at=self._monotonic_time(),
        )
        self._enqueue(segment)

    def _on_canceled(self, evt: speechsdk.SpeechRecognitionCanceledEventArgs) -> None:
        """Handle session cancellation or upstream errors from Azure Speech."""
        details = evt.cancellation_details
        if details.reason == speechsdk.CancellationReason.Error:
            error_code = str(details.code.name)
            logger.warning("azure_stt_canceled code=%s", error_code)
            self._enqueue(SpeechRecognitionError(error_code))
        self._send_sentinel()

    def _on_session_stopped(self, _evt: speechsdk.SessionEventArgs) -> None:
        """Signal end-of-stream when Azure finishes tearing down the session."""
        self._send_sentinel()

    def _enqueue(self, item: TranscriptSegment | SpeechRecognitionError | None) -> None:
        """Schedule placing an item onto the asyncio queue from any thread."""
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        loop.call_soon_threadsafe(self._queue.put_nowait, item)

    def _send_sentinel(self) -> None:
        """Ensure the ``None`` end-of-stream marker is enqueued at most once."""
        if self._sentinel_sent:
            return
        self._sentinel_sent = True
        self._enqueue(None)

    @staticmethod
    def _monotonic_time() -> float:
        """Return ``time.monotonic()`` (isolated helper for clarity)."""
        import time  # noqa: PLC0415

        return time.monotonic()


class AzureSpeechRecognizerFactory:
    """Factory creating :class:`AzureSpeechRecognizer` instances from app settings."""

    def __init__(self, settings: Settings) -> None:
        """Store runtime configuration used to instantiate per-session recognizers.

        Args:
            settings: Application settings holding Azure credentials and timeouts.
        """
        self._settings = settings

    def __call__(self, *, sample_rate: int, language: str) -> AzureSpeechRecognizer:
        """Build a new recognizer or fail fast if Azure Speech credentials are missing.

        Args:
            sample_rate: PCM sample rate in Hz.
            language: BCP-47 language tag requested by the client.

        Returns:
            A fresh :class:`AzureSpeechRecognizer` ready to be started.

        Raises:
            SpeechNotConfiguredError: If ``AZURE_SPEECH_KEY`` is unset or blank.
        """
        if not self._settings.stt_configured or self._settings.azure_speech_key is None:
            raise SpeechNotConfiguredError

        return AzureSpeechRecognizer(
            speech_key=self._settings.azure_speech_key.get_secret_value(),
            speech_region=self._settings.azure_speech_region,
            sample_rate=sample_rate,
            language=language,
            segmentation_silence_ms=self._settings.segmentation_silence_ms,
        )
