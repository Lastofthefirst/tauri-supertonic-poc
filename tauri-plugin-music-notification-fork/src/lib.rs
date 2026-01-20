use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::MusicNotification;
#[cfg(mobile)]
use mobile::MusicNotification;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the music-notification APIs.
pub trait MusicNotificationExt<R: Runtime> {
  fn music_notification(&self) -> &MusicNotification<R>;
}

impl<R: Runtime, T: Manager<R>> crate::MusicNotificationExt<R> for T {
  fn music_notification(&self) -> &MusicNotification<R> {
    self.state::<MusicNotification<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("music-notification")
    .invoke_handler(tauri::generate_handler![
      commands::ping,
      commands::play,
      commands::pause,
      commands::resume,
      commands::stop,
      commands::next,
      commands::previous,
      commands::seek,
      commands::get_state
    ])
    .setup(|app, api| {
      #[cfg(mobile)]
      let music_notification = mobile::init(app, api)?;
      #[cfg(desktop)]
      let music_notification = desktop::init(app, api)?;
      app.manage(music_notification);
      Ok(())
    })
    .build()
}
