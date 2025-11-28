#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { transcribeAudio, RAW_TRANSCRIPTION_PROMPT } from './transcribe.js';
import * as fs from 'fs';
import * as path from 'path';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 80);
}

const server = new Server(
  {
    name: 'gemini-transcription',
    version: '0.2.0',
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
          'Transcribes an audio file using Google Gemini multimodal API. Returns a lightly edited transcript with filler words removed, verbal corrections applied, punctuation added, and paragraph breaks inserted. Includes metadata (title, description, timestamps). Supports MP3, WAV, OGG, FLAC, AAC, and AIFF formats. This is the recommended tool for most use cases.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the audio file to transcribe',
            },
            output_dir: {
              type: 'string',
              description:
                'Optional directory path where the transcript will be saved as a markdown file. If provided, saves the transcript with a descriptive filename derived from the title.',
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'transcribe_audio_raw',
        description:
          'Transcribes an audio file using Google Gemini multimodal API. Returns a verbatim transcript with NO cleanup - includes filler words, false starts, and repetitions exactly as spoken. Includes metadata (title, description, timestamps). Supports MP3, WAV, OGG, FLAC, AAC, and AIFF formats. Use this when you need exact speech-to-text without editing.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the audio file to transcribe',
            },
            output_dir: {
              type: 'string',
              description:
                'Optional directory path where the transcript will be saved as a markdown file. If provided, saves the transcript with a descriptive filename derived from the title.',
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

  if (name !== 'transcribe_audio' && name !== 'transcribe_audio_raw') {
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

  const typedArgs = args as { file_path?: string; output_dir?: string };
  const filePath = typedArgs?.file_path;
  const outputDir = typedArgs?.output_dir;

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
    // Use raw prompt for transcribe_audio_raw, default prompt for transcribe_audio
    const customPrompt = name === 'transcribe_audio_raw' ? RAW_TRANSCRIPTION_PROMPT : undefined;
    const result = await transcribeAudio(filePath, customPrompt);

    // If output_dir is provided, save the transcript as a markdown file
    let savedFilePath: string | undefined;
    if (outputDir) {
      const slug = slugify(result.title || 'transcript');
      const filename = `${slug}.md`;
      savedFilePath = path.join(outputDir, filename);

      // Create markdown content
      const markdownContent = `# ${result.title}

> ${result.description}

*Transcribed: ${result.timestamp_readable}*

---

${result.transcript}
`;

      // Ensure directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(savedFilePath, markdownContent, 'utf-8');
    }

    // Include saved path in response if file was saved
    const response = savedFilePath
      ? { ...result, saved_to: savedFilePath }
      : result;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
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
