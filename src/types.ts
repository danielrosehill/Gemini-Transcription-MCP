export interface TranscriptionResponse {
  title: string;
  description: string;
  transcript: string;
  timestamp: string;
  timestamp_readable: string;
}

export interface TranscribeOptions {
  url: string;
}

// Formats that Gemini API natively accepts (no conversion needed)
// Source: https://ai.google.dev/gemini-api/docs/audio
export const GEMINI_NATIVE_FORMATS: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mp3',
  '.aiff': 'audio/aiff',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

// MIME types that Gemini natively accepts
export const GEMINI_NATIVE_MIMES = new Set([
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
]);

// Extended formats we accept and will convert to OGG/Opus for Gemini
// We accept ANY audio format - ffmpeg will handle the conversion
export const EXTENDED_FORMATS: Record<string, string> = {
  '.opus': 'audio/opus',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.wma': 'audio/x-ms-wma',
  '.amr': 'audio/amr',
  '.3gp': 'audio/3gpp',
  '.caf': 'audio/x-caf',
  '.spx': 'audio/ogg',  // Speex in OGG
};

// Combined: all formats we recognize (for MIME detection from filename)
export const SUPPORTED_FORMATS: Record<string, string> = {
  ...GEMINI_NATIVE_FORMATS,
  ...EXTENDED_FORMATS,
};

// Map MIME types to extensions for content-type detection
export const MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/wave': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/aac': '.aac',
  'audio/aiff': '.aiff',
  'audio/x-aiff': '.aiff',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/webm': '.webm',
  'audio/x-ms-wma': '.wma',
  'audio/amr': '.amr',
  'audio/3gpp': '.3gp',
  'audio/x-caf': '.caf',
};

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB absolute max
export const DOWNSAMPLE_THRESHOLD_BYTES = 15 * 1024 * 1024; // 15MB triggers downsampling
