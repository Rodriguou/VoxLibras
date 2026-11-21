"""FastAPI application factory and ASGI entrypoint."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from voxlibras.adapters.azure_speech import AzureSpeechRecognizerFactory
from voxlibras.adapters.vlibras_gloss import VLibrasGlossTranslator
from voxlibras.api.health import router as health_router
from voxlibras.api.translation_ws import router as translation_ws_router
from voxlibras.config import Settings
from voxlibras.domain.ports import GlossTranslator, SpeechRecognizerFactory


def create_app(
    settings: Settings | None = None,
    *,
    recognizer_factory: SpeechRecognizerFactory | None = None,
    gloss_translator: GlossTranslator | None = None,
) -> FastAPI:
    """Build and configure the FastAPI application.

    Accepts optional dependency overrides so tests can inject in-memory fakes without patching
    module globals.

    Args:
        settings: Optional application settings; defaults to loading from environment / ``.env``.
        recognizer_factory: Optional STT factory override.
        gloss_translator: Optional gloss translator override.

    Returns:
        Configured :class:`FastAPI` application ready to serve HTTP and WebSocket traffic.
    """
    resolved_settings = settings if settings is not None else Settings()

    logging.basicConfig(
        level=resolved_settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncGenerator[None]:
        http_client: httpx.AsyncClient | None = None
        resolved_factory = (
            recognizer_factory
            if recognizer_factory is not None
            else AzureSpeechRecognizerFactory(resolved_settings)
        )
        if gloss_translator is not None:
            resolved_translator: GlossTranslator = gloss_translator
        else:
            http_client = httpx.AsyncClient(timeout=resolved_settings.gloss_timeout_s)
            resolved_translator = VLibrasGlossTranslator(
                resolved_settings.vlibras_translator_url,
                client=http_client,
            )

        application.state.settings = resolved_settings
        application.state.recognizer_factory = resolved_factory
        application.state.gloss_translator = resolved_translator

        try:
            yield
        finally:
            if http_client is not None:
                await http_client.aclose()

    application = FastAPI(
        title="VoxLibras Backend",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.include_router(health_router)
    application.include_router(translation_ws_router)
    return application


app = create_app()
