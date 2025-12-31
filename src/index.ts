#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { transcribeAudio, transcribeAudioCompressed, transcribeAudioWithVad, RAW_TRANSCRIPTION_PROMPT, DEVSPEC_PROMPT, generateFormatPrompt } from './transcribe.js';
import * as fs from 'fs';
import * as path from 'path';

// Default output directory for transcripts
// Uses TRANSCRIPT_OUTPUT_DIR env var if set, otherwise defaults to ./transcripts (relative to cwd)
// Set TRANSCRIPT_OUTPUT_DIR="" to disable auto-save
const DEFAULT_OUTPUT_DIR = process.env.TRANSCRIPT_OUTPUT_DIR !== undefined
  ? process.env.TRANSCRIPT_OUTPUT_DIR || undefined  // Empty string = disabled
  : './transcripts';  // Default when env var not set

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
    version: '0.6.0',
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
          'Transcribes an audio file using Google Gemini multimodal API. Returns a lightly edited transcript with filler words removed, verbal corrections applied, punctuation added, and paragraph breaks inserted. Includes metadata (title, description, timestamps). Natively supports MP3, WAV, OGG, FLAC, AAC, and AIFF formats. Other formats (Opus, WebM, M4A, etc.) are automatically converted to OGG/Opus - prefer MP3 for manual conversions as it offers good compression with broad compatibility. This is the recommended tool for most use cases.',
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
      {
        name: 'transcribe_audio_large',
        description:
          'Transcribes a large audio file by first compressing it to Opus format. Use this for files that exceed Gemini\'s 20MB limit. The tool converts audio to mono 16kHz Opus at 24kbps, which typically reduces a 1-hour WAV from ~600MB to ~10MB while preserving speech quality.',
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
        name: 'transcribe_audio_devspec',
        description:
          'Transcribes an audio file containing a project description and formats it as a Development Specification for AI coding agents. Use this when the user is dictating requirements, features, or technical ideas that should be structured for implementation. Outputs a spec with sections: Project Overview, Requirements, Technical Constraints, Architecture Notes, User Stories, API Definitions, Success Criteria, and Open Questions.',
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
        name: 'transcribe_audio_vad',
        description:
          'Transcribes an audio file with Voice Activity Detection (VAD) preprocessing using Silero VAD. This aggressively removes silence and non-speech audio before transcription, reducing file size and potentially improving transcription quality. Best for recordings with significant pauses, background noise, or long silences. Supports both edited (default) and raw transcription modes via the raw parameter. Supports all audio formats.',
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
            raw: {
              type: 'boolean',
              description:
                'If true, returns a verbatim transcript preserving filler words and false starts. If false (default), returns a lightly edited transcript.',
            },
          },
          required: [],
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
  'transcribe_audio_large',
  'transcribe_audio_devspec',
  'transcribe_audio_vad',
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
    raw?: boolean;
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
  const rawMode = typedArgs?.raw;

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
    } else if (name === 'transcribe_audio_devspec') {
      customPrompt = DEVSPEC_PROMPT;
    } else if (name === 'transcribe_audio_vad' && rawMode) {
      customPrompt = RAW_TRANSCRIPTION_PROMPT;
    }
    // transcribe_audio, transcribe_audio_large, and transcribe_audio_vad (without raw) use default prompt

    // Select the appropriate transcription function
    let transcribeFn: typeof transcribeAudio;
    if (name === 'transcribe_audio_large') {
      transcribeFn = transcribeAudioCompressed;
    } else if (name === 'transcribe_audio_vad') {
      transcribeFn = transcribeAudioWithVad;
    } else {
      transcribeFn = transcribeAudio;
    }

    const result = await transcribeFn({
      fileContent,
      fileUrl,
      fileName,
      sshHost,
      sshPath,
      sshUser,
      sshPort,
      customPrompt,
    });

    // If output_dir is provided (or DEFAULT_OUTPUT_DIR is set), save the transcript as a markdown file
    const effectiveOutputDir = outputDir || DEFAULT_OUTPUT_DIR;
    let savedFilePath: string | undefined;
    if (effectiveOutputDir) {
      const slug = slugify(result.title || 'transcript');
      const filename = `${slug}.md`;
      savedFilePath = path.join(effectiveOutputDir, filename);

      // Create markdown content
      const markdownContent = `# ${result.title}

> ${result.description}

*Transcribed: ${result.timestamp_readable}*

---

${result.transcript}
`;

      // Ensure directory exists
      if (!fs.existsSync(effectiveOutputDir)) {
        fs.mkdirSync(effectiveOutputDir, { recursive: true });
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
