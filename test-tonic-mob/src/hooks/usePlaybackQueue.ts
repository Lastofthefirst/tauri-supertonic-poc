import { batch, onCleanup } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import {
  play as musicPlay,
  pause as musicPause,
  resume as musicResume,
  stop as musicStop,
  getState as getMusicState,
  onMediaAction,
  type MediaAction,
} from "tauri-plugin-music-notification-api";
import type {
  Sentence,
  PlaybackState,
  TTSSettings,
  SynthesizeChunkRequest,
  SynthesizeChunkResponse
} from "../types/audio";
import { useAudioPlayer } from "./useAudioPlayer";

export interface UsePlaybackQueueOptions {
  queueAhead?: number;
  settings: () => TTSSettings;
}

export interface UsePlaybackQueueReturn {
  state: PlaybackState;
  loadText: (text: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  skipTo: (index: number) => void;
  skipForward: () => void;
  skipBack: () => void;
  isReady: () => boolean;
}

// Check if we're on Android (music notification plugin only works there)
const isAndroid = navigator.userAgent.toLowerCase().includes('android');

export function usePlaybackQueue(options: UsePlaybackQueueOptions): UsePlaybackQueueReturn {
  const { queueAhead = 3, settings } = options;
  const audioPlayer = useAudioPlayer(); // Fallback for desktop

  const [state, setState] = createStore<PlaybackState>({
    sentences: [],
    currentIndex: -1,
    isPlaying: false,
    isPaused: false,
    isLoading: false,
    queueAhead,
  });

  // Track which sentences are currently being generated
  const generatingSet = new Set<number>();

  // Generation counter to handle stale callbacks
  let playbackGeneration = 0;

  // Polling interval for music state (Android)
  let pollInterval: number | null = null;

  // Track last advance time to debounce
  let lastAdvanceTime = 0;
  const ADVANCE_DEBOUNCE_MS = 300;

  // Load text and split into sentences
  async function loadText(text: string): Promise<void> {
    if (!text.trim()) return;

    setState("isLoading", true);
    stopPlayback();
    generatingSet.clear();
    playbackGeneration++;

    // Clear audio cache on new text load
    try {
      await invoke("clear_audio_cache");
    } catch (e) {
      console.warn("Failed to clear audio cache:", e);
    }

    try {
      const sentences = await invoke<string[]>("split_text_to_sentences", {
        text,
        language: settings().language,
      });

      const sentenceObjects: Sentence[] = sentences.map((s, i) => ({
        id: i,
        text: s,
        status: 'pending',
        audioBlob: null,
        audioBuffer: null,
        audioFileUrl: null,
        duration: null,
        error: null,
      }));

      batch(() => {
        setState("sentences", sentenceObjects);
        setState("currentIndex", -1);
        setState("isPlaying", false);
        setState("isPaused", false);
        setState("isLoading", false);
      });
    } catch (error) {
      console.error("Failed to split text:", error);
      setState("isLoading", false);
    }
  }

  // Generate audio for a specific sentence
  async function generateSentence(index: number): Promise<boolean> {
    if (index < 0 || index >= state.sentences.length) return false;
    if (generatingSet.has(index)) return false;

    const sentence = state.sentences[index];
    if (sentence.status !== 'pending') return sentence.status === 'ready';

    generatingSet.add(index);
    setState("sentences", index, "status", "generating");

    try {
      const request: SynthesizeChunkRequest = {
        text: sentence.text,
        sentence_index: index,
        language: settings().language,
        voice_style: settings().voiceStyle,
        total_step: settings().totalStep,
        speed: settings().speed,
      };

      const response = await invoke<SynthesizeChunkResponse>("synthesize_chunk", { req: request });

      if (response.success && response.audio_base64) {
        // Save audio to file for music notification plugin (Android)
        let audioFileUrl: string | null = null;
        if (isAndroid) {
          try {
            audioFileUrl = await invoke<string>("save_audio_to_file", {
              audioBase64: response.audio_base64,
              sentenceIndex: index,
            });
          } catch (e) {
            console.error("Failed to save audio file:", e);
          }
        }

        // Also decode for desktop playback and duration info
        const audioBuffer = await audioPlayer.decodeAudio(response.audio_base64);

        setState("sentences", index, produce((s) => {
          s.status = 'ready';
          s.audioBuffer = audioBuffer;
          s.audioFileUrl = audioFileUrl;
          s.duration = response.duration || audioBuffer.duration;
          s.error = null;
        }));

        generatingSet.delete(index);
        return true;
      } else {
        setState("sentences", index, produce((s) => {
          s.status = 'error';
          s.error = response.error || 'Unknown error';
        }));
        generatingSet.delete(index);
        return false;
      }
    } catch (error) {
      console.error(`Failed to generate sentence ${index}:`, error);
      setState("sentences", index, produce((s) => {
        s.status = 'error';
        s.error = String(error);
      }));
      generatingSet.delete(index);
      return false;
    }
  }

  // Pre-generate upcoming sentences
  function triggerPreGeneration(fromIndex: number): void {
    const endIdx = Math.min(fromIndex + queueAhead + 1, state.sentences.length);

    for (let i = fromIndex; i < endIdx; i++) {
      const sentence = state.sentences[i];
      if (sentence && sentence.status === 'pending' && !generatingSet.has(i)) {
        generateSentence(i);
      }
    }
  }

  // Start polling music state for track end detection (Android)
  function startMusicStatePolling(generation: number) {
    if (pollInterval) {
      clearInterval(pollInterval);
    }

    let isAdvancing = false; // Prevent concurrent advances

    pollInterval = setInterval(async () => {
      if (generation !== playbackGeneration) {
        if (pollInterval) clearInterval(pollInterval);
        return;
      }

      // Skip if already advancing
      if (isAdvancing) return;

      try {
        const musicState = await getMusicState();

        // Check if playback finished (not playing and was playing before)
        if (!musicState.isPlaying && state.isPlaying && !state.isPaused) {
          // Debounce rapid advances
          const now = Date.now();
          if (now - lastAdvanceTime < ADVANCE_DEBOUNCE_MS) {
            return;
          }

          isAdvancing = true;
          lastAdvanceTime = now;

          // Track ended, advance to next
          const nextIndex = state.currentIndex + 1;
          if (nextIndex < state.sentences.length) {
            setState("sentences", state.currentIndex, "status", "played");
            setState("currentIndex", nextIndex);
            await playSentenceAtIndex(nextIndex, generation);
          } else {
            // Finished all sentences
            setState("sentences", state.currentIndex, "status", "played");
            batch(() => {
              setState("isPlaying", false);
              setState("currentIndex", -1);
            });
            if (pollInterval) clearInterval(pollInterval);
          }

          isAdvancing = false;
        }
      } catch (e) {
        isAdvancing = false;
        // Ignore errors during polling
      }
    }, 200) as unknown as number; // Faster polling for smoother transitions
  }

  // Track which sentence is currently being played to prevent duplicates
  let currentlyPlayingIndex = -1;

  // Play a specific sentence by index
  async function playSentenceAtIndex(index: number, generation: number): Promise<void> {
    // Check if this request is still valid
    if (generation !== playbackGeneration) {
      console.log(`Ignoring stale playback request for index ${index} (gen ${generation} vs ${playbackGeneration})`);
      return;
    }

    if (index < 0 || index >= state.sentences.length) return;
    if (!state.isPlaying || state.isPaused) return;

    // Prevent playing the same sentence twice
    if (currentlyPlayingIndex === index) {
      console.log(`Already playing sentence ${index}, skipping duplicate request`);
      return;
    }

    const sentence = state.sentences[index];

    // If sentence needs generation, wait for it
    if (sentence.status === 'pending') {
      await generateSentence(index);
      // Re-check generation after async operation
      if (generation !== playbackGeneration) return;
      return playSentenceAtIndex(index, generation);
    }

    if (sentence.status === 'generating') {
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 100));
      if (generation !== playbackGeneration) return;
      return playSentenceAtIndex(index, generation);
    }

