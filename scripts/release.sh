#!/bin/bash
# Release script for gemini-transcription-mcp
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

VERSION_TYPE=${1:-patch}

echo "🔨 Building..."
npm run build

echo "📦 Bumping version ($VERSION_TYPE)..."
npm version $VERSION_TYPE --no-git-tag-version

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")

# Update version in index.ts
sed -i "s/version: '[0-9]*\.[0-9]*\.[0-9]*'/version: '$NEW_VERSION'/" src/index.ts

echo "🔨 Rebuilding with new version..."
npm run build

echo "📤 Publishing to npm..."
npm publish

echo "📝 Committing version bump..."
git add package.json package-lock.json src/index.ts
git commit -m "v$NEW_VERSION"
git tag "v$NEW_VERSION"

echo "🚀 Pushing to GitHub..."
git push && git push --tags

echo "✅ Released v$NEW_VERSION"
