mod tts_helper;

use std::sync::{Mutex, OnceLock};
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use base64::Engine;
use tauri::Manager;
use log::{info, error};

use tts_helper::{TextToSpeech, Style};

#[cfg(not(target_os = "android"))]
use tts_helper::load_text_to_speech;

#[cfg(target_os = "android")]
use tts_helper::{load_text_to_speech_from_bytes, ModelBytes};

// ============================================================================
// Global State
// ============================================================================

static TTS_ENGINE: OnceLock<Mutex<TextToSpeech>> = OnceLock::new();
static MODELS_DIR: OnceLock<PathBuf> = OnceLock::new();
static INIT_ERROR: OnceLock<String> = OnceLock::new();

// Store app handle for resource loading and path resolution
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

// ============================================================================
// Model File Definitions
// ============================================================================

/// List of all model files required for TTS
const MODEL_FILES: &[(&str, &str)] = &[
    ("onnx/tts.json", "config"),
    ("onnx/unicode_indexer.json", "unicode_indexer"),
    ("onnx/duration_predictor.onnx", "duration_predictor"),
    ("onnx/text_encoder.onnx", "text_encoder"),
    ("onnx/vector_estimator.onnx", "vector_estimator"),
    ("onnx/vocoder.onnx", "vocoder"),
];

/// Voice style files
const VOICE_STYLES: &[&str] = &["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"];

// ============================================================================
// Model Status and Download Support
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ModelStatus {
    pub downloaded: bool,
    pub models_dir: String,
    pub missing_files: Vec<String>,
    pub total_files: usize,
    pub downloaded_files: usize,
}

/// Get the models directory path (for downloading to)
fn get_models_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::path::BaseDirectory;

    app.path()
        .resolve("tts_models", BaseDirectory::AppData)
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

/// Check which model files exist in the downloaded models directory
fn check_downloaded_models(models_dir: &PathBuf) -> ModelStatus {
    let mut missing_files = Vec::new();
    let mut downloaded_count = 0;

    // Check ONNX model files
    for (file_path, _name) in MODEL_FILES {
        let full_path = models_dir.join(file_path);
        if full_path.exists() {
            downloaded_count += 1;
        } else {
            missing_files.push(file_path.to_string());
        }
    }

    // Check voice style files
    for voice in VOICE_STYLES {
        let file_path = format!("voice_styles/{}.json", voice);
        let full_path = models_dir.join(&file_path);
        if full_path.exists() {
            downloaded_count += 1;
        } else {
            missing_files.push(file_path);
        }
    }

    let total_files = MODEL_FILES.len() + VOICE_STYLES.len();

    ModelStatus {
        downloaded: missing_files.is_empty(),
        models_dir: models_dir.to_string_lossy().to_string(),
        missing_files,
        total_files,
        downloaded_files: downloaded_count,
    }
}

// ============================================================================
// Desktop Initialization - Uses filesystem paths
// ============================================================================

#[cfg(not(target_os = "android"))]
fn init_tts_engine_from_path(onnx_dir: &PathBuf, models_dir: &PathBuf) -> Result<(), String> {
    if TTS_ENGINE.get().is_some() {
        return Ok(());
    }

    // Check if the directory exists
    if !onnx_dir.exists() {
        return Err(format!(
            "ONNX directory not found at: {}",
            onnx_dir.display()
        ));
    }

    let engine = load_text_to_speech(onnx_dir.to_str().unwrap(), false)
        .map_err(|e| format!("Failed to load TTS engine: {}", e))?;

    let _ = TTS_ENGINE.set(Mutex::new(engine));
    let _ = MODELS_DIR.set(models_dir.clone());

    Ok(())
}

