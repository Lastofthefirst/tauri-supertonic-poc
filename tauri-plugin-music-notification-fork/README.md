# Tauri Plugin Music Notification

A Tauri plugin for Android that provides music playback notifications with media controls.

## Features

- 🎵 Play music from URLs with media notifications
- 🎮 Full playback controls (play, pause, resume, stop)
- ⏭️ Next/Previous track navigation
- ⏩ Seek to specific positions
- 📊 Get current playback state
- 🔔 Native Android media notification with controls
- 🎨 Lock screen controls support

## Installation

Install the plugin using your preferred package manager:

```bash
npm run tauri add music-notification-api
```

Add the plugin to your `Cargo.toml`:

```toml
[dependencies]
music-notification = "0.1.0"
```

## Setup

### Rust

Register the plugin in your Tauri app:

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_music_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Permissions

Add the required permissions to your `src-tauri/capabilities/default.json`:

```json
{
  "permissions": [
    "music-notification:default"
  ]
}
```

### Android

The plugin automatically includes the required Android permissions:
- `INTERNET` - For streaming audio
- `FOREGROUND_SERVICE` - For background playback
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK` - For media playback service
- `POST_NOTIFICATIONS` - For displaying notifications

## Usage

### JavaScript/TypeScript

```typescript
import { play, pause, resume, stop, next, previous, seek, getState } from 'music-notification-api';

// Play music
await play({
  url: "https://example.com/song.mp3",
  title: "Song Title",
  artist: "Artist Name",
  album: "Album Name"
});

// Pause playback
await pause();

// Resume playback
await resume();

// Stop playback
await stop();

// Skip to next track
await next();

// Go to previous track
await previous();

// Seek to position (in milliseconds)
await seek(30000); // Seek to 30 seconds

// Get current playback state
const state = await getState();
console.log(state.isPlaying); // true/false
console.log(state.position);  // Current position in ms
console.log(state.duration);  // Total duration in ms
```

## API Reference

### `play(options: PlayOptions)`

Starts playing music from a URL.

**Parameters:**
- `url` (string, required): The URL of the audio file
- `title` (string, optional): Song title
- `artist` (string, optional): Artist name
- `album` (string, optional): Album name

**Returns:** `Promise<{ success: boolean; message?: string }>`

### `pause()`

Pauses the current playback.

**Returns:** `Promise<{ success: boolean }>`

### `resume()`

Resumes paused playback.

**Returns:** `Promise<{ success: boolean }>`

### `stop()`

Stops playback and clears the notification.

**Returns:** `Promise<{ success: boolean }>`

### `next()`

Skips to the next track (if available in playlist).

**Returns:** `Promise<{ success: boolean }>`

### `previous()`

Goes back to the previous track (if available in playlist).

**Returns:** `Promise<{ success: boolean }>`

### `seek(position: number)`

Seeks to a specific position in the current track.

**Parameters:**
- `position` (number): Position in milliseconds

**Returns:** `Promise<{ success: boolean }>`

### `getState()`

Gets the current playback state.

**Returns:** `Promise<PlaybackState>`

```typescript
interface PlaybackState {
  isPlaying: boolean;
  position: number;  // in milliseconds
  duration: number;  // in milliseconds
}
```

## Platform Support

| Platform | Supported |
|----------|-----------|
| Android  | ✅        |
| iOS      | ❌        |
| Windows  | ❌        |
| macOS    | ❌        |
| Linux    | ❌        |

Currently, this plugin only supports Android. Desktop implementations return placeholder responses.

## Example

Check out the [example app](./examples/tauri-app) for a complete implementation.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
