"""Domain errors.

The service layer and adapters raise these instead of SDK- or HTTP-specific exceptions so the
transport layer can map them onto protocol error codes without knowing any vendor details.
Messages are fixed per class and never include transcript text (privacy/LGPD compliance).
"""


class VoxLibrasError(Exception):
    """Base class for every error raised intentionally by VoxLibras code."""


class SpeechNotConfiguredError(VoxLibrasError):
    """Raised when the speech-to-text provider has no credentials configured."""

    def __init__(self) -> None:
        """Build the error with a fixed, operator-facing message."""
        super().__init__("Speech-to-text credentials are not configured on the server.")


class SpeechRecognitionError(VoxLibrasError):
    """Raised when the speech-to-text session fails (auth, quota, network, ...).

    Attributes:
        reason: Short machine-readable reason (e.g. the provider's error code). It must never
            contain recognized text.
    """

    def __init__(self, reason: str) -> None:
        """Build the error.

        Args:
            reason: Short machine-readable reason, safe to log and to show to the client.
        """
        super().__init__(f"Speech recognition failed: {reason}")
        self.reason = reason


class GlossTranslationError(VoxLibrasError):
    """Raised when the gloss translator cannot produce a gloss for a sentence.

    Attributes:
        reason: Short machine-readable reason (e.g. ``http_502``). Never contains the input text.
    """

    def __init__(self, reason: str) -> None:
        """Build the error.

        Args:
            reason: Short machine-readable reason, safe to log.
        """
        super().__init__(f"Gloss translation failed: {reason}")
        self.reason = reason
