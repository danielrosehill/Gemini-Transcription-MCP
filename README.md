# Gemini Transcription MCP

An MCP server for audio-to-text transcription using Google's Gemini multimodal API.

[![npm version](https://badge.fury.io/js/gemini-transcription-mcp.svg)](https://www.npmjs.com/package/gemini-transcription-mcp)

## Quick Start

```bash
# Add to Claude Code (user-level)
claude mcp add gemini-transcription -s user -e GEMINI_API_KEY=your-key -- npx -y gemini-transcription-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `transcribe_audio` | Lightly edited transcript (removes filler words, applies corrections) |
| `transcribe_audio_raw` | Verbatim transcript with no cleanup |
| `transcribe_audio_vad` | VAD preprocessing to strip silence before transcription |
| `transcribe_audio_format` | Transcribe and format as a document type (email, to-do list, etc.) |
| `transcribe_audio_large` | Compresses oversized files to Opus before transcribing |
| `transcribe_audio_custom` | Full control with your own prompt |
| `transcribe_audio_devspec` | Format as a development specification for AI coding agents |

## Input Methods

All tools accept audio via:
- `file_content`: Base64-encoded audio
- `file_url`: HTTP(S) URL to fetch
- `ssh_host` + `ssh_path`: Pull via SCP

## Supported Formats

- **Native**: MP3, WAV, OGG, FLAC, AAC, AIFF
- **Auto-converted**: Opus, M4A, WebM, WMA, and others (converted to OGG/Opus)

> **Note**: When manually converting audio, prefer **MP3** over WAV. MP3 offers good compression with broad compatibility, while WAV files are unnecessarily large.

## Configuration

| Environment Variable | Description |
|---------------------|-------------|
| `GEMINI_API_KEY` | Required. Your Gemini API key |
| `GEMINI_MODEL` | Optional. Model to use (default: `gemini-flash-latest`) |
| `TRANSCRIPT_OUTPUT_DIR` | Optional. Auto-save location (default: `./transcripts`) |

## Requirements

- Node.js 18+
- ffmpeg (for format conversion and VAD preprocessing)
- [Gemini API key](https://aistudio.google.com/app/apikey)

## License

MIT
