import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import * as fs from 'fs';
import { TranscriptionResponse } from './types.js';
import { TRANSCRIPTION_PROMPT, RAW_TRANSCRIPTION_PROMPT, DEVSPEC_PROMPT, generateFormatPrompt } from './prompt.js';

export { TRANSCRIPTION_PROMPT, RAW_TRANSCRIPTION_PROMPT, DEVSPEC_PROMPT, generateFormatPrompt };
import {
  prepareAudioInput,
  prepareAudioInputCompressed,
  prepareAudioInputWithVad,
  cleanupTempFiles,
  PreparedAudioInfo,
  PrepareAudioParams,
} from './audio.js';

// Supported Gemini models for transcription
const SUPPORTED_MODELS: Record<string, string> = {
  '1': 'gemini-flash-latest',                  // Gemini Flash Latest - dynamic endpoint
  '2': 'gemini-2.5-flash-preview-05-20',       // Gemini 2.5 Flash Preview
  '3': 'gemini-2.5-flash-lite-preview-06-17',  // Gemini 2.5 Flash Lite (economic)
  '4': 'gemini-3-flash-preview',               // Gemini 3 Flash Preview (newest)
};

const DEFAULT_MODEL = 'gemini-flash-latest';

function getModelName(): string {
  const modelEnv = process.env.GEMINI_MODEL;
  if (!modelEnv) {
    return DEFAULT_MODEL;
  }
  // Check if it's a shorthand number (1, 2, 3)
  if (SUPPORTED_MODELS[modelEnv]) {
    return SUPPORTED_MODELS[modelEnv];
  }
  // Otherwise use the value directly (allows custom model names)
  return modelEnv;
}

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
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

async function waitForFileProcessing(ai: GoogleGenAI, fileName: string): Promise<void> {
  let file = await ai.files.get({ name: fileName });

  while (file.state === 'PROCESSING') {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    file = await ai.files.get({ name: fileName });
  }

  if (file.state === 'FAILED') {
    throw new Error('File processing failed in Gemini');
  }
}

function parseJsonResponse(text: string): Partial<TranscriptionResponse> {
  // Try to parse the response as JSON
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
    // If JSON parsing fails, return the text as transcript
    return {
      title: 'Voice Note',
      description: 'Transcribed voice note.',
      transcript: text,
    };
  }
}

export interface TranscribeInput extends PrepareAudioParams {
  customPrompt?: string;
}

export async function transcribeAudio(
  input: TranscribeInput
): Promise<TranscriptionResponse> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  let audioInfo: PreparedAudioInfo | null = null;
  let uploadedFileName: string | null = null;

  try {
    if (!input.fileContent && !input.fileUrl && !input.sshHost) {
      throw new Error('Provide either fileContent (base64), fileUrl, or sshHost+sshPath for transcription');
    }

    // Prepare audio file from base64 content or remote URL
    audioInfo = await prepareAudioInput({
      fileContent: input.fileContent,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      sshHost: input.sshHost,
      sshPath: input.sshPath,
      sshUser: input.sshUser,
      sshPort: input.sshPort,
    });

    // Read file and create blob for upload
    const fileBuffer = fs.readFileSync(audioInfo.processedPath);
    const fileBlob = new Blob([fileBuffer], { type: audioInfo.mimeType });

    // Upload to Gemini
    const uploadResult = await ai.files.upload({
      file: fileBlob,
      config: {
        mimeType: audioInfo.mimeType,
        displayName: `transcription_${Date.now()}`,
      },
    });

    uploadedFileName = uploadResult.name!;

    // Wait for file to be processed
    await waitForFileProcessing(ai, uploadedFileName);

    // Get the file again to ensure we have the URI
    const uploadedFile = await ai.files.get({ name: uploadedFileName });

    // Use custom prompt if provided, otherwise use the default transcription prompt
    const promptToUse = input.customPrompt ?? TRANSCRIPTION_PROMPT;

    // Generate content
    const result = await ai.models.generateContent({
      model: getModelName(),
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri!, uploadedFile.mimeType!),
        promptToUse,
      ]),
    });

    const text = result.text;
    if (!text) {
      throw new Error('No text response from Gemini');
    }

    // Parse the JSON response
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
    // Cleanup temp files
    if (audioInfo) {
      cleanupTempFiles(audioInfo);
    }
    // Delete uploaded file from Gemini
    if (uploadedFileName) {
      try {
        await ai.files.delete({ name: uploadedFileName });
      } catch {
        // Ignore deletion errors
      }
    }
  }
}

/**
 * Transcribe audio with forced Opus compression.
 * Use this for large files that exceed Gemini's 20MB limit.
 */
