use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<MusicNotification<R>> {
  Ok(MusicNotification(app.clone()))
}

/// Access to the music-notification APIs.
pub struct MusicNotification<R: Runtime>(AppHandle<R>);

impl<R: Runtime> MusicNotification<R> {
  pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
    Ok(PingResponse {
      value: payload.value,
    })
  }

  pub fn play(&self, _payload: PlayRequest) -> crate::Result<PlayResponse> {
    Ok(PlayResponse {
      success: false,
      message: Some("Desktop implementation not available".to_string()),
    })
  }

  pub fn pause(&self) -> crate::Result<EmptyResponse> {
    Ok(EmptyResponse { success: false })
  }

  pub fn resume(&self) -> crate::Result<EmptyResponse> {
    Ok(EmptyResponse { success: false })
  }

  pub fn stop(&self) -> crate::Result<EmptyResponse> {
    Ok(EmptyResponse { success: false })
  }

  pub fn next(&self) -> crate::Result<EmptyResponse> {
    Ok(EmptyResponse { success: false })
  }

  pub fn previous(&self) -> crate::Result<EmptyResponse> {
    Ok(EmptyResponse { success: false })
  }

  pub fn seek(&self, _position: i64) -> crate::Result<EmptyResponse> {
    Ok(EmptyResponse { success: false })
  }

  pub fn get_state(&self) -> crate::Result<PlaybackState> {
    Ok(PlaybackState {
      is_playing: false,
      position: 0,
      duration: 0,
    })
  }
}
