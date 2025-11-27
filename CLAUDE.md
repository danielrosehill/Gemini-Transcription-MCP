# CLAUDE.md - Gemini Transcription MCP

## Project Purpose

This is an MCP server that provides audio transcription using Google's Gemini multimodal API. The server exposes a single tool (`transcribe_audio`) that accepts an audio file path and returns a structured JSON transcript.

## Key Files

- [SPEC.md](SPEC.md) - Full development specification
- [src/index.ts](src/index.ts) - MCP server entry point
- [src/transcribe.ts](src/transcribe.ts) - Gemini API interaction
- [src/audio.ts](src/audio.ts) - Audio file handling and downsampling
- [elements/prompt.md](elements/prompt.md) - The transcription prompt sent to Gemini
- [elements/response-schema.json](elements/response-schema.json) - Expected JSON response schema

## Architecture

```
Audio File Path → Validate → Downsample (if needed) → Upload to Gemini → Generate Content → Parse JSON → Return
```

The server uses:
- `@modelcontextprotocol/sdk` for MCP protocol
- `@google/generative-ai` for Gemini API
- `ffmpeg` (via child process) for audio downsampling

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run the server (for testing)
node dist/index.js
```

## Environment Variables

- `GEMINI_API_KEY` (required) - Google Gemini API key

## Tool Definition

The MCP exposes one tool:

**`transcribe_audio`**
- Input: `{ file_path: string }` - Absolute path to audio file
- Output: JSON with `title`, `description`, `transcript`, `timestamp`, `timestamp_readable`
- Supported formats: MP3, WAV, OGG, FLAC, AAC, AIFF

## Implementation Notes

1. **Single Tool Philosophy**: This MCP intentionally provides only one tool to minimize context overhead when loaded by AI agents.

2. **Audio Downsampling**: Gemini processes audio at 16kbps internally. Files over 15MB are pre-downsampled using ffmpeg to reduce upload size and API latency.

3. **Prompt Location**: The transcription prompt is in [elements/prompt.md](elements/prompt.md). It instructs Gemini to lightly edit the transcript (remove fillers, apply corrections, add punctuation).

4. **JSON Response**: Gemini is instructed to return JSON matching the schema in [elements/response-schema.json](elements/response-schema.json). The response includes metadata (title, description) alongside the transcript.

5. **Error Handling**: Errors should be informative - file not found, unsupported format, API errors, etc.

## Testing

Test with audio files of various formats and sizes:
```bash
# After building, test directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"transcribe_audio","arguments":{"file_path":"/path/to/test.mp3"}}}' | node dist/index.js
```

## Reference Documentation

The [reference/](reference/) folder contains Gemini API documentation for audio processing. Key points:
- Files API for uploads over 20MB
- Supported MIME types
- 32 tokens per second of audio
- Max 9.5 hours audio per prompt
