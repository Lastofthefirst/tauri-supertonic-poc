import { Component, For, Show, createEffect } from "solid-js";
import type { Sentence } from "../../types/audio";

interface SentenceListProps {
  sentences: Sentence[];
  currentIndex: number;
  onSentenceClick: (index: number) => void;
}

export const SentenceList: Component<SentenceListProps> = (props) => {
  let listRef: HTMLDivElement | undefined;

  // Auto-scroll to current sentence
  createEffect(() => {
    if (props.currentIndex >= 0 && listRef) {
      const currentElement = listRef.querySelector(`[data-index="${props.currentIndex}"]`);
      if (currentElement) {
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });

  const getStatusIcon = (status: Sentence['status']) => {
    switch (status) {
      case 'pending':
        return <span class="status-icon pending">○</span>;
      case 'generating':
        return <span class="status-icon generating">
          <span class="spinner"></span>
        </span>;
      case 'ready':
        return <span class="status-icon ready">●</span>;
      case 'playing':
        return <span class="status-icon playing">▶</span>;
      case 'played':
        return <span class="status-icon played">✓</span>;
      case 'error':
        return <span class="status-icon error">✗</span>;
      default:
        return null;
    }
  };

  return (
    <div class="sentence-list" ref={listRef}>
      <Show when={props.sentences.length === 0}>
        <div class="empty-message">
          Enter text above and click "Load Text" to begin
        </div>
      </Show>
      <For each={props.sentences}>
        {(sentence, index) => (
          <div
            class={`sentence-item ${sentence.status} ${index() === props.currentIndex ? 'current' : ''}`}
            data-index={index()}
            onClick={() => props.onSentenceClick(index())}
          >
            <div class="sentence-status">
              {getStatusIcon(sentence.status)}
              <span class="sentence-number">{index() + 1}</span>
            </div>
            <div class="sentence-content">
              <span class="sentence-text">{sentence.text}</span>
              <Show when={sentence.duration}>
                <span class="sentence-duration">{sentence.duration?.toFixed(1)}s</span>
              </Show>
              <Show when={sentence.error}>
                <span class="sentence-error" title={sentence.error!}>
                  Error
                </span>
              </Show>
            </div>
          </div>
        )}
      </For>
    </div>
  );
};
