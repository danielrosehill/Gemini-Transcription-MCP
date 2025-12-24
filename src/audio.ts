import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import {
  SUPPORTED_FORMATS,
  MIME_TO_EXT,
  MAX_FILE_SIZE_BYTES,
  DOWNSAMPLE_THRESHOLD_BYTES,
} from './types.js';

export interface PreparedAudioInfo {
  processedPath: string;
  mimeType: string;
  needsCleanup: boolean;
  originalPath: string;
}

export interface PrepareAudioParams {
  fileContent?: string;
  fileUrl?: string;
  fileName?: string;
  sshHost?: string;
  sshPath?: string;
  sshUser?: string;
  sshPort?: number;
}

export function getMimeTypeFromNameOrType(fileName?: string, contentType?: string | null): string {
  if (contentType && MIME_TO_EXT[contentType]) {
    return contentType;
  }
  if (fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (SUPPORTED_FORMATS[ext]) {
      return SUPPORTED_FORMATS[ext];
    }
  }
  return 'audio/mpeg';
}

export async function prepareAudioInput(params: PrepareAudioParams): Promise<PreparedAudioInfo> {
  if (params.fileContent) {
    return prepareAudioFromContent(params.fileContent, params.fileName);
  }

  if (params.fileUrl) {
    return prepareAudioFromUrl(params.fileUrl, params.fileName);
  }

  if (params.sshHost && params.sshPath) {
    return prepareAudioFromSsh(params);
  }

  throw new Error('Provide one of: fileContent, fileUrl, or sshHost+sshPath');
}

export async function prepareAudioFromContent(
  fileContent: string,
  fileName?: string
): Promise<PreparedAudioInfo> {
  const buffer = Buffer.from(fileContent, 'base64');
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `gemini_upload_${Date.now()}_${fileName || 'audio'}`);
  fs.writeFileSync(tempPath, buffer);

  const stats = fs.statSync(tempPath);
  const mimeType = getMimeTypeFromNameOrType(fileName, null);

  if (stats.size > MAX_FILE_SIZE_BYTES) {
    fs.unlinkSync(tempPath);
    throw new Error(`File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum size is 100MB.`);
  }

  if (stats.size <= DOWNSAMPLE_THRESHOLD_BYTES) {
    return {
      processedPath: tempPath,
      mimeType,
      needsCleanup: true, // The temp file always needs cleanup
      originalPath: tempPath,
    };
  }

  const processedPath = await downsampleAudio(tempPath);
  return {
    processedPath,
    mimeType: 'audio/mp3',
    needsCleanup: true, // Both original and downsampled files need cleanup
    originalPath: tempPath,
  };
}

export async function prepareAudioFromSsh(params: PrepareAudioParams): Promise<PreparedAudioInfo> {
  if (!params.sshHost || !params.sshPath) {
    throw new Error('sshHost and sshPath are required for SSH transfer');
  }

  const tempDir = os.tmpdir();
  const resolvedFileName = params.fileName || path.basename(params.sshPath) || `ssh_audio_${Date.now()}`;
  const tempPath = path.join(tempDir, `gemini_ssh_${Date.now()}_${resolvedFileName}`);

  const remoteSpec = `${params.sshUser ? `${params.sshUser}@` : ''}${params.sshHost}:${params.sshPath}`;
  const scpArgs: string[] = [];
  if (params.sshPort) {
    scpArgs.push('-P', String(params.sshPort));
  }
  scpArgs.push(remoteSpec, tempPath);

  await new Promise<void>((resolve, reject) => {
    const scp = spawn('scp', scpArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    scp.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    scp.on('error', (err) => {
      reject(new Error(`Failed to run scp: ${err.message}`));
    });
    scp.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`scp failed with code ${code}: ${stderr}`));
      }
    });
  });

  const stats = fs.statSync(tempPath);
  if (stats.size > MAX_FILE_SIZE_BYTES) {
    fs.unlinkSync(tempPath);
    throw new Error(
      `File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum size is 100MB.`
    );
  }

  const mimeType = getMimeTypeFromNameOrType(params.fileName, null);

  if (stats.size <= DOWNSAMPLE_THRESHOLD_BYTES) {
    return {
      processedPath: tempPath,
      mimeType,
      needsCleanup: true,
      originalPath: tempPath,
    };
  }

  const processedPath = await downsampleAudio(tempPath);
  return {
    processedPath,
    mimeType: 'audio/mp3',
    needsCleanup: true,
    originalPath: tempPath,
  };
}

export async function prepareAudioFromUrl(fileUrl: string, fileName?: string): Promise<PreparedAudioInfo> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file from URL (${response.status} ${response.statusText})`);
  }

  const contentType = response.headers.get('content-type');
  const mimeType = getMimeTypeFromNameOrType(fileName, contentType);
  const resolvedFileName =
    fileName ||
    path.basename(new URL(fileUrl).pathname || '') ||
    `downloaded_${Date.now()}.audio`;
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `gemini_remote_${Date.now()}_${resolvedFileName}`);

  const writeStream = fs.createWriteStream(tempPath);
  // Stream to disk to avoid buffering large files in memory
  if (!response.body) {
    throw new Error('No response body when downloading file');
  }
  await pipeline(response.body as unknown as NodeJS.ReadableStream, writeStream);

  const stats = fs.statSync(tempPath);
  if (stats.size > MAX_FILE_SIZE_BYTES) {
    fs.unlinkSync(tempPath);
    throw new Error(
      `File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum size is 100MB.`
    );
  }

  if (stats.size <= DOWNSAMPLE_THRESHOLD_BYTES) {
    return {
      processedPath: tempPath,
      mimeType,
      needsCleanup: true,
      originalPath: tempPath,
    };
  }

  const processedPath = await downsampleAudio(tempPath);
  return {
    processedPath,
    mimeType: 'audio/mp3',
    needsCleanup: true,
    originalPath: tempPath,
  };
}

async function downsampleAudio(inputPath: string): Promise<string> {
  const tempDir = os.tmpdir();
  const outputPath = path.join(tempDir, `gemini_transcribe_${Date.now()}.mp3`);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ac', '1',
      '-ar', '16000',
      '-b:a', '32k',
      '-y',
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

export function cleanupTempFiles(fileInfo: PreparedAudioInfo): void {
  if (fileInfo.needsCleanup) {
    if (fs.existsSync(fileInfo.processedPath)) {
      try {
        fs.unlinkSync(fileInfo.processedPath);
      } catch {}
    }
    // If the processed path is different from the original uploaded temp file, clean that too
    if (fileInfo.originalPath !== fileInfo.processedPath && fs.existsSync(fileInfo.originalPath)) {
      try {
        fs.unlinkSync(fileInfo.originalPath);
      } catch {}
    }
  }
}
