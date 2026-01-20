# Tauri + ONNX TTS Android POC Research

## Objective
Demonstrate how to bundle a custom Text-to-Speech ONNX model into a Tauri mobile application for Android.

## Model Architecture
The TTS model consists of 4 ONNX files (~251MB total):
- `duration_predictor.onnx` - Predicts phoneme durations
- `text_encoder.onnx` - Encodes text/phonemes
- `vector_estimator.onnx` - Acoustic feature prediction
- `vocoder.onnx` - Converts features to audio waveform

Plus supporting files:
- `tts.json` - Model configuration
- `unicode_indexer.json` - Text tokenization
- `voice_styles/*.json` - Speaker/style embeddings

---

## Approach 1: tract-onnx (Pure Rust) - FAILED

**Rationale**: tract-onnx is a pure Rust ONNX runtime that compiles natively for any target without external dependencies.

**Implementation**:
```toml
# Cargo.toml
tract-onnx = "0.21"
```

**Result**: Failed with error:
```
Parsing as TDim: `text_length + 1 + 4`
```

**Root Cause**: tract cannot parse complex symbolic dimensions in the ONNX model graph. The models use dynamic shapes with arithmetic expressions (e.g., `text_length + 1 + 4`) that tract's dimension parser doesn't support.

**Conclusion**: tract is incompatible with these specific ONNX models without re-exporting them with simpler dimension specifications.

---

## Approach 2: ort with Pre-built Android Library - WORKING

**Rationale**: The `ort` crate (Rust bindings for ONNX Runtime) works on desktop but fails on Android because pre-built binaries aren't available for `aarch64-linux-android`. However, Microsoft publishes official Android builds via Maven Central.

**Discovery**: ONNX Runtime Android AAR available at:
- Maven: `com.microsoft.onnxruntime:onnxruntime-android:1.22.0`
- Direct: https://repo1.maven.org/maven2/com/microsoft/onnxruntime/onnxruntime-android/

**AAR Contents** (extracted):
```
jni/
├── arm64-v8a/
│   ├── libonnxruntime.so      # 18MB - needed for aarch64
│   └── libonnxruntime4j_jni.so
├── armeabi-v7a/
│   ├── libonnxruntime.so
│   └── libonnxruntime4j_jni.so
├── x86/
│   └── ...
└── x86_64/
    └── ...
headers/
├── onnxruntime_c_api.h
├── onnxruntime_cxx_api.h
└── ...
```

**Key Insight**: The AAR is just a ZIP file. Extract it, grab `libonnxruntime.so` for your target architecture, and configure `ort` to load it dynamically.

### ort 2.0 Configuration

```toml
# Cargo.toml
[dependencies]
# load-dynamic: Load libonnxruntime.so at runtime (required for Android)
# ndarray: Enable ndarray support for tensor operations
ort = { version = "2.0.0-rc.9", default-features = false, features = ["load-dynamic", "ndarray"] }
# IMPORTANT: Must match ort's ndarray version (0.17)
ndarray = { version = "0.17", features = ["rayon"] }
```

### ort 2.0 API Key Changes

The ort 2.0 API has significant changes from 1.x:

**Imports**:
```rust
use ort::session::{Session, SessionOutputs, builder::GraphOptimizationLevel};
use ort::value::Tensor;
```

**Session Creation**:
```rust
let model = Session::builder()?
    .with_optimization_level(GraphOptimizationLevel::Level3)?
    .commit_from_file(&model_path)?;
    // Or for bytes: .commit_from_memory(&model_bytes)?
```

**Running Inference**:
```rust
// Create tensors from ndarray
let input_tensor = Tensor::from_array(input_array)?;

// Run inference
let outputs: SessionOutputs = session.run(ort::inputs![
    input_tensor
])?;

// Extract output - returns (shape, data) tuple
let (shape, data) = outputs[0].try_extract_tensor::<f32>()?;
// shape is &ort::tensor::Shape (i64 values)
// data is &[f32]
```

