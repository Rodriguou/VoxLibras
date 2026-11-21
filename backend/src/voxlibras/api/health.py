"""HTTP health check endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from voxlibras.api.schemas import HealthResponse
from voxlibras.config import Settings

router = APIRouter(tags=["health"])


def get_settings(request: Request) -> Settings:
    """Resolve application :class:`Settings` stored on ``app.state``.

    Args:
        request: Incoming FastAPI request.

    Returns:
        Configured :class:`Settings` instance.
    """
    return request.app.state.settings  # type: ignore[no-any-return]


@router.get("/health", response_model=HealthResponse, response_model_by_alias=True)
async def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    """Report server liveness and whether speech-to-text credentials are configured.

    Args:
        settings: Injected application settings.

    Returns:
        Liveness status and ``sttConfigured`` boolean flag.
    """
    return HealthResponse(stt_configured=settings.stt_configured)
