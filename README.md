# Gemini Transcription Server

A server that provides audio-to-text transcription using Google's Gemini multimodal API.

![Example transcript output](screenshots/1.png)

## Overview

This server provides an HTTP endpoint for transcribing audio files using Gemini's multimodal capabilities. Unlike conventional speech-to-text services, Gemini can process both audio and a steering prompt simultaneously, enabling transcription with intelligent post-processing in a single API call.

## Why This Server?

- **Multimodal Advantage**: Gemini processes audio and text instructions together, allowing combined transcription and language processing in one operation
- **Built-in Post-Processing**: The transcription prompt is pre-configured, so users simply upload an audio file and receive a cleaned, structured transcript.
- **Two Transcription Modes**:
    - **Edited**: Transcribes audio with intelligent cleanup (removes filler words, applies verbal corrections, adds punctuation).
    - **Raw**: Transcribes audio verbatim, including all filler words and false starts.

## The Transcription Prompt

The key to this server's usefulness is the system prompt sent to Gemini. The edited transcription uses a prompt that instructs Gemini to:

1. **Omit filler words** - Remove "um," "uh," "like," etc.
2. **Honor inline corrections** - If you say "I need to buy kiwis—wait, I meant bananas," the output will be "I need to buy bananas"
3. **Add punctuation** - Ensure logical sentence structure
4. **Add paragraph breaks** - Improve readability
5. **Generate subheadings** - Divide text into logical sections

The prompt explicitly tells Gemini NOT to:
- Make stylistic improvements or reword for "better" prose
- Add information not present in the original audio
- Change the user's intended meaning

This results in a transcript that's easy to read while faithfully preserving your original content.

## Features

- Accepts audio file uploads (MP3, WAV, OGG, FLAC, AAC, AIFF) via an HTTP endpoint.
- Automatic audio downsampling to optimize for Gemini's 16 Kbps processing resolution.
- Returns structured JSON with title, description, transcript, and timestamps.

## Requirements

- Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))
- Node.js 18+
- ffmpeg (for processing large audio files)

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/danielrosehill/Gemini-Transcription-MCP.git
    cd Gemini-Transcription-MCP
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the project:
    ```bash
    npm run build
    ```

## Configuration

### API Key

Set the `GEMINI_API_KEY` environment variable to your Google Gemini API key. You can do this by creating a `.env` file in the root of the project:

```
GEMINI_API_KEY=your-api-key
```

Or by setting it in your shell:

```bash
export GEMINI_API_KEY=your-api-key
```

### Model Selection

By default, this MCP uses `gemini-flash-latest` (Gemini Flash Latest). You can select a different model using the `GEMINI_MODEL` environment variable:

| Shorthand | Model | Description |
|-----------|-------|-------------|
| `1` (default) | `gemini-flash-latest` | Gemini Flash Latest - dynamic endpoint |
| `2` | `gemini-2.5-flash-preview-05-20` | Gemini 2.5 Flash Preview |
| `3` | `gemini-2.5-flash-lite-preview-06-17` | Gemini 2.5 Flash Lite (economic) |

```bash
# Use shorthand
export GEMINI_MODEL=2

# Or use full model name
export GEMINI_MODEL=gemini-2.5-flash-preview-05-20
```

See [models.md](models.md) for detailed model information and selection guidance.

## Usage

Start the server:

```bash
npm run start
```

The server will start on port 3000 by default. You can change the port by setting the `PORT` environment variable.

### Transcribe an audio file (MCP tools)

Use the MCP tool by sending either a base64 payload **or** a downloadable URL (for the remote/proxy setup).

**Edited transcript tool**: `transcribe_audio`  
**Raw transcript tool**: `transcribe_audio_raw`

**Parameters**:

- `file_content` (optional): Base64-encoded audio content.
- `file_url` (optional): HTTP(S) URL to fetch the audio from (use this in the “true proxy”/remote setup).
- `ssh_host` + `ssh_path` (optional): Pull the audio directly over SSH/SCP when the MCP host has key-based SSH access to the client (e.g., `ssh_host: "client.local"` and `ssh_path: "/tmp/audio.wav"`). Optional `ssh_user` and `ssh_port` are supported.
- `file_name` (optional): Helpful when using `file_url` without a filename.
- `output_dir` (optional): Where to save a markdown copy of the transcript.

At least one of `file_content`, `file_url`, or `ssh_host`+`ssh_path` must be provided.

**SSH pull example (no manual upload):**

```json
{
  "name": "transcribe_audio",
  "arguments": {
    "ssh_host": "client.example.com",
    "ssh_path": "/tmp/audio.wav",
    "ssh_user": "myuser",        // optional
    "ssh_port": 2222             // optional
  }
}
```

This uses `scp` from the MCP host to the client. Ensure key-based SSH works from the MCP host to the client and `scp` is available on the MCP host. The file is streamed to a temp directory, size-checked, downsampled if large, then uploaded to Gemini.

### HTTP endpoint (legacy local mode)

The original Express server can still be run locally to POST audio files directly:

**Endpoint**: `POST /transcribe`

**Example using `curl` (edited transcript)**:

```bash
curl -X POST -F "audio=@/path/to/your/audio.mp3" http://localhost:3000/transcribe
```

**Example for raw transcription**:

```bash
curl -X POST -F "audio=@/path/to/your/audio.mp3" -F "raw=true" http://localhost:3000/transcribe
```

**Response**:

The server will respond with a JSON object containing the transcription:

| Field | Description |
|-------|-------------|
| `title` | Short descriptive title for the note |
| `description` | Two-sentence summary |
| `transcript` | Transcript in Markdown format |
| `timestamp` | ISO 8601 timestamp |
| `timestamp_readable` | Human-readable timestamp |

## Disclaimer

This server was developed using Claude Code (AI-assisted development). The human author provides direction, requirements, and testing, while the code generation is performed by the AI. Use at your own discretion and review the code before deploying in production environments.
