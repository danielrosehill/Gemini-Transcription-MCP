#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { transcribeAudio, RAW_TRANSCRIPTION_PROMPT, generateFormatPrompt } from './transcribe.js';
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
    version: '0.3.0',
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
            file_content: {
              type: 'string',
              description: 'Base64-encoded content of the audio file to transcribe (provide this OR file_url)',
            },
            file_url: {
              type: 'string',
              description: 'HTTP(S) URL where the audio file can be fetched (provide this OR file_content)',
            },
            ssh_host: {
              type: 'string',
              description:
                'SSH host (and optional port, e.g. host:2222) to pull the audio file from. Provide with ssh_path.',
            },
            ssh_path: {
              type: 'string',
              description: 'Remote file path on the SSH host. Provide with ssh_host.',
            },
            ssh_user: {
              type: 'string',
              description: 'Optional SSH username when pulling the file.',
            },
            ssh_port: {
              type: 'number',
              description: 'Optional SSH port when pulling the file.',
            },
            file_name: {
              type: 'string',
              description:
                'Optional name of the audio file, including the extension. Helpful when using URLs without a filename.',
            },
            output_dir: {
              type: 'string',
              description:
                'Optional directory path where the transcript will be saved as a markdown file. If provided, saves the transcript with a descriptive filename derived from the title.',
            },
          },
          required: [],
        },
      },
      {
        name: 'transcribe_audio_raw',
        description:
          'Transcribes an audio file using Google Gemini multimodal API. Returns a verbatim transcript with NO cleanup - includes filler words, false starts, and repetitions exactly as spoken. Includes metadata (title, description, timestamps). Supports MP3, WAV, OGG, FLAC, AAC, and AIFF formats. Use this when you need exact speech-to-text without editing.',
        inputSchema: {
          type: 'object',
          properties: {
            file_content: {
              type: 'string',
              description: 'Base64-encoded content of the audio file to transcribe (provide this OR file_url)',
            },
            file_url: {
              type: 'string',
              description: 'HTTP(S) URL where the audio file can be fetched (provide this OR file_content)',
            },
            ssh_host: {
              type: 'string',
              description:
                'SSH host (and optional port, e.g. host:2222) to pull the audio file from. Provide with ssh_path.',
            },
            ssh_path: {
              type: 'string',
              description: 'Remote file path on the SSH host. Provide with ssh_host.',
            },
            ssh_user: {
              type: 'string',
              description: 'Optional SSH username when pulling the file.',
            },
            ssh_port: {
              type: 'number',
              description: 'Optional SSH port when pulling the file.',
            },
            file_name: {
              type: 'string',
              description:
                'Optional name of the audio file, including the extension. Helpful when using URLs without a filename.',
            },
            output_dir: {
              type: 'string',
              description:
                'Optional directory path where the transcript will be saved as a markdown file. If provided, saves the transcript with a descriptive filename derived from the title.',
            },
          },
          required: [],
        },
      },
      {
        name: 'transcribe_audio_custom',
        description:
          'Transcribes an audio file using Google Gemini multimodal API with a user-defined custom prompt. Provides full control over how Gemini processes and formats the transcription. Use this when you need specific transcription instructions not covered by other tools.',
        inputSchema: {
          type: 'object',
          properties: {
            custom_prompt: {
              type: 'string',
              description:
                'The custom prompt/instructions to send to Gemini along with the audio. Should describe how to transcribe and format the content. The prompt should instruct Gemini to return JSON with at minimum a "transcript" field.',
            },
            file_content: {
              type: 'string',
              description: 'Base64-encoded content of the audio file to transcribe (provide this OR file_url)',
            },
            file_url: {
              type: 'string',
              description: 'HTTP(S) URL where the audio file can be fetched (provide this OR file_content)',
            },
            ssh_host: {
              type: 'string',
              description:
                'SSH host (and optional port, e.g. host:2222) to pull the audio file from. Provide with ssh_path.',
            },
            ssh_path: {
              type: 'string',
              description: 'Remote file path on the SSH host. Provide with ssh_host.',
            },
            ssh_user: {
              type: 'string',
              description: 'Optional SSH username when pulling the file.',
            },
            ssh_port: {
              type: 'number',
              description: 'Optional SSH port when pulling the file.',
            },
            file_name: {
              type: 'string',
              description:
                'Optional name of the audio file, including the extension. Helpful when using URLs without a filename.',
            },
            output_dir: {
              type: 'string',
              description:
                'Optional directory path where the transcript will be saved as a markdown file. If provided, saves the transcript with a descriptive filename derived from the title.',
            },
          },
          required: ['custom_prompt'],
        },
      },
      {
        name: 'transcribe_audio_format',
        description:
          'Transcribes an audio file and formats it according to a specified output format (e.g., "email", "to-do list", "meeting notes", "technical document", "blog post"). The tool intelligently constructs appropriate formatting instructions for Gemini. Use this when you want the transcription structured in a specific document format.',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              description:
                'The desired output format for the transcription. Examples: "email", "to-do list", "meeting notes", "technical document", "blog post", "executive summary", "letter", "report", "outline". Any format description is accepted.',
            },
            file_content: {
              type: 'string',
              description: 'Base64-encoded content of the audio file to transcribe (provide this OR file_url)',
            },
            file_url: {
              type: 'string',
              description: 'HTTP(S) URL where the audio file can be fetched (provide this OR file_content)',
            },
            ssh_host: {
              type: 'string',
              description:
                'SSH host (and optional port, e.g. host:2222) to pull the audio file from. Provide with ssh_path.',
            },
            ssh_path: {
              type: 'string',
              description: 'Remote file path on the SSH host. Provide with ssh_host.',
            },
            ssh_user: {
              type: 'string',
              description: 'Optional SSH username when pulling the file.',
            },
            ssh_port: {
              type: 'number',
              description: 'Optional SSH port when pulling the file.',
            },
            file_name: {
              type: 'string',
              description:
                'Optional name of the audio file, including the extension. Helpful when using URLs without a filename.',
            },
            output_dir: {
              type: 'string',
              description:
                'Optional directory path where the transcript will be saved as a markdown file. If provided, saves the transcript with a descriptive filename derived from the title.',
            },
          },
          required: ['format'],
        },
      },
    ],
  };
});

