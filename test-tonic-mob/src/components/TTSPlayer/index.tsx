import { Component, createSignal, Show } from "solid-js";
import type { TTSSettings } from "../../types/audio";
import { usePlaybackQueue } from "../../hooks/usePlaybackQueue";
import { PlayerControls } from "./PlayerControls";
import { SentenceList } from "./SentenceList";
import "./TTSPlayer.css";

interface TTSPlayerProps {
  settings: TTSSettings;
  initialText?: string;
}

export const TTSPlayer: Component<TTSPlayerProps> = (props) => {
  const [inputText, setInputText] = createSignal(props.initialText || "");

  const queue = usePlaybackQueue({
    queueAhead: 3,
    settings: () => props.settings,
  });

  const handleLoadText = async () => {
    const text = inputText().trim();
    if (text) {
      await queue.loadText(text);
    }
  };

  const totalSentences = () => queue.state.sentences.length;
  const completedSentences = () =>
    queue.state.sentences.filter(s => s.status === 'played').length;
  const readySentences = () =>
    queue.state.sentences.filter(s => s.status === 'ready' || s.status === 'played').length;

  return (
    <div class="tts-player">
      <div class="player-input-section">
        <textarea
          class="player-textarea"
          value={inputText()}
          onInput={(e) => setInputText(e.currentTarget.value)}
          placeholder="Enter text to read aloud. The text will be split into sentences and played sequentially."
          rows={6}
        />
        <button
          class="load-btn"
          onClick={handleLoadText}
          disabled={queue.state.isLoading || !inputText().trim()}
        >
          {queue.state.isLoading ? "Loading..." : "Load Text"}
        </button>
      </div>

      <Show when={queue.state.sentences.length > 0}>
        <div class="player-status-bar">
          <span class="status-text">
            {queue.state.isPlaying
              ? queue.state.isPaused
                ? "Paused"
                : `Playing sentence ${queue.state.currentIndex + 1} of ${totalSentences()}`
              : `${totalSentences()} sentences ready`}
          </span>
          <span class="progress-text">
            {readySentences()}/{totalSentences()} generated
          </span>
        </div>

        <PlayerControls
          isPlaying={queue.state.isPlaying}
          isPaused={queue.state.isPaused}
          canPlay={queue.isReady()}
          canSkipBack={queue.state.currentIndex > 0}
          canSkipForward={queue.state.currentIndex < totalSentences() - 1}
          onPlay={queue.play}
          onPause={queue.pause}
          onStop={queue.stop}
          onSkipBack={queue.skipBack}
          onSkipForward={queue.skipForward}
        />

        <SentenceList
          sentences={queue.state.sentences}
          currentIndex={queue.state.currentIndex}
          onSentenceClick={queue.skipTo}
        />

        <div class="player-progress">
          <div class="progress-bar">
            <div
              class="progress-fill"
              style={{ width: `${(completedSentences() / totalSentences()) * 100}%` }}
            />
            <div
              class="progress-generated"
              style={{ width: `${(readySentences() / totalSentences()) * 100}%` }}
            />
          </div>
        </div>
      </Show>
    </div>
  );
};

export default TTSPlayer;
