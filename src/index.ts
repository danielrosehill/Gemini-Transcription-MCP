#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { transcribeAudio } from './transcribe.js';

const server = new Server(
  {
    name: 'gemini-transcription',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'transcribe_audio',
        description:
          'Transcribes an audio file using Google Gemini multimodal API. Returns a lightly edited transcript with metadata including title, description, and timestamps. Supports MP3, WAV, OGG, FLAC, AAC, and AIFF formats.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the audio file to transcribe',
            },
          },
          required: ['file_path'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'transcribe_audio') {
    return {
      content: [
        {
          type: 'text',
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  }

  const filePath = (args as { file_path?: string })?.file_path;

  if (!filePath) {
    return {
      content: [
        {
          type: 'text',
          text: 'Missing required parameter: file_path',
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await transcribeAudio(filePath);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Transcription failed: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Gemini Transcription MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
