import { Component } from "solid-js";

interface PlayerControlsProps {
  isPlaying: boolean;
  isPaused: boolean;
  canPlay: boolean;
  canSkipBack: boolean;
  canSkipForward: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
}

export const PlayerControls: Component<PlayerControlsProps> = (props) => {
  return (
    <div class="player-controls">
      <button
        class="control-btn skip-btn"
        onClick={props.onSkipBack}
        disabled={!props.canSkipBack}
        title="Previous sentence"
      >
        ⏮
      </button>

      {props.isPlaying && !props.isPaused ? (
        <button
          class="control-btn play-pause-btn"
          onClick={props.onPause}
          title="Pause"
        >
          ⏸
        </button>
      ) : (
        <button
          class="control-btn play-pause-btn"
          onClick={props.onPlay}
          disabled={!props.canPlay}
          title="Play"
        >
          ▶
        </button>
      )}

      <button
        class="control-btn skip-btn"
        onClick={props.onSkipForward}
        disabled={!props.canSkipForward}
        title="Next sentence"
      >
        ⏭
      </button>

      <button
        class="control-btn stop-btn"
        onClick={props.onStop}
        disabled={!props.isPlaying && !props.isPaused}
        title="Stop"
      >
        ⏹
      </button>
    </div>
  );
};
