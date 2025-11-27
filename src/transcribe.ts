import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import * as fs from 'fs';
import { TranscriptionResponse } from './types.js';
import { TRANSCRIPTION_PROMPT } from './prompt.js';
import { prepareAudioFile, cleanupTempFile, AudioFileInfo } from './audio.js';

const MODEL_NAME = 'gemini-2.0-flash';

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

export async function transcribeAudio(filePath: string): Promise<TranscriptionResponse> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  let audioInfo: AudioFileInfo | null = null;
  let uploadedFileName: string | null = null;

  try {
    // Prepare audio file (validate and downsample if needed)
    audioInfo = await prepareAudioFile(filePath);

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

    // Generate content
    const result = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri!, uploadedFile.mimeType!),
        TRANSCRIPTION_PROMPT,
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
    // Cleanup temp file
    if (audioInfo) {
      cleanupTempFile(audioInfo);
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
