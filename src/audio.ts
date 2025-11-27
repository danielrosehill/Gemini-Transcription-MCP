import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SUPPORTED_FORMATS, MAX_FILE_SIZE_BYTES, DOWNSAMPLE_THRESHOLD_BYTES } from './types.js';

export interface AudioFileInfo {
  originalPath: string;
  processedPath: string;
  mimeType: string;
  needsCleanup: boolean;
}

export function validateAudioFile(filePath: string): void {
  // Check file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Check extension
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_FORMATS[ext]) {
    const supported = Object.keys(SUPPORTED_FORMATS).join(', ');
    throw new Error(`Unsupported audio format: ${ext}. Supported formats: ${supported}`);
  }

  // Check file size
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum size is 100MB.`);
  }
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_FORMATS[ext] || 'audio/mpeg';
}

export async function prepareAudioFile(filePath: string): Promise<AudioFileInfo> {
  validateAudioFile(filePath);

  const stats = fs.statSync(filePath);
  const mimeType = getMimeType(filePath);

  // If file is small enough, use as-is
  if (stats.size <= DOWNSAMPLE_THRESHOLD_BYTES) {
    return {
      originalPath: filePath,
      processedPath: filePath,
      mimeType,
      needsCleanup: false,
    };
  }

  // Downsample large files
  const processedPath = await downsampleAudio(filePath);
  return {
    originalPath: filePath,
    processedPath,
    mimeType: 'audio/mp3',
    needsCleanup: true,
  };
}

async function downsampleAudio(inputPath: string): Promise<string> {
  const tempDir = os.tmpdir();
  const outputPath = path.join(tempDir, `gemini_transcribe_${Date.now()}.mp3`);

  return new Promise((resolve, reject) => {
    // ffmpeg command to downsample:
    // - Convert to mono (-ac 1)
    // - Sample rate 16kHz (-ar 16000)
    // - Low bitrate MP3 (-b:a 32k)
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ac', '1',
      '-ar', '16000',
      '-b:a', '32k',
      '-y', // Overwrite output
      outputPath,
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run ffmpeg. Is it installed? Error: ${err.message}`));
    });
  });
}

export function cleanupTempFile(fileInfo: AudioFileInfo): void {
  if (fileInfo.needsCleanup && fs.existsSync(fileInfo.processedPath)) {
    try {
      fs.unlinkSync(fileInfo.processedPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
