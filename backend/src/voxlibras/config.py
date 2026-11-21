"""Application configuration loaded from environment variables (and an optional ``.env``)."""

from typing import Annotated

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings.

    Every field maps to an upper-case environment variable of the same name
    (e.g. ``azure_speech_key`` -> ``AZURE_SPEECH_KEY``). The app must start without an Azure
    key so ``/health`` keeps working; WebSocket sessions then fail with ``STT_NOT_CONFIGURED``.

    Attributes:
        azure_speech_key: Azure AI Speech resource key. ``SecretStr`` keeps it out of reprs/logs.
        azure_speech_region: Azure region of the Speech resource.
        speech_language: The only recognition language accepted from clients.
        segmentation_silence_ms: Silence that ends a sentence. Lower values reduce latency but
            split sentences more often.
        vlibras_translator_url: VLibras text-to-gloss endpoint.
        gloss_timeout_s: Upper bound for a gloss request; on timeout the segment is sent with
            ``gloss = null`` so signing is never blocked for long.
        allowed_origin_prefixes: WebSocket ``Origin`` prefixes accepted by the server
            (JSON list in the environment).
        log_level: Python logging level name.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    azure_speech_key: SecretStr | None = None
    azure_speech_region: str = "brazilsouth"
    speech_language: str = "pt-BR"
    segmentation_silence_ms: Annotated[int, Field(ge=100, le=5000)] = 400
    vlibras_translator_url: str = "https://traducao2.vlibras.gov.br/translate"
    gloss_timeout_s: Annotated[float, Field(gt=0, le=30)] = 3.0
    allowed_origin_prefixes: list[str] = Field(default_factory=lambda: ["chrome-extension://"])
    log_level: str = "INFO"

    @property
    def stt_configured(self) -> bool:
        """Whether a non-empty Azure Speech key is available."""
        return self.azure_speech_key is not None and bool(self.azure_speech_key.get_secret_value())
