# Supported Gemini Models

Transcription goes through OpenRouter. Pick a model with the `OPENROUTER_MODEL`
environment variable or the per-call `model` tool argument (the argument wins).

Model IDs are **pinned**, not floating: a silent model swap changes transcript output,
so upgrades are deliberate releases. Last reviewed 2026-10-21 against
`https://openrouter.ai/api/v1/models`.

| Alias | OpenRouter model ID | Notes |
|-------|---------------------|-------|
| `flash` / `1` | `google/gemini-3.8-flash` | **Default.** Released on OpenRouter 2026-09-02. Audio $0.825/M tokens |
| `lite` / `2` | `google/gemini-3.5-flash-lite` | Cheaper. Audio $0.30/M tokens |
| `latest` | `~google/gemini-flash-latest` | OpenRouter's floating alias; tracks Google's current Flash, output can change without a release |

Any other value is passed through to OpenRouter as a model ID, so new or batch models
(`google/gemini-3.8-flash:batch`) work without a release, provided they accept audio input.

## History

| Version | Default | Flash | Lite |
|---------|---------|-------|------|
| 0.8.2 | `google/gemini-3.8-flash` | `google/gemini-3.8-flash` | `google/gemini-3.5-flash-lite` |
| 0.8.1 and earlier 0.8.x | `google/gemini-3.1-flash-lite-preview` | `google/gemini-3-flash-preview` | `google/gemini-3.1-flash-lite-preview` |

Versions before the move to OpenRouter used a `GEMINI_MODEL` variable against the
Gemini API directly; that variable is no longer read.
