#!/bin/bash
# Update locally installed gemini-transcription-mcp from npm

set -e

echo "Updating gemini-transcription-mcp from npm..."
npm install -g gemini-transcription-mcp@latest

echo "Installed version:"
npm list -g gemini-transcription-mcp