**Important Gotchas**:
1. `Session::run` requires `&mut self` - sessions are NOT thread-safe for concurrent runs
2. Shape dimensions are `i64`, need to cast to `usize` for ndarray
3. `try_extract_tensor` returns a tuple `(shape, data)`, not an object with methods
4. `ort::inputs!` macro returns array directly, NOT a Result - don't use `?` on it

---

## Approach 3: sherpa-onnx / sherpa-rs - EVALUATED

**What is it**: sherpa-onnx is a C++ speech processing framework with ONNX Runtime already working on Android. sherpa-rs provides Rust bindings.

**Supported TTS Models**:
- VITS (piper, melo-tts)
- Kokoro
- Matcha-TTS
- KittenTTS

**Why Not Used**: sherpa-onnx expects specific model formats (e.g., Matcha needs `acoustic_model.onnx` + `vocoder.onnx` + `tokens.txt`). Our model has a different architecture (4 separate ONNX files with custom pipeline). Would require model conversion or using their pre-trained models instead.

**Potential Use**: If switching to a sherpa-supported model is acceptable, this is the easiest path to Android TTS.

---

## Environment Setup

### Required Tools
```bash
# Android SDK
export ANDROID_HOME=~/Android/Sdk
export NDK_HOME=$ANDROID_HOME/ndk/29.0.13599879

# Java (Android Studio JBR)
export JAVA_HOME=~/android-studio/jbr

# Rust Android targets
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
```

### Tauri Android Initialization
```bash
pnpm tauri android init
```

This generates `src-tauri/gen/android/` with Gradle project structure.

---

## APK Signing Setup

### Generate Keystore
```bash
keytool -genkey -v -keystore upload-keystore.jks \
  -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload -storepass android -keypass android
```

### Configure Gradle
File: `src-tauri/gen/android/keystore.properties`
```properties
keyAlias=upload
password=android
storeFile=upload-keystore.jks
```

File: `src-tauri/gen/android/app/build.gradle.kts`
```kotlin
import java.io.FileInputStream

android {
    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
            }
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["password"] as String?
            storeFile = keystoreProperties["storeFile"]?.let { file(rootProject.file(it as String)) }
            storePassword = keystoreProperties["password"] as String?
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

---

## Resource Bundling in Tauri

### Configuration
File: `src-tauri/tauri.conf.json`
```json
{
  "bundle": {
    "resources": {
      "assets/onnx/*": "assets/onnx/",
      "assets/voice_styles/*": "assets/voice_styles/"
    }
  }
}
```

### Platform-Specific Loading

**Desktop**: Resources resolve to filesystem paths
```rust
let resource_dir = app.path()
    .resolve("assets", BaseDirectory::Resource)?;
let onnx_dir = resource_dir.join("onnx");
// Load directly from filesystem
```

**Android**: Resources are in APK, accessed via Tauri's fs plugin
```rust
use tauri_plugin_fs::FsExt;

let path = app.path()
    .resolve("assets/onnx/model.onnx", BaseDirectory::Resource)?;
let bytes = app.fs().read(&path)?;
// Load from bytes
```

---

## Current Status

| Component | Desktop | Android |
|-----------|---------|---------|
| Tauri build | ✅ | ✅ |
| APK signing | N/A | ✅ |
| Resource bundling | ✅ | ✅ |
| ONNX inference (tract) | ❌ | ❌ |
| ONNX inference (ort) | ✅ | ✅ |

---

## Final Results

**APK Size**: 267MB
- TTS ONNX models: ~251MB
- ONNX Runtime library: ~19MB
- App + UI: ~7MB

**Build Commands**:
```bash
# Desktop development (convenience script in package.json)
pnpm tauri:dev

# Android APK build (convenience script in package.json)
pnpm tauri:android

# Or manually:
# Desktop (requires ORT_DYLIB_PATH)
ORT_DYLIB_PATH="$(pwd)/src-tauri/onnxruntime-linux-x64-1.23.2/lib/libonnxruntime.so.1.23.2" pnpm tauri dev