export async function transcribeAudioCompressed(
  input: TranscribeInput
): Promise<TranscriptionResponse> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  let audioInfo: PreparedAudioInfo | null = null;
  let uploadedFileName: string | null = null;

  try {
    if (!input.fileContent && !input.fileUrl && !input.sshHost) {
      throw new Error('Provide either fileContent (base64), fileUrl, or sshHost+sshPath for transcription');
    }

    // Prepare audio with forced Opus compression
    audioInfo = await prepareAudioInputCompressed({
      fileContent: input.fileContent,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      sshHost: input.sshHost,
      sshPath: input.sshPath,
      sshUser: input.sshUser,
      sshPort: input.sshPort,
    });

    // Read file and create blob for upload
    const fileBuffer = fs.readFileSync(audioInfo.processedPath);
    const fileBlob = new Blob([fileBuffer], { type: audioInfo.mimeType });

    // Upload to Gemini
    const uploadResult = await ai.files.upload({
      file: fileBlob,
      config: {
        mimeType: audioInfo.mimeType,
        displayName: `transcription_compressed_${Date.now()}`,
      },
    });

    uploadedFileName = uploadResult.name!;

    // Wait for file to be processed
    await waitForFileProcessing(ai, uploadedFileName);

    // Get the file again to ensure we have the URI
    const uploadedFile = await ai.files.get({ name: uploadedFileName });

    // Use custom prompt if provided, otherwise use the default transcription prompt
    const promptToUse = input.customPrompt ?? TRANSCRIPTION_PROMPT;

    // Generate content
    const result = await ai.models.generateContent({
      model: getModelName(),
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri!, uploadedFile.mimeType!),
        promptToUse,
      ]),
    });

    const text = result.text;
    if (!text) {
      throw new Error('No text response from Gemini');
    }

    // Parse the JSON response
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
    // Cleanup temp files
    if (audioInfo) {
      cleanupTempFiles(audioInfo);
    }
    // Delete uploaded file from Gemini
    if (uploadedFileName) {
      try {
        await ai.files.delete({ name: uploadedFileName });
      } catch {
        // Ignore deletion errors
      }
    }
  }
}

/**
 * Transcribe audio with Voice Activity Detection (VAD) preprocessing.
 * Uses Silero VAD to strip silence and non-speech audio before transcription.
 * This is an aggressive preprocessing option that can improve transcription
 * quality and reduce file size for audio with significant silence/pauses.
 */
export async function transcribeAudioWithVad(
  input: TranscribeInput
): Promise<TranscriptionResponse> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  let audioInfo: PreparedAudioInfo | null = null;
  let uploadedFileName: string | null = null;

  try {
    if (!input.fileContent && !input.fileUrl && !input.sshHost) {
      throw new Error('Provide either fileContent (base64), fileUrl, or sshHost+sshPath for transcription');
    }

    // Prepare audio with VAD preprocessing (strips silence)
    audioInfo = await prepareAudioInputWithVad({
      fileContent: input.fileContent,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      sshHost: input.sshHost,
      sshPath: input.sshPath,
      sshUser: input.sshUser,
      sshPort: input.sshPort,
    });

    // Read file and create blob for upload
    const fileBuffer = fs.readFileSync(audioInfo.processedPath);
    const fileBlob = new Blob([fileBuffer], { type: audioInfo.mimeType });

    // Upload to Gemini
    const uploadResult = await ai.files.upload({
      file: fileBlob,
      config: {
        mimeType: audioInfo.mimeType,
        displayName: `transcription_vad_${Date.now()}`,
      },
    });

    uploadedFileName = uploadResult.name!;

    // Wait for file to be processed
    await waitForFileProcessing(ai, uploadedFileName);

    // Get the file again to ensure we have the URI
    const uploadedFile = await ai.files.get({ name: uploadedFileName });

    // Use custom prompt if provided, otherwise use the default transcription prompt
    const promptToUse = input.customPrompt ?? TRANSCRIPTION_PROMPT;

    // Generate content
    const result = await ai.models.generateContent({
      model: getModelName(),
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri!, uploadedFile.mimeType!),
        promptToUse,
      ]),
    });

    const text = result.text;
    if (!text) {
      throw new Error('No text response from Gemini');
    }

    // Parse the JSON response
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
    // Cleanup temp files
    if (audioInfo) {
      cleanupTempFiles(audioInfo);
    }
    // Delete uploaded file from Gemini
    if (uploadedFileName) {
      try {
        await ai.files.delete({ name: uploadedFileName });
      } catch {
        // Ignore deletion errors
      }
    }
  }
}
