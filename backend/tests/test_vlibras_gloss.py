import json

import httpx
import pytest

from voxlibras.adapters.vlibras_gloss import VLibrasGlossTranslator
from voxlibras.domain.errors import GlossTranslationError


async def test_vlibras_gloss_returns_stripped_gloss_on_200() -> None:
    captured_body: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_body
        captured_body = json.loads(request.content.decode("utf-8"))
        assert request.headers["Accept"] == "text/plain"
        return httpx.Response(200, text="  OI TUDO_BEM [INTERROGAÇÃO]\n")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    translator = VLibrasGlossTranslator("https://traducao2.vlibras.gov.br/translate", client=client)

    gloss = await translator.translate("Olá, tudo bem?")

    assert gloss == "OI TUDO_BEM [INTERROGAÇÃO]"
    assert captured_body == {"text": "Olá, tudo bem?", "domain": "voxlibras"}
    await client.aclose()


async def test_vlibras_gloss_raises_on_http_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="Service unavailable")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    translator = VLibrasGlossTranslator("https://traducao2.vlibras.gov.br/translate", client=client)

    with pytest.raises(GlossTranslationError) as exc_info:
        await translator.translate("Teste")

    assert exc_info.value.reason == "http_503"
    await client.aclose()


async def test_vlibras_gloss_raises_on_empty_body() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="   \n ")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    translator = VLibrasGlossTranslator("https://traducao2.vlibras.gov.br/translate", client=client)

    with pytest.raises(GlossTranslationError) as exc_info:
        await translator.translate("Teste")

    assert exc_info.value.reason == "empty_gloss"
    await client.aclose()


async def test_vlibras_gloss_raises_on_timeout_and_network_error() -> None:
    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout", request=request)

    timeout_client = httpx.AsyncClient(transport=httpx.MockTransport(timeout_handler))
    translator = VLibrasGlossTranslator(
        "https://traducao2.vlibras.gov.br/translate",
        client=timeout_client,
    )

    with pytest.raises(GlossTranslationError) as timeout_exc:
        await translator.translate("Teste")
    assert timeout_exc.value.reason == "timeout"
    await timeout_client.aclose()

    def connect_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    connect_client = httpx.AsyncClient(transport=httpx.MockTransport(connect_handler))
    translator_err = VLibrasGlossTranslator(
        "https://traducao2.vlibras.gov.br/translate",
        client=connect_client,
    )

    with pytest.raises(GlossTranslationError) as conn_exc:
        await translator_err.translate("Teste")
    assert conn_exc.value.reason == "request_error"
    await connect_client.aclose()