# Android
JAVA_HOME=~/android-studio/jbr \
ANDROID_HOME=~/Android/Sdk \
NDK_HOME=~/Android/Sdk/ndk/29.0.13599879 \
pnpm tauri android build --apk true --target aarch64
```

**APK Location**:
```
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

---

## Android Native Library Setup

For Android, `libonnxruntime.so` must be bundled in the APK's `jniLibs` folder:

```
src-tauri/gen/android/app/src/main/jniLibs/
└── arm64-v8a/
    └── libonnxruntime.so    # ~19MB
```

**Steps**:
1. Download AAR from Maven Central: `onnxruntime-android-1.23.2.aar`
2. Extract (it's a ZIP): `unzip onnxruntime-android.aar`
3. Copy to jniLibs: `cp jni/arm64-v8a/libonnxruntime.so src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a/`

**Version Compatibility**:
- ort 2.0.0-rc.11 requires ONNX Runtime >= 1.23.x
- Using 1.23.2 for both desktop and Android ensures compatibility

---

## Files Modified

- `src-tauri/Cargo.toml` - Dependencies
- `src-tauri/src/lib.rs` - Platform-specific initialization
- `src-tauri/src/tts_helper.rs` - ONNX model loading
- `src-tauri/tauri.conf.json` - Resource bundling
- `src-tauri/capabilities/default.json` - FS permissions
- `src-tauri/gen/android/app/build.gradle.kts` - APK signing
- `src-tauri/gen/android/keystore.properties` - Signing credentials

---

## Android Debugging

### Logging Setup

Added Android-specific logging via `android_logger` crate:

```toml
# Cargo.toml
[target.'cfg(target_os = "android")'.dependencies]
android_logger = "0.14"
```

```rust
// lib.rs - Initialize logger at app start
#[cfg(target_os = "android")]
{
    android_logger::init_once(
        android_logger::Config::default()
            .with_max_level(log::LevelFilter::Info)
            .with_tag("TTS_POC"),
    );
}
```

### Monitoring Logs

Install APK and monitor initialization:

```bash
# Install
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk

# Watch logs (filter by tag)
adb logcat -s TTS_POC:I

# Or see all logs from app
adb logcat | grep TTS_POC
```

### Expected Log Sequence

On successful initialization:
1. "Android logger initialized"
2. "Android TTS init starting..."
3. "Resolving resource: assets/onnx/tts.json"
4. "Read N bytes from assets/onnx/tts.json"
5. (repeat for each model file)
6. "All model files loaded, initializing ONNX Runtime..."
7. "TTS engine initialized successfully!"

On failure, the last message before error shows where it failed.

---

## Known Issues & Solutions

### Resource Loading on Android

Android resources are bundled inside the APK and accessed via Tauri's `tauri-plugin-fs`. The paths resolve to `asset://localhost/` URIs internally. Key points:

1. Use `BaseDirectory::Resource` with `tauri_plugin_fs::FsExt` trait
2. Read files as bytes, not filesystem paths
3. Models must be loaded from bytes using `commit_from_memory()`

### Performance

- **Debug builds**: Very slow (10+ seconds for TTS synthesis)
- **Release builds**: Use `pnpm tauri:dev:release` for development with release optimizations
- **Android**: Always builds in release mode

---

## On-Demand Model Download (Optional Models)

For apps where TTS is optional, models can be downloaded on-demand instead of bundled with the APK. This reduces initial APK size from ~267MB to ~26MB.

### Architecture

```
With bundled models:    APK ~267MB (includes ~251MB models)
Without bundled models: APK ~26MB  (models downloaded separately)
```

### Files to Host on GitHub

Upload these files to a GitHub Release:

**ONNX Models (~253MB):**
- `onnx_tts.json` (8.5KB)
- `onnx_unicode_indexer.json` (257KB)
- `onnx_duration_predictor.onnx` (1.5MB)
- `onnx_text_encoder.onnx` (27MB)
- `onnx_vector_estimator.onnx` (127MB)
- `onnx_vocoder.onnx` (97MB)

**Voice Styles (~4MB):**
- `voice_styles_M1.json` through `voice_styles_M5.json`
- `voice_styles_F1.json` through `voice_styles_F5.json`

Note: Files are named with underscores instead of slashes for GitHub compatibility.

### Required Dependencies

```toml
# Cargo.toml
tauri-plugin-upload = "2"
```

```json
// package.json
"@tauri-apps/plugin-upload": "^2"
```

### Capabilities Configuration

```json
// src-tauri/capabilities/default.json
{
  "permissions": [
    "fs:default",
    {
      "identifier": "fs:allow-write-file",
      "allow": [{ "path": "$APPDATA/**" }]
    },
    {
      "identifier": "fs:allow-mkdir",
      "allow": [{ "path": "$APPDATA/**" }]
    },
    "upload:default"
  ]
}
```

### Rust Backend Commands

```rust
// Check if models are downloaded
#[tauri::command]
fn get_model_status() -> Result<ModelStatus, String>;

// Get list of files to download
#[tauri::command]
fn get_download_manifest() -> Vec<String>;

// Initialize TTS after download
#[tauri::command]
fn init_tts_engine_command() -> Result<String, String>;
```

### Frontend Download Implementation

```typescript
import { download } from "@tauri-apps/plugin-upload";
import { mkdir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

const MODEL_BASE_URL = "https://github.com/USER/REPO/releases/download/v1.0.0";

async function downloadModels() {
  const status = await invoke<ModelStatus>("get_model_status");
  const modelsDir = status.models_dir;

  // Create directories
  await mkdir(await join(modelsDir, "onnx"), { recursive: true });
  await mkdir(await join(modelsDir, "voice_styles"), { recursive: true });

  // Download each file
  for (const file of status.missing_files) {
    const url = `${MODEL_BASE_URL}/${file.replace(/\//g, "_")}`;
    const dest = await join(modelsDir, file);
    await download(url, dest, (progress) => {
      console.log(`${progress.progress}/${progress.total}`);
    });
  }

  // Initialize TTS
  await invoke("init_tts_engine_command");
}
```

### Storage Location

Models are stored in the app data directory:
- **Desktop Linux**: `~/.local/share/com.quddus.test-tonic-mob/tts_models/`
- **Desktop macOS**: `~/Library/Application Support/com.quddus.test-tonic-mob/tts_models/`
- **Android**: `/data/data/com.quddus.test_tonic_mob/files/tts_models/`

### Creating a GitHub Release

```bash
# Create release and upload files
cd src-tauri/assets

# Rename files for GitHub (replace / with _)
for f in onnx/*; do cp "$f" "$(basename $f | sed 's|/|_|g')"; done
for f in voice_styles/*; do cp "$f" "voice_styles_$(basename $f)"; done

# Create release via gh CLI
gh release create v1.0.0 \
  onnx_*.onnx \
  onnx_*.json \
  voice_styles_*.json \
  --title "TTS Models v1.0.0" \
  --notes "ONNX TTS model files for on-demand download"
```

---

## Summary: Two Deployment Options

### Option 1: Bundled Models (Current)
- **APK Size**: ~267MB
- **Pros**: Works offline immediately, no download needed
- **Cons**: Large APK, longer install time
- **Use Case**: TTS is a core feature

### Option 2: On-Demand Download
- **APK Size**: ~26MB + ~257MB download
- **Pros**: Smaller initial APK, optional feature
- **Cons**: Requires internet for first use, storage for models
- **Use Case**: TTS is optional feature (e.g., e-book reader)

---

## Next Steps

1. ~~Configure `ort` crate to link against extracted `libonnxruntime.so`~~ ✅
2. ~~Set up Cargo build script for Android cross-compilation~~ ✅
3. ~~Bundle the native library in APK's `jniLibs` folder~~ ✅
4. ~~Test on device and debug via logcat~~ ✅
5. ~~Implement on-demand model download~~ ✅
6. Upload model files to GitHub Release for testing
7. Test download flow on Android device
