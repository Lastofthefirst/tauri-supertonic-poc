use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::MusicNotificationExt;

#[command]
pub(crate) async fn ping<R: Runtime>(
    app: AppHandle<R>,
    payload: PingRequest,
) -> Result<PingResponse> {
    app.music_notification().ping(payload)
}

#[command]
pub(crate) async fn play<R: Runtime>(
    app: AppHandle<R>,
    payload: PlayRequest,
) -> Result<PlayResponse> {
    app.music_notification().play(payload)
}

#[command]
pub(crate) async fn pause<R: Runtime>(
    app: AppHandle<R>,
) -> Result<EmptyResponse> {
    app.music_notification().pause()
}

#[command]
pub(crate) async fn resume<R: Runtime>(
    app: AppHandle<R>,
) -> Result<EmptyResponse> {
    app.music_notification().resume()
}

#[command]
pub(crate) async fn stop<R: Runtime>(
    app: AppHandle<R>,
) -> Result<EmptyResponse> {
    app.music_notification().stop()
}

#[command]
pub(crate) async fn next<R: Runtime>(
    app: AppHandle<R>,
) -> Result<EmptyResponse> {
    app.music_notification().next()
}

#[command]
pub(crate) async fn previous<R: Runtime>(
    app: AppHandle<R>,
) -> Result<EmptyResponse> {
    app.music_notification().previous()
}

#[command]
pub(crate) async fn seek<R: Runtime>(
    app: AppHandle<R>,
    position: i64,
) -> Result<EmptyResponse> {
    app.music_notification().seek(position)
}

#[command]
pub(crate) async fn get_state<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PlaybackState> {
    app.music_notification().get_state()
}
