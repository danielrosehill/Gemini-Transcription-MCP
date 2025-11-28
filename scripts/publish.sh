#!/bin/bash
# Publish script for gemini-transcription-mcp
# Builds and publishes to npm

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Building TypeScript..."
npm run build

echo "Publishing to npm..."
npm publish

VERSION=$(node -p "require('./package.json').version")
echo "Successfully published gemini-transcription-mcp@$VERSION"
