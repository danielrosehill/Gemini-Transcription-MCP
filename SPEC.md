# Gemini Transcription MCP - Development Specification

## Project Overview

**Purpose**: Build an MCP (Model Context Protocol) server that provides a single tool for transcribing audio files using Google's Gemini multimodal API.

**Core Value Proposition**: Leverage Gemini's ability to process audio and text prompts simultaneously, enabling transcription with intelligent post-processing in one API call.

## Architecture

### Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Gemini SDK**: `@google/generative-ai`
- **Audio Processing**: `ffmpeg` (via child process) for downsampling

### Project Structure

```
gemini-transcription-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── transcribe.ts      # Gemini API interaction
│   ├── audio.ts           # Audio file handling and downsampling
│   ├── prompt.ts          # Transcription prompt template
│   └── types.ts           # TypeScript interfaces
├── dist/                  # Compiled output
├── elements/
│   ├── prompt.md          # Source prompt template
│   └── response-schema.json
├── reference/             # API documentation
├── package.json
├── tsconfig.json
└── README.md
```

## Tool Specification

### Tool Name

`transcribe_audio`

### Tool Description

Transcribes an audio file using Gemini's multimodal API, returning a lightly edited transcript with metadata.

### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | Absolute path to the audio file |

### Output Schema

```json
{
  "title": "string",
  "description": "string",
  "transcript": "string",
  "timestamp": "string (ISO 8601)",
  "timestamp_readable": "string"
}
```

### Supported Audio Formats

- MP3 (`audio/mp3`, `audio/mpeg`)
- WAV (`audio/wav`)
- OGG (`audio/ogg`)
- FLAC (`audio/flac`)
- AAC (`audio/aac`)
- AIFF (`audio/aiff`)

## Implementation Details

### Audio Processing Pipeline

1. **Validate File**: Check file exists and has supported extension
2. **Check File Size**: If > 15MB, proceed to downsampling
3. **Downsample** (if needed):
   - Convert to mono
   - Downsample to 16kHz sample rate
   - Encode as MP3 at low bitrate (32kbps)
   - Store in temp directory
4. **Upload to Gemini**: Use Files API for upload
5. **Generate Content**: Send audio + prompt to Gemini
6. **Parse Response**: Extract JSON from Gemini response
7. **Cleanup**: Delete uploaded file from Gemini Files API

### Gemini API Configuration

- **Model**: `gemini-2.0-flash` (or latest stable)
- **Response Format**: JSON mode with schema enforcement
- **Max Output Tokens**: 8192 (sufficient for long transcripts)

### Transcription Prompt

The prompt instructs Gemini to:

1. Return a lightly edited transcript
2. Remove filler words (um, uh, like)
3. Apply verbal corrections (when user says "wait, I meant...")
4. Add punctuation and paragraph breaks
5. Generate subheadings where logical
6. Produce a title and two-sentence description
7. Include timestamps

See [elements/prompt.md](elements/prompt.md) for the full prompt.

### Error Handling

| Error Condition | Response |
|-----------------|----------|
| File not found | Error with message indicating path |
| Unsupported format | Error listing supported formats |
| File too large (>100MB) | Error suggesting file compression |
| Gemini API error | Pass through error message |
| Invalid JSON response | Error with raw response for debugging |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |

## MCP Server Configuration

### stdio Transport

The server communicates via stdio (standard input/output), which is the standard transport for MCP servers used with Claude Code.

### Server Capabilities

```json
{
  "capabilities": {
    "tools": {}
  }
}
```

## Development Tasks

### Phase 1: Project Setup

- [ ] Initialize npm project with TypeScript
- [ ] Install dependencies (`@modelcontextprotocol/sdk`, `@google/generative-ai`)
- [ ] Configure TypeScript
- [ ] Create basic project structure

### Phase 2: Core Implementation

- [ ] Implement audio file validation
- [ ] Implement ffmpeg downsampling
- [ ] Implement Gemini file upload
- [ ] Implement content generation with prompt
- [ ] Implement JSON response parsing

### Phase 3: MCP Integration

- [ ] Create MCP server with stdio transport
- [ ] Register `transcribe_audio` tool
- [ ] Handle tool calls and return results

### Phase 4: Testing & Polish

- [ ] Test with various audio formats
- [ ] Test with large files (downsampling path)
- [ ] Test error conditions
- [ ] Update README with final instructions

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@google/generative-ai": "^0.21.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

## External Requirements

- **ffmpeg**: Must be installed on the system for audio downsampling
  - Ubuntu: `sudo apt install ffmpeg`
  - macOS: `brew install ffmpeg`

## Notes

- Gemini downsamples all audio to 16kbps internally, so pre-downsampling avoids uploading unnecessarily large files
- The Files API is preferred over inline data for reliability and to handle files approaching the 20MB limit
- The prompt is designed for voice notes/dictation, not music or multi-speaker recordings
