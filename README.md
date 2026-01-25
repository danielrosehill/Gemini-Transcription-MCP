# Gemini Transcription MCP

An MCP server for audio-to-text transcription using Google's Gemini multimodal API.

[![npm version](https://badge.fury.io/js/gemini-transcription-mcp.svg)](https://www.npmjs.com/package/gemini-transcription-mcp)

## Quick Start

### Claude Code (Recommended)

```bash
claude mcp add gemini-transcription -s user \
  -e GEMINI_API_KEY=your-key \
  -- npx -y gemini-transcription-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gemini-transcription": {
      "command": "npx",
      "args": ["-y", "gemini-transcription-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-key"
      }
    }
  }
}
```

### Remote Deployment (MetaMCP, MCP Aggregators)

For MCP aggregators that require HTTP transport:

```bash
# Using Docker (recommended for remote)
docker run -d \
  -p 3000:3000 \
  -e GEMINI_API_KEY=your-key \
  ghcr.io/danielrosehill/gemini-transcription-mcp

# Or run directly with HTTP transport
GEMINI_API_KEY=your-key npx gemini-transcription-mcp --http 3000
```

The server exposes:
- `http://host:3000/mcp` - MCP endpoint (streamable HTTP)
- `http://host:3000/health` - Health check

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
- `ssh_host` + `ssh_path`: Pull via SCP (local deployment only)

## Supported Formats

- **Native**: MP3, WAV, OGG, FLAC, AAC, AIFF
- **Auto-converted**: Opus, M4A, WebM, WMA, and others (converted to OGG/Opus)

> **Note**: When manually converting audio, prefer **MP3** over WAV. MP3 offers good compression with broad compatibility, while WAV files are unnecessarily large.

## Configuration

| Environment Variable | Description |
|---------------------|-------------|
| `GEMINI_API_KEY` | Required. Your Gemini API key |
| `GEMINI_MODEL` | Optional. Model to use (default: `gemini-flash-latest`) |
| `TRANSCRIPT_OUTPUT_DIR` | Optional. Auto-save location (default: `./transcripts`). Set to empty string to disable. |
| `MCP_TRANSPORT` | Optional. Set to `http` for HTTP transport mode |
| `MCP_PORT` | Optional. Port for HTTP mode (default: `3000`) |

## Deployment Options

### Local (Claude Code, Claude Desktop)

Uses stdio transport. All features available including SSH file retrieval.

```bash
# Via npx (recommended)
npx gemini-transcription-mcp

# Or install globally
npm install -g gemini-transcription-mcp
gemini-transcription-mcp
```

### Remote/Docker (MetaMCP, Aggregators)

Uses HTTP transport. Requires container or server with ffmpeg installed.

**Docker Compose:**

```yaml
# docker-compose.yml
services:
  gemini-transcription:
    image: ghcr.io/danielrosehill/gemini-transcription-mcp
    ports:
      - "3000:3000"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
```

```bash
# Create .env file with your API key
echo "GEMINI_API_KEY=your-key" > .env

# Start the service
docker compose up -d
```

**MetaMCP Configuration:**

Add the HTTP endpoint to your MetaMCP configuration:
```
http://your-server:3000/mcp
```

### Feature Availability by Deployment Type

| Feature | Local (stdio) | Remote (HTTP) |
|---------|--------------|---------------|
| Base64 audio input | Yes | Yes |
| URL audio input | Yes | Yes |
| SSH file retrieval | Yes | No* |
| Transcript auto-save | Yes | Container volume |
| VAD preprocessing | Yes | Yes |
| Format conversion | Yes | Yes |

\* SSH retrieval requires local access to SSH keys and network.

## Requirements

- Node.js 18+
- ffmpeg (for format conversion and VAD preprocessing)
- [Gemini API key](https://aistudio.google.com/app/apikey)

When using Docker, ffmpeg is included in the image.

## Building from Source

```bash
git clone https://github.com/danielrosehill/Gemini-Transcription-MCP.git
cd Gemini-Transcription-MCP
npm install
npm run build

# Run locally
GEMINI_API_KEY=your-key npm start

# Run with HTTP transport
GEMINI_API_KEY=your-key npm start -- --http 3000

# Build Docker image
docker build -t gemini-transcription-mcp .
```

## License

MIT
