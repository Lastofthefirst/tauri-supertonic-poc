import { createSignal, onCleanup } from "solid-js";

export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export interface UseAudioPlayerReturn {
  state: () => AudioPlayerState;
  decodeAudio: (base64: string) => Promise<AudioBuffer>;
  playBuffer: (buffer: AudioBuffer, onEnded?: () => void) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

// Use a persistent audio element for better background playback on mobile
let sharedAudioElement: HTMLAudioElement | null = null;

function getAudioElement(): HTMLAudioElement {
  if (!sharedAudioElement) {
    sharedAudioElement = new Audio();
    sharedAudioElement.preload = 'auto';
    // Keep audio element in DOM for better background behavior
    document.body.appendChild(sharedAudioElement);
  }
  return sharedAudioElement;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  let audioContext: AudioContext | null = null;
  let currentBlobUrl: string | null = null;
  let onEndedCallback: (() => void) | null = null;

  const [state, setState] = createSignal<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });

  function getContext(): AudioContext {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  // Decode base64 to AudioBuffer (for duration info and compatibility)
  async function decodeAudio(base64: string): Promise<AudioBuffer> {
    const ctx = getContext();

    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Store as blob for HTML5 audio playback
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));

    // Attach blob to buffer for later use
    (audioBuffer as any)._blob = blob;

    return audioBuffer;
  }

  function playBuffer(buffer: AudioBuffer, onEnded?: () => void): void {
    const audio = getAudioElement();

    // Clean up previous blob URL
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
    }

    // Get blob from buffer (attached during decode)
    const blob = (buffer as any)._blob as Blob;
    if (!blob) {
      console.error('No blob attached to buffer');
      return;
    }

    currentBlobUrl = URL.createObjectURL(blob);
    onEndedCallback = onEnded || null;

    // Remove old event listener and add new one
    audio.onended = () => {
      setState({
        isPlaying: false,
        currentTime: buffer.duration,
        duration: buffer.duration,
      });
      if (onEndedCallback) {
        onEndedCallback();
      }
    };

    audio.onerror = (e) => {
      console.error('Audio playback error:', e);
      setState({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
      });
    };

    audio.src = currentBlobUrl;
    audio.load();

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(e => {
        console.error('Play failed:', e);
      });
    }

    setState({
      isPlaying: true,
      currentTime: 0,
      duration: buffer.duration,
    });
  }

  function stop() {
    const audio = getAudioElement();
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;

    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }

    onEndedCallback = null;

    setState({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    });
  }

  function pause() {
    const audio = getAudioElement();
    audio.pause();

    setState(prev => ({
      ...prev,
      isPlaying: false,
      currentTime: audio.currentTime,
    }));
  }

  function resume() {
    const audio = getAudioElement();

    if (audio.src && audio.paused) {
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(e => console.error('Resume failed:', e));
      }

      setState(prev => ({
        ...prev,
        isPlaying: true,
      }));
    }
  }

  onCleanup(() => {
    stop();
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
  });

  return {
    state,
    decodeAudio,
    playBuffer,
    stop,
    pause,
    resume,
  };
}
