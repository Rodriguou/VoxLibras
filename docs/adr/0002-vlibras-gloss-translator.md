# ADR 0002 — VLibras Gloss Translator as Default Glossing Engine

- **Status:** Accepted
- **Context:** VoxLibras must convert transcribed Portuguese sentences into Libras gloss grammar rather than literal signed Portuguese, while maintaining low latency and strict volatile in-memory processing for privacy/LGPD compliance.

## Decision

Implement `GlossTranslator` as a domain `Protocol` in `backend/src/voxlibras/domain/ports.py` and use `VLibrasGlossTranslator` (`https://traducao2.vlibras.gov.br/translate`) as the default production adapter, with automatic fallback to `gloss = null` (causing the avatar to sign the raw PT-BR text) if the upstream translator fails or exceeds `GLOSS_TIMEOUT_S` (3.0s).

## Alternatives Considered

1. **Azure OpenAI / LLM prompt-based gloss generation:**
   Deferred to a future release. While an LLM can handle idiomatic expressions better, it costs per token, adds 400–1500 ms latency, frequently invents gloss tokens absent from the VLibras 3D sign dictionary (causing slow fingerspelling), and by default retains prompts for up to 30 days under Azure OpenAI abuse monitoring unless gated Modified Abuse Monitoring is formally approved—conflicting with strict volatile in-memory processing (LGPD compliance).
2. **Delegation inside client-side `player.translate(text)`:**
   Rejected because keeping gloss translation in the backend makes the glossing stage explicit, observable via latency metrics (`glossLatencyMs`), and cleanly swappable with future models.

## Consequences

- **Positive:** 100% token compatibility with the VLibras dictionary, zero LLM inference cost, ~250 ms median latency, and clean hexagonal port boundary ready for future benchmarking against fine-tuned models.
- **Negative:** Dependent on availability of the public `traducao2.vlibras.gov.br` service; mitigated by the `3.0s` timeout and graceful client fallback.
