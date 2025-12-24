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

// Supported formats - used for validating downloaded files
export const SUPPORTED_FORMATS: Record<string, string> = {
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.aiff': 'audio/aiff',
  '.m4a': 'audio/mp4',
};

// Also map MIME types to extensions for content-type detection
export const MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/wave': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/flac': '.flac',
  'audio/aac': '.aac',
  'audio/aiff': '.aiff',
  'audio/x-aiff': '.aiff',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
};

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB absolute max
export const DOWNSAMPLE_THRESHOLD_BYTES = 15 * 1024 * 1024; // 15MB triggers downsampling
