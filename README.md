# Gemini Transcription MCP

An MCP server for audio-to-text transcription using Google's Gemini multimodal API.

[![npm version](https://badge.fury.io/js/gemini-transcription-mcp.svg)](https://www.npmjs.com/package/gemini-transcription-mcp)

## Quick Start

### Claude Code (Recommended)

```bash
claude mcp add gemini-transcription -s user \
  -e OPENROUTER_API_KEY=your-key \
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
        "OPENROUTER_API_KEY": "your-key"
      }
    }
  }
}
```

### MetaMCP

Add via the MetaMCP UI or import JSON:

```json
{
  "mcpServers": {
    "gemini-transcription": {
      "command": "npx",
      "args": ["-y", "gemini-transcription-mcp"],
      "env": {
        "OPENROUTER_API_KEY": "your-key"
      },
      "description": "Audio transcription using Gemini models via OpenRouter"
    }
  }
}
```

Or fill in the Add Server form manually:

| Field | Value |
|-------|-------|
| **Command** | `npx` |
| **Arguments** | `-y gemini-transcription-mcp` |
| **Environment Variables** | `OPENROUTER_API_KEY=your-key` |

### Remote Deployment (HTTP Transport)

For deployments that require HTTP transport:

```bash
# Using Docker (recommended for remote) - the container listens on 0.0.0.0, so a token is required
docker run -d \
  -p 3000:3000 \
  -e OPENROUTER_API_KEY=your-key \
  -e MCP_AUTH_TOKEN=a-long-random-string \
  ghcr.io/danielrosehill/gemini-transcription-mcp

# Or run directly with HTTP transport (binds to 127.0.0.1 by default)
OPENROUTER_API_KEY=your-key npx gemini-transcription-mcp --http 3000
```

The server exposes:
- `http://host:3000/mcp` - MCP endpoint (streamable HTTP, one server instance per session)
- `http://host:3000/health` - Health check (never requires auth)

HTTP mode binds to `127.0.0.1` unless `MCP_HOST` is set. It refuses to start on a
non-loopback address without `MCP_AUTH_TOKEN`, because the tools write files
(`output_dir`) and pull audio over SCP with the server's own SSH keys (`ssh_host`).
With a token set, clients send `Authorization: Bearer <token>` on every request.
Before 0.8.2, HTTP mode listened on all interfaces with no authentication and a
second request crashed the process.

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
| `OPENROUTER_API_KEY` | Required. Your OpenRouter API key |
| `OPENROUTER_MODEL` | Optional. `flash` (default, `google/gemini-3.8-flash`), `lite` (`google/gemini-3.5-flash-lite`), `latest` (floating `~google/gemini-flash-latest`), or any OpenRouter model ID. See [models.md](models.md) |
| `TRANSCRIPT_OUTPUT_DIR` | Optional. Auto-save location (default: `./transcripts`). Set to empty string to disable. |
| `MCP_TRANSPORT` | Optional. Set to `http` for HTTP transport mode |
| `MCP_PORT` | Optional. Port for HTTP mode (default: `3000`) |
| `MCP_HOST` | Optional. Bind address for HTTP mode (default: `127.0.0.1`) |
| `MCP_AUTH_TOKEN` | Optional on loopback, required on any other `MCP_HOST`. Bearer token clients must send |

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
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
```

```bash
# Create .env file with your API key
echo "OPENROUTER_API_KEY=your-key" > .env

# Start the service
docker compose up -d
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
- [OpenRouter API key](https://openrouter.ai/keys)

When using Docker, ffmpeg is included in the image.

## Building from Source

```bash
git clone https://github.com/danielrosehill/Gemini-Transcription-MCP.git
cd Gemini-Transcription-MCP
npm install
npm run build

# Run locally
OPENROUTER_API_KEY=your-key npm start

# Run with HTTP transport
OPENROUTER_API_KEY=your-key MCP_TRANSPORT=http npm start

# Build Docker image
docker build -t gemini-transcription-mcp .
```

## License

MIT
