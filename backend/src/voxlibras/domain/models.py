"""Immutable domain models exchanged between the recognizer, the session and the transport.

These objects carry transcript text, so they must only ever live in memory for privacy/LGPD
compliance: never persist them and never log their ``text``/``gloss`` fields.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TranscriptSegment:
    """A final sentence recognized by the speech-to-text provider.

    Attributes:
        text: Recognized PT-BR text (non-empty).
        offset_ms: Start of the utterance, relative to the first audio byte of the stream.
        duration_ms: Length of the utterance in the audio stream.
        recognized_at: ``time.monotonic()`` timestamp taken when the provider delivered the
            result. Used together with the audio clock to measure STT latency.
    """

    text: str
    offset_ms: int
    duration_ms: int
    recognized_at: float

    @property
    def end_ms(self) -> int:
        """Audio-stream position (ms) where the utterance ended."""
        return self.offset_ms + self.duration_ms


@dataclass(frozen=True, slots=True)
class GlossSegment:
    """A recognized sentence enriched with its Libras gloss and latency metrics.

    Attributes:
        segment_id: Unique id (UUID4 string) used by the client to correlate segments.
        text: Recognized PT-BR text.
        gloss: Libras gloss, or ``None`` when the translator failed; the client then falls back
            to signing ``text`` directly.
        stt_latency_ms: Time between the end of the utterance in the audio stream and the
            moment the final result was delivered.
        gloss_latency_ms: Time spent waiting for the gloss translator (including failures).
    """

    segment_id: str
    text: str
    gloss: str | None
    stt_latency_ms: int
    gloss_latency_ms: int
