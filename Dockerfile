FROM node:20-slim

# Install ffmpeg for audio processing and curl for health checks
RUN apt-get update && apt-get install -y \
    ffmpeg \
    openssh-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built files
COPY dist/ ./dist/

# Set environment variables
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV MCP_PORT=3000

# Expose the HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Run the server in HTTP mode
CMD ["node", "dist/index.js", "--http", "3000"]
