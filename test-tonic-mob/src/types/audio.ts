// Types for the TTS queue system

export type SentenceStatus = 'pending' | 'generating' | 'ready' | 'playing' | 'played' | 'error';

export interface Sentence {
  id: number;
  text: string;
  status: SentenceStatus;
  audioBlob: Blob | null;
  audioBuffer: AudioBuffer | null;
  audioFileUrl: string | null; // file:// URL for music notification plugin
  duration: number | null;
  error: string | null;
}

export interface PlaybackState {
  sentences: Sentence[];
  currentIndex: number;
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  queueAhead: number; // How many sentences to pre-generate (default: 3)
}

export interface TTSSettings {
  language: string;
  voiceStyle: string;
  totalStep: number;
  speed: number;
}

// Backend request/response types
export interface SynthesizeChunkRequest {
  text: string;
  sentence_index: number;
  language: string;
  voice_style: string;
  total_step: number;
  speed: number;
}

export interface SynthesizeChunkResponse {
  success: boolean;
  sentence_index: number;
  audio_base64?: string;
  duration?: number;
  error?: string;
}

// Audio player types
export interface ScheduledAudio {
  source: AudioBufferSourceNode;
  startTime: number;
  endTime: number;
  sentenceIndex: number;
}
