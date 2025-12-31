import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { NonRealTimeVAD } from 'avr-vad';
import {
  SUPPORTED_FORMATS,
  MIME_TO_EXT,
  GEMINI_NATIVE_MIMES,
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

/**
 * Determine the detected MIME type from file name or content-type header.
 * This returns what we think the file IS, not necessarily what Gemini accepts.
 */
export function getMimeTypeFromNameOrType(fileName?: string, contentType?: string | null): string {
  // Normalize common content-type variations
  const mimeNormalization: Record<string, string> = {
    'audio/wave': 'audio/wav',
    'audio/x-wav': 'audio/wav',
    'audio/x-flac': 'audio/flac',
    'audio/x-aiff': 'audio/aiff',
    'audio/x-m4a': 'audio/mp4',
  };

  if (contentType) {
    const normalized = mimeNormalization[contentType] || contentType;
    if (MIME_TO_EXT[normalized] || MIME_TO_EXT[contentType]) {
      return normalized;
    }
  }

  if (fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (SUPPORTED_FORMATS[ext]) {
      return SUPPORTED_FORMATS[ext];
    }
  }

  // Default - will trigger conversion
  return 'audio/unknown';
}

/**
 * Check if a MIME type is natively supported by Gemini API.
 */
export function isGeminiNativeFormat(mimeType: string): boolean {
  return GEMINI_NATIVE_MIMES.has(mimeType);
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
  const detectedMime = getMimeTypeFromNameOrType(fileName, null);

  if (stats.size > MAX_FILE_SIZE_BYTES) {
    fs.unlinkSync(tempPath);
    throw new Error(`File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum size is 100MB.`);
  }

  // If format is not natively supported by Gemini, convert to OGG/Opus
  if (!isGeminiNativeFormat(detectedMime)) {
    const processedPath = await convertToOggOpus(tempPath);
    return {
      processedPath,
      mimeType: 'audio/ogg',
      needsCleanup: true,
      originalPath: tempPath,
    };
  }

  // Native format - check if downsampling needed for size
  if (stats.size <= DOWNSAMPLE_THRESHOLD_BYTES) {
    return {
      processedPath: tempPath,
      mimeType: detectedMime,
      needsCleanup: true,
      originalPath: tempPath,
    };
  }

  // Large native file - downsample to OGG/Opus (most space efficient)
  const processedPath = await convertToOggOpus(tempPath);
  return {
    processedPath,
    mimeType: 'audio/ogg',
    needsCleanup: true,
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

  const detectedMime = getMimeTypeFromNameOrType(params.fileName || resolvedFileName, null);

  // If format is not natively supported by Gemini, convert to OGG/Opus
  if (!isGeminiNativeFormat(detectedMime)) {
    const processedPath = await convertToOggOpus(tempPath);
    return {
      processedPath,
      mimeType: 'audio/ogg',
      needsCleanup: true,
      originalPath: tempPath,
    };
  }

  // Native format - check if downsampling needed for size
  if (stats.size <= DOWNSAMPLE_THRESHOLD_BYTES) {
    return {
      processedPath: tempPath,
      mimeType: detectedMime,
      needsCleanup: true,
      originalPath: tempPath,
    };
  }

  // Large native file - convert to OGG/Opus
  const processedPath = await convertToOggOpus(tempPath);
  return {
    processedPath,
    mimeType: 'audio/ogg',
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
  const resolvedFileName =
    fileName ||
    path.basename(new URL(fileUrl).pathname || '') ||
    `downloaded_${Date.now()}.audio`;
  const detectedMime = getMimeTypeFromNameOrType(resolvedFileName, contentType);
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

  // If format is not natively supported by Gemini, convert to OGG/Opus
  if (!isGeminiNativeFormat(detectedMime)) {
    const processedPath = await convertToOggOpus(tempPath);
    return {
      processedPath,
      mimeType: 'audio/ogg',
      needsCleanup: true,
      originalPath: tempPath,
    };
  }

  // Native format - check if downsampling needed for size
  if (stats.size <= DOWNSAMPLE_THRESHOLD_BYTES) {
    return {
      processedPath: tempPath,
      mimeType: detectedMime,
      needsCleanup: true,
      originalPath: tempPath,
    };
  }

  // Large native file - convert to OGG/Opus
  const processedPath = await convertToOggOpus(tempPath);
  return {
    processedPath,
    mimeType: 'audio/ogg',
    needsCleanup: true,
    originalPath: tempPath,
  };
}

/**
 * Convert any audio format to OGG/Opus - the most space-efficient format for speech.
 * Optimized for transcription: mono, 16kHz, 24kbps Opus.
 * This typically reduces a 1-hour WAV from ~600MB to ~10MB.
 *
 * Used for:
 * 1. Converting non-Gemini-native formats (opus, webm, m4a, etc.) to audio/ogg
 * 2. Compressing large native files to reduce upload size
 */
async function convertToOggOpus(inputPath: string): Promise<string> {
  const tempDir = os.tmpdir();
  // Use .ogg extension - Gemini accepts audio/ogg which can contain Opus codec
  const outputPath = path.join(tempDir, `gemini_converted_${Date.now()}.ogg`);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ac', '1',             // mono
      '-ar', '16000',         // 16kHz sample rate (sufficient for speech)
      '-c:a', 'libopus',      // Opus codec
      '-b:a', '24k',          // 24kbps (very efficient for speech)
      '-application', 'voip', // optimize for speech
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

// Keep the exported version for the large file tool
export { convertToOggOpus as compressAudioToOpus };

/**
 * Prepare audio input with forced Opus compression for large files.
 * Always compresses regardless of file size.
 */
export async function prepareAudioInputCompressed(params: PrepareAudioParams): Promise<PreparedAudioInfo> {
  // First get the file to disk using normal preparation (but we'll compress afterward)
  let tempPath: string;
  let mimeType: string;

  if (params.fileContent) {
    const buffer = Buffer.from(params.fileContent, 'base64');
    const tempDir = os.tmpdir();
    tempPath = path.join(tempDir, `gemini_upload_${Date.now()}_${params.fileName || 'audio'}`);
    fs.writeFileSync(tempPath, buffer);
    mimeType = getMimeTypeFromNameOrType(params.fileName, null);
  } else if (params.fileUrl) {
    const response = await fetch(params.fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file from URL (${response.status} ${response.statusText})`);
    }
    const contentType = response.headers.get('content-type');
    mimeType = getMimeTypeFromNameOrType(params.fileName, contentType);
    const resolvedFileName = params.fileName || path.basename(new URL(params.fileUrl).pathname || '') || `downloaded_${Date.now()}.audio`;
    const tempDir = os.tmpdir();
    tempPath = path.join(tempDir, `gemini_remote_${Date.now()}_${resolvedFileName}`);
    const writeStream = fs.createWriteStream(tempPath);
    if (!response.body) {
      throw new Error('No response body when downloading file');
    }
    await pipeline(response.body as unknown as NodeJS.ReadableStream, writeStream);
  } else if (params.sshHost && params.sshPath) {
    const tempDir = os.tmpdir();
    const resolvedFileName = params.fileName || path.basename(params.sshPath) || `ssh_audio_${Date.now()}`;
    tempPath = path.join(tempDir, `gemini_ssh_${Date.now()}_${resolvedFileName}`);
    const remoteSpec = `${params.sshUser ? `${params.sshUser}@` : ''}${params.sshHost}:${params.sshPath}`;
    const scpArgs: string[] = [];
    if (params.sshPort) {
      scpArgs.push('-P', String(params.sshPort));
    }
    scpArgs.push(remoteSpec, tempPath);
    await new Promise<void>((resolve, reject) => {
      const scp = spawn('scp', scpArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      scp.stderr.on('data', (data) => { stderr += data.toString(); });
      scp.on('error', (err) => { reject(new Error(`Failed to run scp: ${err.message}`)); });
      scp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`scp failed with code ${code}: ${stderr}`));
      });
    });
    mimeType = getMimeTypeFromNameOrType(params.fileName, null);
  } else {
    throw new Error('Provide one of: fileContent, fileUrl, or sshHost+sshPath');
  }

  // Always compress to Opus
  const processedPath = await convertToOggOpus(tempPath);
  return {
    processedPath,
    mimeType: 'audio/ogg', // Opus in OGG container
    needsCleanup: true,
    originalPath: tempPath,
  };
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

/**
 * Convert audio to 16kHz mono PCM WAV for VAD processing.
 * Returns path to the WAV file.
 */
async function convertToVadFormat(inputPath: string): Promise<string> {
  const tempDir = os.tmpdir();
  const outputPath = path.join(tempDir, `vad_input_${Date.now()}.wav`);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ac', '1',           // mono
      '-ar', '16000',       // 16kHz (required by Silero VAD)
      '-f', 'wav',          // WAV format
      '-acodec', 'pcm_s16le', // 16-bit PCM
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
        reject(new Error(`ffmpeg VAD conversion failed with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run ffmpeg for VAD conversion: ${err.message}`));
    });
  });
}

/**
 * Read WAV file and return Float32Array of samples.
 * Assumes 16-bit PCM mono WAV at 16kHz.
 */
function readWavAsFloat32(wavPath: string): { samples: Float32Array; sampleRate: number } {
  const buffer = fs.readFileSync(wavPath);

  // Parse WAV header to find data chunk
  // WAV format: RIFF header (12 bytes) + fmt chunk + data chunk
  let offset = 12; // Skip RIFF header
  let dataStart = 0;
  let dataSize = 0;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === 'data') {
      dataStart = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
    // Ensure word alignment
    if (chunkSize % 2 !== 0) offset += 1;
  }

  if (dataStart === 0) {
    throw new Error('Could not find data chunk in WAV file');
  }

  // Convert 16-bit PCM to Float32
  const numSamples = dataSize / 2; // 16-bit = 2 bytes per sample
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const int16 = buffer.readInt16LE(dataStart + i * 2);
    samples[i] = int16 / 32768.0; // Normalize to -1.0 to 1.0
  }

  return { samples, sampleRate: 16000 };
}

/**
 * Write Float32Array samples to a WAV file.
 * Outputs 16-bit PCM mono WAV at 16kHz.
 */
function writeFloat32AsWav(samples: Float32Array, outputPath: string, sampleRate: number = 16000): void {
  const numSamples = samples.length;
  const byteRate = sampleRate * 2; // 16-bit mono
  const dataSize = numSamples * 2;
  const fileSize = 44 + dataSize - 8;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20);  // audio format (PCM)
  buffer.writeUInt16LE(1, 22);  // num channels (mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(2, 32);  // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write samples
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16, 44 + i * 2);
  }

  fs.writeFileSync(outputPath, buffer);
}

/**
 * Get the path to the ONNX model file bundled with avr-vad.
 * Resolves to the actual file path in node_modules.
 */
function getModelPath(): string {
  // Try to find the model in the avr-vad package
  const possiblePaths = [
    path.join(__dirname, '..', 'node_modules', 'avr-vad', 'dist', 'silero_vad_legacy.onnx'),
    path.join(__dirname, '..', 'node_modules', 'avr-vad', 'silero_vad_legacy.onnx'),
    path.resolve('node_modules', 'avr-vad', 'dist', 'silero_vad_legacy.onnx'),
    path.resolve('node_modules', 'avr-vad', 'silero_vad_legacy.onnx'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Fallback: try to resolve from avr-vad package location
  try {
    const avrVadPath = require.resolve('avr-vad');
    const avrVadDir = path.dirname(avrVadPath);
    const modelPath = path.join(avrVadDir, 'silero_vad_legacy.onnx');
    if (fs.existsSync(modelPath)) {
      return modelPath;
    }
    // Also check dist folder
    const distModelPath = path.join(avrVadDir, 'dist', 'silero_vad_legacy.onnx');
    if (fs.existsSync(distModelPath)) {
      return distModelPath;
    }
  } catch {
    // Ignore resolution errors
  }

  throw new Error('Could not find Silero VAD model file. Ensure avr-vad is properly installed.');
}

/**
 * Process audio through Voice Activity Detection (VAD) to remove silence.
 * Uses Silero VAD model via avr-vad to identify speech segments,
 * then concatenates them into a cleaned audio file.
 *
 * This is an aggressive preprocessing step that removes non-speech audio,
 * reducing file size and improving transcription quality.
 */
export async function processWithVad(inputPath: string): Promise<string> {
  const tempDir = os.tmpdir();

  // Step 1: Convert to 16kHz mono WAV for VAD
  const vadInputPath = await convertToVadFormat(inputPath);

  try {
    // Step 2: Read audio samples
    const { samples, sampleRate } = readWavAsFloat32(vadInputPath);

    // Step 3: Run VAD to detect speech segments
    // Provide a custom model fetcher that reads from the file system
    const modelPath = getModelPath();
    const vad = await NonRealTimeVAD.new({
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      minSpeechFrames: 3,
      preSpeechPadFrames: 5,
      redemptionFrames: 8,
      modelURL: modelPath,
      modelFetcher: async (path: string) => {
        const buffer = fs.readFileSync(path);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      },
    });

    const speechSegments: Float32Array[] = [];

    for await (const segment of vad.run(samples, sampleRate)) {
      speechSegments.push(segment.audio);
    }

    if (speechSegments.length === 0) {
      // No speech detected - return original file
      fs.unlinkSync(vadInputPath);
      return inputPath;
    }

    // Step 4: Concatenate speech segments with small gaps
    const gapSamples = Math.floor(sampleRate * 0.1); // 100ms gap between segments
    const gapBuffer = new Float32Array(gapSamples).fill(0);

    const totalLength = speechSegments.reduce((sum, seg) => sum + seg.length, 0)
      + (speechSegments.length - 1) * gapSamples;
    const concatenated = new Float32Array(totalLength);

    let offset = 0;
    for (let i = 0; i < speechSegments.length; i++) {
      concatenated.set(speechSegments[i], offset);
      offset += speechSegments[i].length;

      if (i < speechSegments.length - 1) {
        concatenated.set(gapBuffer, offset);
        offset += gapSamples;
      }
    }

    // Step 5: Write cleaned audio to WAV
    const vadOutputPath = path.join(tempDir, `vad_cleaned_${Date.now()}.wav`);
    writeFloat32AsWav(concatenated, vadOutputPath, sampleRate);

    // Cleanup intermediate file
    fs.unlinkSync(vadInputPath);

    return vadOutputPath;
  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(vadInputPath)) {
      fs.unlinkSync(vadInputPath);
    }
    throw error;
  }
}

/**
 * Prepare audio input with VAD preprocessing.
 * First runs the audio through Voice Activity Detection to remove silence,
 * then compresses to OGG/Opus for efficient upload to Gemini.
 */
export async function prepareAudioInputWithVad(params: PrepareAudioParams): Promise<PreparedAudioInfo> {
  // First get the file to disk
  let tempPath: string;

  if (params.fileContent) {
    const buffer = Buffer.from(params.fileContent, 'base64');
    const tempDir = os.tmpdir();
    tempPath = path.join(tempDir, `gemini_vad_upload_${Date.now()}_${params.fileName || 'audio'}`);
    fs.writeFileSync(tempPath, buffer);
  } else if (params.fileUrl) {
    const response = await fetch(params.fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file from URL (${response.status} ${response.statusText})`);
    }
    const resolvedFileName = params.fileName || path.basename(new URL(params.fileUrl).pathname || '') || `downloaded_${Date.now()}.audio`;
    const tempDir = os.tmpdir();
    tempPath = path.join(tempDir, `gemini_vad_remote_${Date.now()}_${resolvedFileName}`);
    const writeStream = fs.createWriteStream(tempPath);
    if (!response.body) {
      throw new Error('No response body when downloading file');
    }
    await pipeline(response.body as unknown as NodeJS.ReadableStream, writeStream);
  } else if (params.sshHost && params.sshPath) {
    const tempDir = os.tmpdir();
    const resolvedFileName = params.fileName || path.basename(params.sshPath) || `ssh_audio_${Date.now()}`;
    tempPath = path.join(tempDir, `gemini_vad_ssh_${Date.now()}_${resolvedFileName}`);
    const remoteSpec = `${params.sshUser ? `${params.sshUser}@` : ''}${params.sshHost}:${params.sshPath}`;
    const scpArgs: string[] = [];
    if (params.sshPort) {
      scpArgs.push('-P', String(params.sshPort));
    }
    scpArgs.push(remoteSpec, tempPath);
    await new Promise<void>((resolve, reject) => {
      const scp = spawn('scp', scpArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      scp.stderr.on('data', (data) => { stderr += data.toString(); });
      scp.on('error', (err) => { reject(new Error(`Failed to run scp: ${err.message}`)); });
      scp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`scp failed with code ${code}: ${stderr}`));
      });
    });
  } else {
    throw new Error('Provide one of: fileContent, fileUrl, or sshHost+sshPath');
  }

  // Process through VAD to remove silence
  const vadProcessedPath = await processWithVad(tempPath);

  // Convert to OGG/Opus for efficient upload
  const processedPath = await convertToOggOpus(vadProcessedPath);

  // Cleanup intermediate files
  if (vadProcessedPath !== tempPath && fs.existsSync(vadProcessedPath)) {
    fs.unlinkSync(vadProcessedPath);
  }

  return {
    processedPath,
    mimeType: 'audio/ogg',
    needsCleanup: true,
    originalPath: tempPath,
  };
}
