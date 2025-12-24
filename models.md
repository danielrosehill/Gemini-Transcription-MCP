# Supported Gemini Models

This MCP supports multiple Gemini Flash models for audio transcription. You can select which model to use via the `GEMINI_MODEL` environment variable.

## Default Model

**`gemini-flash-latest`**

This is the default model used when `GEMINI_MODEL` is not set. It's a dynamic endpoint maintained by Google that always points to the latest stable Flash model.

## Available Models

| Shorthand | Model ID | Description |
|-----------|----------|-------------|
| `1` | `gemini-flash-latest` | **Gemini Flash Latest** - Dynamic endpoint that tracks the latest Flash model. Recommended for most users. |
| `2` | `gemini-2.5-flash-preview-05-20` | **Gemini 2.5 Flash Preview** - Preview version of Gemini 2.5 Flash with enhanced capabilities. |
| `3` | `gemini-2.5-flash-lite-preview-06-17` | **Gemini 2.5 Flash Lite** - Economic version optimized for cost-efficiency. Good for high-volume transcription. |

## Configuration

Set the `GEMINI_MODEL` environment variable to select a model:

### Using shorthand numbers

```bash
# Use Gemini Flash Latest (default)
export GEMINI_MODEL=1

# Use Gemini 2.5 Flash Preview
export GEMINI_MODEL=2

# Use Gemini 2.5 Flash Lite (economic)
export GEMINI_MODEL=3
```

### Using full model names

You can also specify the full model name directly:

```bash
export GEMINI_MODEL=gemini-flash-latest
```

This also allows using any Gemini model not in the shorthand list, such as future models or experimental endpoints.

## Model Selection Guidance

| Use Case | Recommended Model |
|----------|-------------------|
| General transcription | `1` (gemini-flash-latest) |
| Latest features/capabilities | `2` (gemini-2.5-flash-preview) |
| High volume / cost-sensitive | `3` (gemini-2.5-flash-lite) |

## Notes

- All models support the same audio formats: MP3, WAV, OGG, FLAC, AAC, AIFF
- Transcription quality may vary slightly between models
- Preview models may have different rate limits or availability
- The Lite model trades some capability for lower cost per request