    if (sentence.status === 'error') {
      // Skip errored sentences
      const nextIndex = index + 1;
      if (nextIndex < state.sentences.length) {
        setState("currentIndex", nextIndex);
        return playSentenceAtIndex(nextIndex, generation);
      } else {
        setState("isPlaying", false);
        return;
      }
    }

    if (sentence.status !== 'ready') {
      return;
    }

    // Final generation check before playing
    if (generation !== playbackGeneration) return;

    // Mark as playing and track current index
    currentlyPlayingIndex = index;
    setState("sentences", index, "status", "playing");

    // Start pre-generation
    triggerPreGeneration(index);

    // Play using appropriate method
    if (isAndroid && sentence.audioFileUrl) {
      // Use music notification plugin on Android
      try {
        await musicPlay({
          url: sentence.audioFileUrl,
          title: `Sentence ${index + 1}`,
          artist: "TTS Reader",
          album: `${state.sentences.length} sentences`,
        });

        // Start polling for track end
        startMusicStatePolling(generation);
      } catch (e) {
        console.error("Music notification play failed:", e);
        // Fall back to HTML5 audio
        playWithHtml5Audio(index, generation);
      }
    } else {
      // Use HTML5 audio on desktop
      playWithHtml5Audio(index, generation);
    }
  }

  // Fallback playback using HTML5 audio
  function playWithHtml5Audio(index: number, generation: number) {
    const sentence = state.sentences[index];
    if (!sentence.audioBuffer) return;

    audioPlayer.playBuffer(sentence.audioBuffer, () => {
      // Only process if this callback is still relevant
      if (generation !== playbackGeneration) {
        console.log(`Ignoring stale onended callback (gen ${generation} vs ${playbackGeneration})`);
        return;
      }

      setState("sentences", index, "status", "played");

      // Auto-advance
      const nextIndex = index + 1;
      if (nextIndex < state.sentences.length && state.isPlaying && !state.isPaused) {
        setState("currentIndex", nextIndex);
        playSentenceAtIndex(nextIndex, generation);
      } else if (nextIndex >= state.sentences.length) {
        batch(() => {
          setState("isPlaying", false);
          setState("currentIndex", -1);
        });
      }
    });
  }

  function play(): void {
    if (state.sentences.length === 0) return;

    if (state.isPaused) {
      setState("isPaused", false);
      if (isAndroid) {
        musicResume().catch(console.error);
        startMusicStatePolling(playbackGeneration);
      } else {
        audioPlayer.resume();
      }
      return;
    }

    const startIndex = state.currentIndex < 0 ? 0 : state.currentIndex;

    // Increment generation to invalidate any pending callbacks
    playbackGeneration++;

    batch(() => {
      setState("isPlaying", true);
      setState("isPaused", false);
      setState("currentIndex", startIndex);
    });

    playSentenceAtIndex(startIndex, playbackGeneration);
  }

  function pause(): void {
    setState("isPaused", true);
    if (isAndroid) {
      musicPause().catch(console.error);
      if (pollInterval) clearInterval(pollInterval);
    } else {
      audioPlayer.pause();
    }
  }

  function stopPlayback(): void {
    // Increment generation to invalidate callbacks
    playbackGeneration++;
    currentlyPlayingIndex = -1;

    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    if (isAndroid) {
      musicStop().catch(console.error);
    }
    audioPlayer.stop();

    batch(() => {
      setState("isPlaying", false);
      setState("isPaused", false);
      setState("currentIndex", -1);

      // Reset sentence statuses
      state.sentences.forEach((s, i) => {
        if (s.status === 'playing' || s.status === 'played') {
          setState("sentences", i, "status", s.audioBuffer ? "ready" : "pending");
        }
      });
    });
  }

  function stop(): void {
    stopPlayback();
  }

  function skipTo(index: number): void {
    if (index < 0 || index >= state.sentences.length) return;

    console.log(`skipTo(${index}) from currentIndex=${state.currentIndex}`);

    // Increment generation to invalidate any pending callbacks
    playbackGeneration++;
    currentlyPlayingIndex = -1; // Reset so we can play the new index

    // Stop current playback
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (isAndroid) {
      musicStop().catch(console.error);
    }
    audioPlayer.stop();

    // Update previous sentence status
    const prevIndex = state.currentIndex;
    if (prevIndex >= 0 && prevIndex < state.sentences.length) {
      const prevStatus = state.sentences[prevIndex].status;
      if (prevStatus === 'playing') {
        setState("sentences", prevIndex, "status",
          state.sentences[prevIndex].audioBuffer ? "ready" : "pending");
      }
    }

    // Set new index
    setState("currentIndex", index);

    // If playing, start the new sentence
    if (state.isPlaying && !state.isPaused) {
      playSentenceAtIndex(index, playbackGeneration);
    }
  }

  function skipForward(): void {
    const current = state.currentIndex;
    const maxIndex = state.sentences.length - 1;

    if (current < 0) {
      skipTo(0);
    } else if (current < maxIndex) {
      skipTo(current + 1);
    }
  }

  function skipBack(): void {
    const current = state.currentIndex;

    if (current > 0) {
      skipTo(current - 1);
    } else if (current < 0 && state.sentences.length > 0) {
      skipTo(0);
    }
  }

  function isReady(): boolean {
    return state.sentences.length > 0 && !state.isLoading;
  }

  // Handle media action events from notification buttons (Android)
  function handleMediaAction(action: MediaAction): void {
    console.log(`Media action received: ${action}`);
    switch (action) {
      case 'play':
        if (state.isPaused) {
          play();
        }
        break;
      case 'pause':
        if (state.isPlaying && !state.isPaused) {
          pause();
        }
        break;
      case 'next':
        skipForward();
        break;
      case 'previous':
        skipBack();
        break;
      case 'stop':
        stop();
        break;
    }
  }

  // Set up media action listener on Android
  let unlistenMediaAction: (() => void) | null = null;
  let unlistenDebug: (() => void) | null = null;
  if (isAndroid) {
    // Debug: listen to ALL events to see what's coming through
    import('@tauri-apps/api/event').then(({ listen }) => {
      // Listen to the specific event
      listen('plugin:music-notification://media-action', (event) => {
        console.log('DEBUG: Received plugin:music-notification://media-action event:', JSON.stringify(event));
      });
      // Also try without plugin: prefix
      listen('music-notification://media-action', (event) => {
        console.log('DEBUG: Received music-notification://media-action event:', JSON.stringify(event));
      });
      // Also try just the event name
      listen('media-action', (event) => {
        console.log('DEBUG: Received media-action event:', JSON.stringify(event));
      });
    });

    onMediaAction(handleMediaAction).then(unlisten => {
      unlistenMediaAction = unlisten;
      console.log('DEBUG: Media action listener set up successfully');
    }).catch(err => {
      console.error("Failed to set up media action listener:", err);
    });
  }

  onCleanup(() => {
    playbackGeneration++;
    if (pollInterval) {
      clearInterval(pollInterval);
    }
    if (unlistenMediaAction) {
      unlistenMediaAction();
    }
    if (isAndroid) {
      musicStop().catch(() => {});
    }
    audioPlayer.stop();
    generatingSet.clear();
  });

  return {
    state,
    loadText,
    play,
    pause,
    stop,
    skipTo,
    skipForward,
    skipBack,
    isReady,
  };
}
