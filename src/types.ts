export interface TranscriptionResponse {
  title: string;
  description: string;
  transcript: string;
  timestamp: string;
  timestamp_readable: string;
}

export interface TranscribeOptions {
  filePath: string;
}

export const SUPPORTED_FORMATS: Record<string, string> = {
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.aiff': 'audio/aiff',
  '.m4a': 'audio/mp4',
};

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB absolute max
export const DOWNSAMPLE_THRESHOLD_BYTES = 15 * 1024 * 1024; // 15MB triggers downsampling
