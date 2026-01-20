const COMMANDS: &[&str] = &["ping", "play", "pause", "resume", "stop", "next", "previous", "seek", "get_state"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .ios_path("ios")
    .build();
}