#[cfg(not(target_os = "android"))]
fn try_init_tts_desktop(app: &tauri::App) -> Result<(), String> {
    use tauri::path::BaseDirectory;

    info!("Desktop TTS init starting...");

    // Store app handle
    let _ = APP_HANDLE.set(app.handle().clone());

    // First, try to load from downloaded models directory
    let models_dir = get_models_directory(app.handle())?;
    let status = check_downloaded_models(&models_dir);

    if status.downloaded {
        info!("Found downloaded models at: {}", models_dir.display());
        let onnx_dir = models_dir.join("onnx");
        return init_tts_engine_from_path(&onnx_dir, &models_dir);
    }

    info!("No downloaded models, trying bundled resources...");

    // Fall back to bundled resources
    let resource_dir = app.path()
        .resolve("assets", BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve resource dir: {}", e))?;

    let onnx_dir = resource_dir.join("onnx");

    if onnx_dir.exists() {
        init_tts_engine_from_path(&onnx_dir, &resource_dir)
    } else {
        // No bundled models either - user needs to download
        info!("No models found. User must download models to: {}", models_dir.display());
        let _ = MODELS_DIR.set(models_dir);
        Err("TTS models not found. Please download models first.".to_string())
    }
}

// ============================================================================
// Android Initialization - Uses bytes-based loading
// ============================================================================

#[cfg(target_os = "android")]
fn init_tts_engine_from_bytes(model_bytes: ModelBytes) -> Result<(), String> {
    if TTS_ENGINE.get().is_some() {
        info!("TTS engine already initialized");
        return Ok(());
    }

    info!("Initializing ONNX Runtime from bytes...");
    let engine = load_text_to_speech_from_bytes(model_bytes)
        .map_err(|e| {
            let msg = format!("Failed to load TTS engine: {}", e);
            error!("{}", msg);
            msg
        })?;

    let _ = TTS_ENGINE.set(Mutex::new(engine));
    info!("TTS engine initialized successfully!");

    Ok(())
}

#[cfg(target_os = "android")]
fn try_init_tts_android(app: &tauri::App) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;
    use tauri::path::BaseDirectory;

    info!("Android TTS init starting...");

    // Store app handle
    let _ = APP_HANDLE.set(app.handle().clone());

    // Get the models directory for downloads
    let models_dir = get_models_directory(app.handle())?;
    let _ = MODELS_DIR.set(models_dir.clone());

    // Check if models are downloaded
    let status = check_downloaded_models(&models_dir);

    // Helper to read from downloaded files
    let read_downloaded = |rel_path: &str| -> Result<Vec<u8>, String> {
        let full_path = models_dir.join(rel_path);
        std::fs::read(&full_path)
            .map_err(|e| format!("Failed to read {}: {}", full_path.display(), e))
    };

    // Helper to read from bundled resources
    let read_resource = |name: &str| -> Result<Vec<u8>, String> {
        info!("Resolving resource: {}", name);
        let path = app.path().resolve(name, BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve path {}: {}", name, e))?;

        let bytes = app.fs().read(&path)
            .map_err(|e| format!("Failed to read {}: {}", name, e))?;
        info!("Read {} bytes from {}", bytes.len(), name);
        Ok(bytes)
    };

    // Try downloaded models first
    if status.downloaded {
        info!("Loading from downloaded models at: {}", models_dir.display());

        let model_bytes = ModelBytes {
            config: read_downloaded("onnx/tts.json")?,
            unicode_indexer: read_downloaded("onnx/unicode_indexer.json")?,
            duration_predictor: read_downloaded("onnx/duration_predictor.onnx")?,
            text_encoder: read_downloaded("onnx/text_encoder.onnx")?,
            vector_estimator: read_downloaded("onnx/vector_estimator.onnx")?,
            vocoder: read_downloaded("onnx/vocoder.onnx")?,
        };

        return init_tts_engine_from_bytes(model_bytes);
    }

    info!("No downloaded models, trying bundled resources...");

    // Try bundled resources
    match read_resource("assets/onnx/tts.json") {
        Ok(config) => {
            info!("Found bundled resources, loading...");

            let model_bytes = ModelBytes {
                config,
                unicode_indexer: read_resource("assets/onnx/unicode_indexer.json")?,
                duration_predictor: read_resource("assets/onnx/duration_predictor.onnx")?,
                text_encoder: read_resource("assets/onnx/text_encoder.onnx")?,
                vector_estimator: read_resource("assets/onnx/vector_estimator.onnx")?,
                vocoder: read_resource("assets/onnx/vocoder.onnx")?,
            };

            init_tts_engine_from_bytes(model_bytes)
        }
        Err(_) => {
            // No bundled models - user needs to download
            info!("No models found. User must download models to: {}", models_dir.display());
            Err("TTS models not found. Please download models first.".to_string())
        }
    }
}

// ============================================================================
// Voice Style Loading - Platform-aware (checks downloaded then bundled)
// ============================================================================

fn load_voice_style_for_platform(voice_name: &str) -> Result<Style, String> {
    // First try downloaded models directory
    if let Some(models_dir) = MODELS_DIR.get() {
        let style_path = models_dir
            .join("voice_styles")
            .join(format!("{}.json", voice_name));

        if style_path.exists() {
            let bytes = std::fs::read(&style_path)
                .map_err(|e| format!("Failed to read voice style: {}", e))?;
            return tts_helper::load_voice_style_from_bytes(&bytes)
                .map_err(|e| format!("Failed to parse voice style: {}", e));
        }
    }

    // Fall back to bundled resources (platform-specific)
    load_voice_style_from_bundled(voice_name)
}

#[cfg(not(target_os = "android"))]
fn load_voice_style_from_bundled(voice_name: &str) -> Result<Style, String> {
    use tauri::path::BaseDirectory;

    let app = APP_HANDLE.get()
        .ok_or("App handle not initialized")?;

    let resource_dir = app.path()
        .resolve("assets", BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve resource dir: {}", e))?;

    let style_path = resource_dir
        .join("voice_styles")
        .join(format!("{}.json", voice_name));

    if !style_path.exists() {
        return Err(format!("Voice style not found: {}", style_path.display()));
    }

    let bytes = std::fs::read(&style_path)
        .map_err(|e| format!("Failed to read voice style: {}", e))?;

    tts_helper::load_voice_style_from_bytes(&bytes)
        .map_err(|e| format!("Failed to parse voice style: {}", e))
}

#[cfg(target_os = "android")]
fn load_voice_style_from_bundled(voice_name: &str) -> Result<Style, String> {
    use tauri_plugin_fs::FsExt;
    use tauri::path::BaseDirectory;

    let app = APP_HANDLE.get()
        .ok_or("App handle not initialized")?;

    let path = app.path()
        .resolve(&format!("assets/voice_styles/{}.json", voice_name), BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve voice style path: {}", e))?;

    let bytes = app.fs().read(&path)
        .map_err(|e| format!("Failed to read voice style: {}", e))?;

    tts_helper::load_voice_style_from_bytes(&bytes)
        .map_err(|e| format!("Failed to parse voice style: {}", e))
}

// ============================================================================
// Status Helpers
// ============================================================================

fn get_tts_engine() -> Result<&'static Mutex<TextToSpeech>, String> {
    // First check if there was an init error
    if let Some(err) = INIT_ERROR.get() {
        return Err(format!("TTS initialization failed: {}", err));
    }

    TTS_ENGINE.get().ok_or_else(|| {
        "TTS engine not initialized. Still loading or initialization failed.".to_string()
    })
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[derive(Serialize, Deserialize, Debug)]
pub struct SynthesizeRequest {
    pub text: String,
    pub language: String,
    pub voice_style: String,
    pub total_step: usize,
    pub speed: f32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SynthesizeResponse {
    pub success: bool,
    pub message: String,
    pub audio_base64: Option<String>,
    pub duration: Option<f32>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SynthesizeChunkRequest {
    pub text: String,
    pub sentence_index: usize,
    pub language: String,
    pub voice_style: String,
    pub total_step: usize,
    pub speed: f32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SynthesizeChunkResponse {
    pub success: bool,
    pub sentence_index: usize,
    pub audio_base64: Option<String>,
    pub duration: Option<f32>,
    pub error: Option<String>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn synthesize_text(req: SynthesizeRequest) -> Result<SynthesizeResponse, String> {
    // Get TTS engine
    let engine = get_tts_engine()?;
    let mut engine = engine.lock().map_err(|e| format!("Lock error: {}", e))?;

    // Load voice style using platform-aware loader
    let style = load_voice_style_for_platform(&req.voice_style)?;

    // Synthesize
    let (wav, duration) = engine.call(
        &req.text,
        &req.language,
        &style,
        req.total_step,
        req.speed,
        0.3,
    ).map_err(|e| format!("Synthesis failed: {}", e))?;

    // Trim to actual duration
    let actual_len = (engine.sample_rate as f32 * duration) as usize;
    let wav_trimmed = &wav[..actual_len.min(wav.len())];

    // Encode as WAV
    let wav_bytes = tts_helper::encode_wav_to_bytes(wav_trimmed, engine.sample_rate)
        .map_err(|e| format!("WAV encoding failed: {}", e))?;

    // Encode as base64
    let audio_base64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

    Ok(SynthesizeResponse {
        success: true,
        message: format!("Synthesized {:.2} seconds of audio", duration),
        audio_base64: Some(audio_base64),
        duration: Some(duration),
    })
}

/// Synthesize a single sentence/chunk - used by the queue system
#[tauri::command]
fn synthesize_chunk(req: SynthesizeChunkRequest) -> SynthesizeChunkResponse {
    // Get TTS engine
    let engine = match get_tts_engine() {
        Ok(e) => e,
        Err(err) => return SynthesizeChunkResponse {
            success: false,
            sentence_index: req.sentence_index,
            audio_base64: None,
            duration: None,
            error: Some(err),
        },
    };

    let mut engine = match engine.lock() {
        Ok(e) => e,
        Err(e) => return SynthesizeChunkResponse {
            success: false,
            sentence_index: req.sentence_index,
            audio_base64: None,
            duration: None,
            error: Some(format!("Lock error: {}", e)),
        },
    };

    // Load voice style
    let style = match load_voice_style_for_platform(&req.voice_style) {
        Ok(s) => s,
        Err(e) => return SynthesizeChunkResponse {
            success: false,
            sentence_index: req.sentence_index,
            audio_base64: None,
            duration: None,
            error: Some(e),
        },
    };

    // Synthesize this single chunk (call uses internal chunking, but our text is already a chunk)
    let (wav, duration) = match engine.call(
        &req.text,
        &req.language,
        &style,
        req.total_step,
        req.speed,
        0.0, // No silence padding for individual chunks
    ) {
        Ok(r) => r,
        Err(e) => return SynthesizeChunkResponse {
            success: false,
            sentence_index: req.sentence_index,
            audio_base64: None,
            duration: None,
            error: Some(format!("Synthesis failed: {}", e)),
        },
    };

    // Trim to actual duration
    let actual_len = (engine.sample_rate as f32 * duration) as usize;
    let wav_trimmed = &wav[..actual_len.min(wav.len())];

    // Encode as WAV
    let wav_bytes = match tts_helper::encode_wav_to_bytes(wav_trimmed, engine.sample_rate) {
        Ok(b) => b,
        Err(e) => return SynthesizeChunkResponse {
            success: false,
            sentence_index: req.sentence_index,
            audio_base64: None,
            duration: None,
            error: Some(format!("WAV encoding failed: {}", e)),
        },
    };

    // Encode as base64
    let audio_base64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

    SynthesizeChunkResponse {
        success: true,
        sentence_index: req.sentence_index,
        audio_base64: Some(audio_base64),
        duration: Some(duration),
        error: None,
    }
}

/// Save audio base64 to a temp file and return the file path
/// This is needed for the music-notification plugin which plays from URLs
#[tauri::command]
fn save_audio_to_file(audio_base64: String, sentence_index: usize) -> Result<String, String> {
    let app = APP_HANDLE.get()
        .ok_or("App handle not initialized")?;

    // Get app data directory for temp audio files
    let audio_dir = get_models_directory(app)?
        .parent()
        .ok_or("Cannot get parent directory")?
        .join("audio_cache");

    // Create directory if it doesn't exist
    std::fs::create_dir_all(&audio_dir)
        .map_err(|e| format!("Failed to create audio cache dir: {}", e))?;

    // Decode base64
    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(&audio_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Save to file
    let file_path = audio_dir.join(format!("sentence_{}.wav", sentence_index));
    std::fs::write(&file_path, &audio_bytes)
        .map_err(|e| format!("Failed to write audio file: {}", e))?;

    // Return file:// URL for Android
    Ok(format!("file://{}", file_path.to_string_lossy()))
}

/// Clear audio cache directory
#[tauri::command]
fn clear_audio_cache() -> Result<(), String> {
    let app = APP_HANDLE.get()
        .ok_or("App handle not initialized")?;

    let audio_dir = get_models_directory(app)?
        .parent()
        .ok_or("Cannot get parent directory")?
        .join("audio_cache");

    if audio_dir.exists() {
        std::fs::remove_dir_all(&audio_dir)
            .map_err(|e| format!("Failed to clear audio cache: {}", e))?;
    }

    Ok(())
}

/// Split text into individual sentences for the queue system
#[tauri::command]
fn split_text_to_sentences(text: String, _language: String) -> Vec<String> {
    // Split into actual sentences (not chunks)
    let sentences = tts_helper::split_sentences(&text);
    // Filter out empty sentences and trim whitespace
    sentences
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

#[tauri::command]
fn get_available_voices() -> Vec<String> {
    vec![
        "M1 - Male Voice 1".to_string(),
        "M2 - Male Voice 2".to_string(),
        "M3 - Male Voice 3".to_string(),
        "M4 - Male Voice 4".to_string(),
        "M5 - Male Voice 5".to_string(),
        "F1 - Female Voice 1".to_string(),
        "F2 - Female Voice 2".to_string(),
        "F3 - Female Voice 3".to_string(),
        "F4 - Female Voice 4".to_string(),
        "F5 - Female Voice 5".to_string(),
    ]
}

#[tauri::command]
fn get_available_languages() -> Vec<String> {
    vec![
        "en - English".to_string(),
        "ko - Korean".to_string(),
        "es - Spanish".to_string(),
        "pt - Portuguese".to_string(),
        "fr - French".to_string(),
    ]
}

#[tauri::command]
fn get_tts_status() -> String {
    // Check for initialization error first
    if let Some(err) = INIT_ERROR.get() {
        return format!("TTS Engine: ✗ Error\nInitialization failed: {}", err);
    }

    match TTS_ENGINE.get() {
        Some(_) => "TTS Engine: ✓ Loaded and ready\nModels: All 4 ONNX models loaded\nVoices: 10 voice styles available".to_string(),
        None => "TTS Engine: ⏳ Not initialized\nModels may need to be downloaded".to_string(),
    }
}

/// Returns the status of downloaded models and the directory path
#[tauri::command]
fn get_model_status() -> Result<ModelStatus, String> {
    let app = APP_HANDLE.get()
        .ok_or("App handle not initialized")?;

    let models_dir = get_models_directory(app)?;
    Ok(check_downloaded_models(&models_dir))
}

/// Returns list of files that need to be downloaded with their relative paths
#[tauri::command]
fn get_download_manifest() -> Vec<String> {
    let mut files = Vec::new();

    // Add ONNX model files
    for (file_path, _name) in MODEL_FILES {
        files.push(file_path.to_string());
    }

    // Add voice style files
    for voice in VOICE_STYLES {
        files.push(format!("voice_styles/{}.json", voice));
    }

    files
}

/// Initialize TTS engine after models have been downloaded
#[tauri::command]
fn init_tts_engine_command() -> Result<String, String> {
    let app = APP_HANDLE.get()
        .ok_or("App handle not initialized")?;

    let models_dir = get_models_directory(app)?;
    let status = check_downloaded_models(&models_dir);

    if !status.downloaded {
        return Err(format!(
            "Cannot initialize: {} files still missing",
            status.missing_files.len()
        ));
    }

    // Platform-specific initialization from downloaded files
    #[cfg(not(target_os = "android"))]
    {
        let onnx_dir = models_dir.join("onnx");
        init_tts_engine_from_path(&onnx_dir, &models_dir)?;
    }

    #[cfg(target_os = "android")]
    {
        let read_downloaded = |rel_path: &str| -> Result<Vec<u8>, String> {
            let full_path = models_dir.join(rel_path);
            std::fs::read(&full_path)
                .map_err(|e| format!("Failed to read {}: {}", full_path.display(), e))
        };

        let model_bytes = ModelBytes {
            config: read_downloaded("onnx/tts.json")?,
            unicode_indexer: read_downloaded("onnx/unicode_indexer.json")?,
            duration_predictor: read_downloaded("onnx/duration_predictor.onnx")?,
            text_encoder: read_downloaded("onnx/text_encoder.onnx")?,
            vector_estimator: read_downloaded("onnx/vector_estimator.onnx")?,
            vocoder: read_downloaded("onnx/vocoder.onnx")?,
        };

        init_tts_engine_from_bytes(model_bytes)?;
    }

    Ok("TTS engine initialized successfully".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize Android logger
    #[cfg(target_os = "android")]
    {
        android_logger::init_once(
            android_logger::Config::default()
                .with_max_level(log::LevelFilter::Info)
                .with_tag("TTS_POC"),
        );
        info!("Android logger initialized");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_music_notification_api::init())
        .setup(|app| {
            info!("Tauri setup starting...");

            // Try to initialize TTS engine (from bundled or downloaded models)
            // If no models found, that's OK - user can download them later
            #[cfg(not(target_os = "android"))]
            {
                if let Err(e) = try_init_tts_desktop(app) {
                    info!("TTS not ready: {}", e);
                    // Don't set as error - models might just need downloading
                }
            }

            #[cfg(target_os = "android")]
            {
                if let Err(e) = try_init_tts_android(app) {
                    info!("TTS not ready: {}", e);
                }
            }

            info!("Tauri setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            synthesize_text,
            synthesize_chunk,
            split_text_to_sentences,
            save_audio_to_file,
            clear_audio_cache,
            get_available_voices,
            get_available_languages,
            get_tts_status,
            get_model_status,
            get_download_manifest,
            init_tts_engine_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
