"""VLibras HTTP adapter implementing :class:`voxlibras.domain.ports.GlossTranslator`.

Calls the public VLibras translator endpoint to convert PT-BR sentences into Libras glosses.
No input text or gloss is ever persisted or written to logs (volatile LGPD privacy compliance).
"""

import httpx

from voxlibras.domain.errors import GlossTranslationError

_DEFAULT_DOMAIN = "voxlibras"


class VLibrasGlossTranslator:
    """Translates PT-BR sentences to Libras gloss using the VLibras REST endpoint.

    Attributes:
        _client: Shared async HTTP client.
        _translator_url: Full URL of the VLibras ``/translate`` endpoint.
        _owns_client: Whether this instance should close ``_client`` on ``aclose()``.
    """

    def __init__(
        self,
        translator_url: str,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        """Create the adapter.

        Args:
            translator_url: Target VLibras translation endpoint.
            client: Optional shared ``httpx.AsyncClient`` (useful for connection pooling or
                ``httpx.MockTransport`` in tests).
        """
        self._translator_url = translator_url
        self._owns_client = client is None
        self._client = client if client is not None else httpx.AsyncClient()

    async def translate(self, text: str) -> str:
        """Translate a PT-BR sentence into Libras gloss.

        Args:
            text: Recognized PT-BR sentence.

        Returns:
            Non-empty gloss string returned by the VLibras service.

        Raises:
            GlossTranslationError: On network failures, HTTP errors or empty responses.
        """
        payload = {"text": text, "domain": _DEFAULT_DOMAIN}
        headers = {"Accept": "text/plain"}

        try:
            response = await self._client.post(
                self._translator_url,
                json=payload,
                headers=headers,
            )
        except httpx.TimeoutException as exc:
            raise GlossTranslationError("timeout") from exc
        except httpx.HTTPError as exc:
            raise GlossTranslationError("request_error") from exc

        if response.status_code != httpx.codes.OK.value:
            raise GlossTranslationError(f"http_{response.status_code}")

        gloss = response.text.strip()
        if not gloss:
            raise GlossTranslationError("empty_gloss")

        return gloss

    async def aclose(self) -> None:
        """Close the underlying HTTP client if it is owned by this adapter."""
        if self._owns_client:
            await self._client.aclose()
