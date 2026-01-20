import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type MediaAction = 'play' | 'pause' | 'next' | 'previous' | 'stop';

export interface MediaActionEvent {
  action: MediaAction;
}

/**
 * Listen for media button events from the notification controls
 * @param callback Function called when user presses a media button
 * @returns Unlisten function to stop listening
 */
export async function onMediaAction(
  callback: (action: MediaAction) => void
): Promise<UnlistenFn> {
  return await listen<MediaActionEvent>('plugin:music-notification://media-action', (event) => {
    callback(event.payload.action);
  });
}

export async function ping(value: string): Promise<string | null> {
  return await invoke<{value?: string}>('plugin:music-notification|ping', {
    payload: {
      value,
    },
  }).then((r) => (r.value ? r.value : null));
}

export interface PlayOptions {
  url: string;
  title?: string;
  artist?: string;
  album?: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  position: number;
  duration: number;
}

export async function play(options: PlayOptions): Promise<{ success: boolean; message?: string }> {
  return await invoke<{ success: boolean; message?: string }>('plugin:music-notification|play', {
    payload: options,
  });
}

export async function pause(): Promise<{ success: boolean }> {
  return await invoke<{ success: boolean }>('plugin:music-notification|pause');
}

export async function resume(): Promise<{ success: boolean }> {
  return await invoke<{ success: boolean }>('plugin:music-notification|resume');
}

export async function stop(): Promise<{ success: boolean }> {
  return await invoke<{ success: boolean }>('plugin:music-notification|stop');
}

export async function next(): Promise<{ success: boolean }> {
  return await invoke<{ success: boolean }>('plugin:music-notification|next');
}

export async function previous(): Promise<{ success: boolean }> {
  return await invoke<{ success: boolean }>('plugin:music-notification|previous');
}

export async function seek(position: number): Promise<{ success: boolean }> {
  return await invoke<{ success: boolean }>('plugin:music-notification|seek', {
    position,
  });
}

export async function getState(): Promise<PlaybackState> {
  return await invoke<PlaybackState>('plugin:music-notification|get_state');
}