// Valid tool names
const VALID_TOOLS = [
  'transcribe_audio',
  'transcribe_audio_raw',
  'transcribe_audio_custom',
  'transcribe_audio_format',
] as const;

type ToolName = (typeof VALID_TOOLS)[number];

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!VALID_TOOLS.includes(name as ToolName)) {
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

  const typedArgs = args as {
    file_content?: string;
    file_url?: string;
    file_name?: string;
    output_dir?: string;
    ssh_host?: string;
    ssh_path?: string;
    ssh_user?: string;
    ssh_port?: number;
    custom_prompt?: string;
    format?: string;
  };
  const fileContent = typedArgs?.file_content;
  const fileUrl = typedArgs?.file_url;
  const fileName = typedArgs?.file_name;
  const outputDir = typedArgs?.output_dir;
  const sshHost = typedArgs?.ssh_host;
  const sshPath = typedArgs?.ssh_path;
  const sshUser = typedArgs?.ssh_user;
  const sshPort = typedArgs?.ssh_port;
  const userCustomPrompt = typedArgs?.custom_prompt;
  const format = typedArgs?.format;

  if (!fileContent && !fileUrl && !sshHost) {
    return {
      content: [
        {
          type: 'text',
          text: 'Missing required parameters: provide file_content (base64), file_url, or ssh_host + ssh_path',
        },
      ],
      isError: true,
    };
  }

  // Validate required parameters for specific tools
  if (name === 'transcribe_audio_custom' && !userCustomPrompt) {
    return {
      content: [
        {
          type: 'text',
          text: 'Missing required parameter: custom_prompt is required for transcribe_audio_custom',
        },
      ],
      isError: true,
    };
  }

  if (name === 'transcribe_audio_format' && !format) {
    return {
      content: [
        {
          type: 'text',
          text: 'Missing required parameter: format is required for transcribe_audio_format',
        },
      ],
      isError: true,
    };
  }

  try {
    // Determine the prompt based on tool name
    let customPrompt: string | undefined;
    if (name === 'transcribe_audio_raw') {
      customPrompt = RAW_TRANSCRIPTION_PROMPT;
    } else if (name === 'transcribe_audio_custom') {
      customPrompt = userCustomPrompt;
    } else if (name === 'transcribe_audio_format') {
      customPrompt = generateFormatPrompt(format!);
    }
    // transcribe_audio uses default prompt (undefined)

    const result = await transcribeAudio({
      fileContent,
      fileUrl,
      fileName,
      sshHost,
      sshPath,
      sshUser,
      sshPort,
      customPrompt,
    });

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
