#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { transcribeAudio, RAW_TRANSCRIPTION_PROMPT, generateFormatPrompt } from './transcribe.js';
import { listPresets, getPresetPrompt, wrapPresetForTranscription } from './presets.js';
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
    version: '0.8.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Common input properties shared across all transcription tools
const COMMON_INPUT_PROPERTIES = {
  model: {
    type: 'string',
    description: 'Model to use: "lite" for Gemini 3.1 Flash Lite (default, cost-efficient), "flash" for Gemini 3 Flash (more capable). Also accepts full OpenRouter model IDs.',
  },
  vad: {
    type: 'boolean',
    description: 'Enable Voice Activity Detection preprocessing. Strips silence and non-speech audio before transcription using Silero VAD. Useful for recordings with long pauses or background noise.',
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
    description: 'SSH host (and optional port, e.g. host:2222) to pull the audio file from. Provide with ssh_path.',
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
    description: 'Optional name of the audio file, including the extension. Helpful when using URLs without a filename.',
  },
  output_dir: {
    type: 'string',
    description: 'Optional directory path where the transcript will be saved as a markdown file. If provided, saves the transcript with a descriptive filename derived from the title.',
  },
};

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'transcribe_audio',
        description:
          'Transcribes an audio file using Gemini via OpenRouter. Returns a lightly edited transcript with filler words removed, verbal corrections applied, punctuation added, and paragraph breaks inserted. Large files are automatically compressed. Supports MP3, WAV, OGG, FLAC, AAC, AIFF, and many more formats (auto-converted). This is the recommended default tool.',
        inputSchema: {
          type: 'object',
          properties: { ...COMMON_INPUT_PROPERTIES },
          required: [],
        },
      },
      {
        name: 'transcribe_audio_raw',
        description:
          'Transcribes an audio file using Gemini via OpenRouter. Returns a verbatim transcript with NO cleanup - preserves filler words, false starts, and repetitions exactly as spoken. Use this when you need exact speech-to-text without any editing.',
        inputSchema: {
          type: 'object',
          properties: { ...COMMON_INPUT_PROPERTIES },
          required: [],
        },
      },
      {
        name: 'transcribe_audio_custom',
        description:
          'Transcribes an audio file using Gemini via OpenRouter with a user-defined custom prompt. Provides full control over how the model processes and formats the transcription. Use this when you need specific transcription instructions not covered by other tools.',
        inputSchema: {
          type: 'object',
          properties: {
            custom_prompt: {
              type: 'string',
              description:
                'The custom prompt/instructions to send along with the audio. Should describe how to transcribe and format the content. The prompt should instruct the model to return JSON with at minimum a "transcript" field.',
            },
            ...COMMON_INPUT_PROPERTIES,
          },
          required: ['custom_prompt'],
        },
      },
      {
        name: 'transcribe_audio_format',
        description:
          'Transcribes an audio file and formats the output as a specific document type. Accepts any freeform format description. Use this when you want a quick ad-hoc format without browsing presets. For curated, high-quality formatting, use transcribe_with_preset instead.',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              description:
                'The desired output format. Examples: "email", "to-do list", "meeting notes", "technical document", "blog post", "executive summary", "letter", "report", "outline", "development specification". Any description is accepted.',
            },
            ...COMMON_INPUT_PROPERTIES,
          },
          required: ['format'],
        },
      },
      {
        name: 'transcribe_with_preset',
        description:
          'Transcribes audio and transforms the output using a curated preset. Presets are divided into two categories:\n\n' +
          '**Styles** (modify tone/voice): formal, informal, academic, business, journalistic, assertive, flamboyant, minimalist, dejargonizer, simplify, victorian, shakespearean, etc.\n\n' +
          '**Formats** (restructure into document type): blog_outline, business_email, meeting_minutes, note_to_self, to_do_list, tech_documentation, feature_request, bug_report, cover_letter, resume, newsletter, development_prompt, etc.\n\n' +
          'Use list_transcription_presets to browse all 200+ available presets with category filters.',
        inputSchema: {
          type: 'object',
          properties: {
            preset: {
              type: 'string',
              description: 'Name of the preset to apply (e.g. "blog_outline", "business_email", "note_to_self", "formal_tone", "dejargonizer"). Use underscores or spaces.',
            },
            ...COMMON_INPUT_PROPERTIES,
          },
          required: ['preset'],
        },
      },
      {
        name: 'list_transcription_presets',
        description:
          'Lists available transcription presets from the Text-Transformation-Prompt-Library. Each preset is categorized as either a "style" (modifies tone/voice without changing structure) or a "format" (restructures content into a specific document type). Use these with the transcribe_with_preset tool.',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['style', 'format'],
              description: 'Filter by category: "style" for tone/voice presets, "format" for document structure presets. Omit for all.',
            },
            filter: {
              type: 'string',
              description: 'Optional text filter to search preset names (e.g. "email", "blog", "meeting")',
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
  'transcribe_with_preset',
  'list_transcription_presets',
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

  // Handle list_transcription_presets separately (no audio input needed)
  if (name === 'list_transcription_presets') {
    try {
      const listArgs = args as { filter?: string; category?: 'style' | 'format' };
      let presets = await listPresets();
      if (listArgs?.category) {
        presets = presets.filter(p => p.category === listArgs.category);
      }
      if (listArgs?.filter) {
        const f = listArgs.filter.toLowerCase();
        presets = presets.filter(p => p.slug.includes(f) || p.displayName.includes(f));
      }
      const grouped = {
        count: presets.length,
        styles: presets.filter(p => p.category === 'style').map(p => p.slug),
        formats: presets.filter(p => p.category === 'format').map(p => p.slug),
      };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(grouped, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Failed to list presets: ${message}` }],
        isError: true,
      };
    }
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
    model?: string;
    preset?: string;
    vad?: boolean;
  };

  const fileContent = typedArgs?.file_content;
  const fileUrl = typedArgs?.file_url;
  const fileName = typedArgs?.file_name;
  const outputDir = typedArgs?.output_dir;
  const sshHost = typedArgs?.ssh_host;
  const sshPath = typedArgs?.ssh_path;
  const sshUser = typedArgs?.ssh_user;
  const sshPort = typedArgs?.ssh_port;
  const model = typedArgs?.model;
  const vad = typedArgs?.vad;

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
  if (name === 'transcribe_audio_custom' && !typedArgs?.custom_prompt) {
    return {
      content: [
        { type: 'text', text: 'Missing required parameter: custom_prompt is required for transcribe_audio_custom' },
      ],
      isError: true,
    };
  }

  if (name === 'transcribe_audio_format' && !typedArgs?.format) {
    return {
      content: [
        { type: 'text', text: 'Missing required parameter: format is required for transcribe_audio_format' },
      ],
      isError: true,
    };
  }

  if (name === 'transcribe_with_preset' && !typedArgs?.preset) {
    return {
      content: [
        { type: 'text', text: 'Missing required parameter: preset is required for transcribe_with_preset' },
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
      customPrompt = typedArgs.custom_prompt;
    } else if (name === 'transcribe_audio_format') {
      customPrompt = generateFormatPrompt(typedArgs.format!);
    } else if (name === 'transcribe_with_preset') {
      const presetData = await getPresetPrompt(typedArgs.preset!);
      customPrompt = wrapPresetForTranscription(presetData.prompt);
    }
    // transcribe_audio uses default prompt

    const result = await transcribeAudio({
      fileContent,
      fileUrl,
      fileName,
      sshHost,
      sshPath,
      sshUser,
      sshPort,
      customPrompt,
      model,
      vad,
    });

    // If output_dir is provided (or DEFAULT_OUTPUT_DIR is set), save the transcript as a markdown file
    const effectiveOutputDir = outputDir || DEFAULT_OUTPUT_DIR;
    let savedFilePath: string | undefined;
    if (effectiveOutputDir) {
      const slug = slugify(result.title || 'transcript');
      const filename = `${slug}.md`;
      savedFilePath = path.join(effectiveOutputDir, filename);

      const markdownContent = `# ${result.title}

> ${result.description}

*Transcribed: ${result.timestamp_readable}*

---

${result.transcript}
`;

      if (!fs.existsSync(effectiveOutputDir)) {
        fs.mkdirSync(effectiveOutputDir, { recursive: true });
      }

      fs.writeFileSync(savedFilePath, markdownContent, 'utf-8');
    }

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

// Parse command line arguments for transport mode
function getTransportMode(): { mode: 'stdio' | 'http'; port?: number } {
  const args = process.argv.slice(2);

  const httpIndex = args.indexOf('--http');
  if (httpIndex !== -1) {
    const portArg = args[httpIndex + 1];
    const port = portArg && !portArg.startsWith('-') ? parseInt(portArg, 10) : 3000;
    return { mode: 'http', port: isNaN(port) ? 3000 : port };
  }

  if (process.env.MCP_TRANSPORT === 'http') {
    const port = parseInt(process.env.MCP_PORT || '3000', 10);
    return { mode: 'http', port: isNaN(port) ? 3000 : port };
  }

  return { mode: 'stdio' };
}

async function main() {
  const { mode, port } = getTransportMode();

  if (mode === 'http') {
    const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', server: 'gemini-transcription-mcp' }));
        return;
      }

      if (req.url === '/mcp' || req.url === '/') {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        });

        await server.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    httpServer.listen(port, () => {
      console.error(`Gemini Transcription MCP server running on http://0.0.0.0:${port}`);
      console.error(`MCP endpoint: http://0.0.0.0:${port}/mcp`);
      console.error(`Health check: http://0.0.0.0:${port}/health`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Gemini Transcription MCP server running on stdio');
  }
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
