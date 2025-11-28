# Gemini Transcription MCP

An MCP server that provides audio-to-text transcription using Google's Gemini multimodal API.

## Overview

This MCP server provides a single, focused tool for transcribing audio files using Gemini's multimodal capabilities. Unlike conventional speech-to-text services, Gemini can process both audio and a steering prompt simultaneously, enabling transcription with intelligent post-processing in a single API call.

## Why This MCP?

- **Multimodal Advantage**: Gemini processes audio and text instructions together, allowing combined transcription and language processing in one operation
- **Minimal Context Overhead**: A dedicated single-tool MCP avoids the context bloat that comes with large tool definitions
- **Built-in Post-Processing**: The transcription prompt is pre-configured, so users simply provide an audio file path and receive a cleaned, structured transcript

## Features

- Accepts audio file paths (MP3, WAV, OGG, FLAC, AAC, AIFF)
- Automatic audio downsampling to optimize for Gemini's 16 Kbps processing resolution
- Returns structured JSON with title, description, transcript, and timestamps
- Light editing: removes filler words, applies verbal corrections, adds punctuation and paragraph breaks

## Usage

Provide an audio file path, and the MCP returns a JSON response with:

| Field | Description |
|-------|-------------|
| `title` | Short descriptive title for the note |
| `description` | Two-sentence summary |
| `transcript` | Edited transcript in Markdown format |
| `timestamp` | ISO 8601 timestamp |
| `timestamp_readable` | Human-readable timestamp |

## Requirements

- Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))
- Node.js 18+
- ffmpeg (for processing large audio files)

## Installation

Install from npm:

```bash
npm install -g gemini-transcription-mcp
```

## Configuration

Add to your Claude Code MCP configuration (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "gemini-transcription": {
      "command": "npx",
      "args": ["-y", "gemini-transcription-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-api-key"
      }
    }
  }
}
```

Replace `your-api-key` with your [Gemini API key](https://aistudio.google.com/app/apikey).

### Alternative: Run from global install

If you installed globally with `npm install -g`:

```json
{
  "mcpServers": {
    "gemini-transcription": {
      "command": "gemini-transcription-mcp",
      "env": {
        "GEMINI_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Disclaimer

This MCP server was developed using Claude Code (AI-assisted development). The human author provides direction, requirements, and testing, while the code generation is performed by the AI. Use at your own discretion and review the code before deploying in production environments.
