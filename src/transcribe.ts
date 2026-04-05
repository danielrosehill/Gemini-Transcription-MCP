import * as fs from 'fs';
import { TranscriptionResponse, DOWNSAMPLE_THRESHOLD_BYTES } from './types.js';
import { TRANSCRIPTION_PROMPT, RAW_TRANSCRIPTION_PROMPT, generateFormatPrompt } from './prompt.js';

export { TRANSCRIPTION_PROMPT, RAW_TRANSCRIPTION_PROMPT, generateFormatPrompt };
import {
  prepareAudioInput,
  prepareAudioInputCompressed,
  prepareAudioInputWithVad,
  cleanupTempFiles,
  PreparedAudioInfo,
  PrepareAudioParams,
} from './audio.js';

// Supported models via OpenRouter
const SUPPORTED_MODELS: Record<string, string> = {
  'lite': 'google/gemini-3.1-flash-lite-preview',
  'flash': 'google/gemini-3-flash-preview',
  '1': 'google/gemini-3.1-flash-lite-preview',
  '2': 'google/gemini-3-flash-preview',
};

const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-preview';

function getModelName(modelOverride?: string): string {
  const modelInput = modelOverride || process.env.OPENROUTER_MODEL;
  if (!modelInput) {
    return DEFAULT_MODEL;
  }
  if (SUPPORTED_MODELS[modelInput]) {
    return SUPPORTED_MODELS[modelInput];
  }
  // Allow custom model names to be passed through
  return modelInput;
}

function getApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }
  return apiKey;
}

function formatTimestamp(): { iso: string; readable: string } {
  const now = new Date();
  const iso = now.toISOString();

  const day = now.getDate();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const readable = `${day} ${month} ${year} ${hours}:${minutes}`;

  return { iso, readable };
}

function parseJsonResponse(text: string): Partial<TranscriptionResponse> {
  let cleaned = text.trim();

  // Remove markdown code blocks if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      title: 'Voice Note',
      description: 'Transcribed voice note.',
      transcript: text,
    };
  }
}

async function callOpenRouter(
  audioBase64: string,
  mimeType: string,
  prompt: string,
  model: string,
): Promise<string> {
  const apiKey = getApiKey();
  const dataUrl = `data:${mimeType};base64,${audioBase64}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/danielrosehill/Gemini-Transcription-MCP',
      'X-Title': 'Gemini Transcription MCP',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('No text response from OpenRouter');
  }

  return text;
}

export interface TranscribeInput extends PrepareAudioParams {
  customPrompt?: string;
  model?: string;
  vad?: boolean;
}

export async function transcribeAudio(
  input: TranscribeInput
): Promise<TranscriptionResponse> {
  let audioInfo: PreparedAudioInfo | null = null;

  try {
    if (!input.fileContent && !input.fileUrl && !input.sshHost) {
      throw new Error('Provide either fileContent (base64), fileUrl, or sshHost+sshPath for transcription');
    }

    const prepareParams: PrepareAudioParams = {
      fileContent: input.fileContent,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      sshHost: input.sshHost,
      sshPath: input.sshPath,
      sshUser: input.sshUser,
      sshPort: input.sshPort,
    };

    // Pick pipeline: VAD if requested, otherwise standard
    if (input.vad) {
      audioInfo = await prepareAudioInputWithVad(prepareParams);
    } else {
      audioInfo = await prepareAudioInput(prepareParams);

      // Auto-compress if the prepared file is still too large
      const fileSize = fs.statSync(audioInfo.processedPath).size;
      if (fileSize > DOWNSAMPLE_THRESHOLD_BYTES) {
        cleanupTempFiles(audioInfo);
        audioInfo = await prepareAudioInputCompressed(prepareParams);
      }
    }

    const fileBuffer = fs.readFileSync(audioInfo.processedPath);
    const audioBase64 = fileBuffer.toString('base64');
    const promptToUse = input.customPrompt ?? TRANSCRIPTION_PROMPT;
    const model = getModelName(input.model);

    const text = await callOpenRouter(audioBase64, audioInfo.mimeType, promptToUse, model);

    const parsed = parseJsonResponse(text);
    const timestamps = formatTimestamp();

    return {
      title: parsed.title || 'Voice Note',
      description: parsed.description || 'Transcribed voice note.',
      transcript: parsed.transcript || text,
      timestamp: timestamps.iso,
      timestamp_readable: timestamps.readable,
    };
  } finally {
    if (audioInfo) {
      cleanupTempFiles(audioInfo);
    }
  }
}
