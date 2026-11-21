# VoxLibras Backend

FastAPI WebSocket server that receives 16 kHz PCM16 mono tab audio from the browser extension,
transcribes Portuguese (`pt-BR`) in real time with Azure AI Speech, translates sentences into Libras
gloss via VLibras, and streams translated segments back to the extension.

See [docs/protocol.md](../docs/protocol.md) for the exact WebSocket wire contract.

## Requirements

- Python `>=3.13`
- [uv](https://docs.astral.sh/uv/)
- An Azure AI Speech resource key (recommended region: `brazilsouth`)

## Setup

```powershell
cd backend
uv sync
Copy-Item .env.example .env
# Edit .env and set AZURE_SPEECH_KEY (and AZURE_SPEECH_REGION if different from brazilsouth)
```

> Note: `GET /health` works even without `AZURE_SPEECH_KEY`; WebSocket sessions return
> `STT_NOT_CONFIGURED` until a key is configured.

## Running

```powershell
cd backend
uv run uvicorn voxlibras.main:app --reload --port 8000
```

Probe health:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

## Quality & Tests

```powershell
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
```
