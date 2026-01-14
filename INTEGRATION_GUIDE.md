# Supertonic TTS Integration Guide for Tauri EPUB Reader

## Overview

This document outlines the complete integration of Supertonic TTS (Text-to-Speech) into a Tauri-based EPUB reading application. A working POC has been created in `test-tonic-mob/` demonstrating the key architectural patterns and necessary steps.

---

## Part 1: Current POC Implementation

### What's Included

The POC in `test-tonic-mob/` includes:

1. **Backend (Rust)** - `src-tauri/src/lib.rs`
   - TTS data structures (Config, Style, VoiceStyleData)
   - Text preprocessing pipeline
   - Tauri commands for synthesis requests
   - Text normalization (emojis, special chars, spacing)

2. **Frontend (Solid.js/TypeScript)** - `src/App.tsx`
   - TTS UI with text input
   - Voice and language selection dropdowns
   - Quality/speed parameter sliders
   - Result display with audio player support
   - Status monitoring

3. **Dependencies** - `src-tauri/Cargo.toml`
   ```
   ort = "2.0.0-rc.7"          # ONNX Runtime
   ndarray = "0.16"             # Array operations
   rustfft = "6.2"              # FFT for audio
   hound = "3.5"                # WAV file I/O
   anyhow = "1.0"               # Error handling
   unicode-normalization = "0.1" # Text processing
   regex = "1.10"               # Pattern matching
   ```

### Running the POC

```bash
cd test-tonic-mob
pnpm install        # Install frontend deps
pnpm tauri dev     # Run in development mode
```

The UI will show:
- TTS Engine Status (current requirements)
- Text synthesis form with parameters
- Available voices and languages
- Synthesis results

---

## Part 2: Steps to Full Integration

### Step 1: Obtain ONNX Models and Voice Styles

**Source:** Hugging Face - [Supertone/supertonic-2](https://huggingface.co/Supertone/supertonic-2)

**Required Files:**
```
assets/onnx/
├── duration_predictor.onnx      (~50-100 MB)
├── text_encoder.onnx            (~50-100 MB)
├── vector_estimator.onnx        (~100-200 MB)
├── vocoder.onnx                 (~50-100 MB)
├── tts.json                     (Configuration)
└── unicode_indexer.json         (Character mappings)

assets/voice_styles/
├── M1.json, M2.json, M3.json, M4.json, M5.json
└── F1.json, F2.json, F3.json, F4.json, F5.json
```

**Placement:**
```bash
# Place ONNX models
mkdir -p test-tonic-mob/src-tauri/assets/onnx
cp <huggingface>/onnx/* test-tonic-mob/src-tauri/assets/onnx/

# Place voice styles
mkdir -p test-tonic-mob/src-tauri/assets/voice_styles
cp <huggingface>/voice_styles/*.json test-tonic-mob/src-tauri/assets/voice_styles/
```

**Git LFS:**
Add to `.gitignore`:
```
assets/onnx/*.onnx
*.onnx
assets/voice_styles/
```

### Step 2: Implement Full ONNX Inference Pipeline

Replace the simplified `synthesize_text` command with full implementation:

**In `src-tauri/src/lib.rs`:**

```rust
use ort::{Session, inputs, value::Value};
use std::sync::OnceLock;

static TTS_ENGINE: OnceLock<TextToSpeechEngine> = OnceLock::new();

pub struct TextToSpeechEngine {
    dp_ort: Session,
    text_enc_ort: Session,
    vector_est_ort: Session,
    vocoder_ort: Session,
    text_processor: UnicodeProcessor,
    config: Config,
}

impl TextToSpeechEngine {
    pub fn new(onnx_dir: &str) -> Result<Self, String> {
        // Load configuration
        let config = load_cfgs(onnx_dir)
            .map_err(|e| format!("Failed to load config: {}", e))?;

        // Load ONNX sessions
        let dp_ort = Session::builder()
            .map_err(|e| format!("ONNX error: {}", e))?
            .commit_from_file(format!("{}/duration_predictor.onnx", onnx_dir))
            .map_err(|e| format!("Failed to load DP model: {}", e))?;

        let text_enc_ort = Session::builder()
            .map_err(|e| format!("ONNX error: {}", e))?
            .commit_from_file(format!("{}/text_encoder.onnx", onnx_dir))
            .map_err(|e| format!("Failed to load text encoder: {}", e))?;

        let vector_est_ort = Session::builder()
            .map_err(|e| format!("ONNX error: {}", e))?
            .commit_from_file(format!("{}/vector_estimator.onnx", onnx_dir))
            .map_err(|e| format!("Failed to load vector estimator: {}", e))?;

        let vocoder_ort = Session::builder()
            .map_err(|e| format!("ONNX error: {}", e))?
            .commit_from_file(format!("{}/vocoder.onnx", onnx_dir))
            .map_err(|e| format!("Failed to load vocoder: {}", e))?;

        // Load unicode processor
        let text_processor = UnicodeProcessor::new(
            format!("{}/unicode_indexer.json", onnx_dir)
        ).map_err(|e| format!("Failed to load unicode indexer: {}", e))?;

        Ok(TextToSpeechEngine {
            dp_ort,
            text_enc_ort,
            vector_est_ort,
            vocoder_ort,
            text_processor,
            config,
        })
    }

    pub fn synthesize(
        &mut self,
        text: &str,
        lang: &str,
        style: &Style,
        total_steps: usize,
        speed: f32,
    ) -> Result<Vec<u8>, String> {
        // 1. Preprocess text
        let preprocessed = preprocess_text(text, lang)
            .map_err(|e| format!("Text preprocessing failed: {}", e))?;

        // 2. Run through ONNX pipeline (duration prediction → text encoding → denoising → vocoding)
        // See supertonic/rust/src/helper.rs for full implementation

        // 3. Encode audio as WAV
        let wav_bytes = encode_wav_to_bytes(&audio_samples, self.config.ae.sample_rate)
            .map_err(|e| format!("WAV encoding failed: {}", e))?;

        Ok(wav_bytes)
    }
}
```

**Key Inference Steps:**

1. **Text Processing**: Normalize Unicode, remove emojis, fix spacing
2. **Duration Prediction**: Use DP model to predict phoneme durations
3. **Text Encoding**: Encode text with TTL style component
4. **Diffusion Denoising**: Iteratively denoise latent (controlled by total_steps)
5. **Vocoding**: Convert latent to audio waveform

### Step 3: Create Helper Module for Supertonic Operations

**Create `src-tauri/src/tts_helper.rs`:**

Copy and adapt the critical functions from `supertonic/rust/src/helper.rs`:

```rust
// Text chunking for long texts
pub fn chunk_text(text: &str, max_len: usize) -> Vec<String> {
    // Split by paragraphs → sentences → words
    // Handles abbreviations and long sentences
}

// Batch inference for multiple text/voice pairs
pub fn batch_synthesize(
    texts: Vec<String>,
    languages: Vec<String>,
    styles: Vec<Style>,
) -> Result<Vec<Vec<u8>>> {
    // Process multiple items efficiently
}

// Load voice styles from JSON
pub fn load_voice_style(path: &str) -> Result<Style> {
    // Parse JSON, convert to ndarray tensors
}

// Sample noisy latent for diffusion
pub fn sample_noisy_latent(...) -> (Array3<f32>, Array3<f32>) {
    // Initialize noise and mask for denoising loop
}
```

### Step 4: Update Tauri Command

```rust
#[tauri::command]
fn synthesize_text(req: SynthesizeRequest) -> Result<SynthesizeResponse, String> {
    let engine = TTS_ENGINE.get_or_init(|| {
        TextToSpeechEngine::new("assets/onnx").expect("Failed to init TTS")
    });

    // Load voice style
    let style_path = format!("assets/voice_styles/{}.json", req.voice_style);
    let style = load_voice_style(&style_path)?;

    // Synthesize
    let wav_bytes = engine.synthesize(
        &req.text,
        &req.language,
        &style,
        req.total_step,
        req.speed,
    )?;

    // Encode as base64
    let audio_base64 = base64::encode(&wav_bytes);

    Ok(SynthesizeResponse {
        success: true,
        message: "Synthesis complete".to_string(),
        audio_base64: Some(audio_base64),
        duration: Some(calculate_duration(&wav_bytes)),
    })
}
```

### Step 5: EPUB Integration Architecture

**For EPUB Reading App:**

```typescript
// Frontend: Select text passage from EPUB
const selectedText = epubReader.getSelectedPassage();

// Backend: Queue synthesis request
const synthesisQueue: SynthesisJob[] = [];

interface SynthesisJob {
    text: string;
    language: string;
    voiceStyle: string;
    epubChapter: number;
    startOffset: number;
    audioBuffer?: ArrayBuffer;
    status: 'pending' | 'processing' | 'complete' | 'error';
}

// Process queue asynchronously
async function processSynthesisQueue() {
    for (const job of synthesisQueue) {
        if (job.status !== 'pending') continue;

        job.status = 'processing';

        try {
            const response = await invoke('synthesize_text', {
                req: {
                    text: job.text,
                    language: job.language,
                    voice_style: job.voiceStyle,
                    total_step: 5,
                    speed: 1.05,
                }
            });

            if (response.success && response.audio_base64) {
                job.audioBuffer = base64ToArrayBuffer(response.audio_base64);
                job.status = 'complete';
            }
        } catch (e) {
            job.status = 'error';
        }

        updateUI(); // Show progress
    }
}

// Playback
async function playEpubAudio() {
    for (const job of synthesisQueue) {
        if (job.status === 'complete' && job.audioBuffer) {
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(job.audioBuffer);
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0);

            // Wait for playback
            await new Promise(r =>
                setTimeout(r, audioBuffer.duration * 1000)
            );
        }
    }
}
```

### Step 6: Performance Optimizations

**Text Chunking:**
```rust
// Long texts should be split to avoid memory issues
const MAX_CHUNK_LENGTH: usize = 300;  // ~5-10 seconds of speech

// Progressive synthesis: start playing early chunks while later ones process
let first_chunk_ready = synthesize(&chunks[0]).await;
play_audio(first_chunk_ready);

for chunk in &chunks[1..] {
    while audio_still_playing() {
        sleep(100ms);
    }
    let audio = synthesize(chunk).await;
    play_audio(audio);
}
```

**Caching:**
```rust
// Cache synthesized audio by (text, language, voice) hash
pub struct AudioCache {
    cache: HashMap<String, Vec<u8>>,
}

fn cache_key(text: &str, lang: &str, voice: &str) -> String {
    format!("{:x}", md5::compute(format!("{}{}{}", text, lang, voice)))
}
```

**Parallel Processing:**
```rust
// Use rayon for parallel text preprocessing
use rayon::prelude::*;

let preprocessed: Vec<String> = texts
    .par_iter()
    .map(|text| preprocess_text(text, lang).unwrap())
    .collect();
```

### Step 7: Testing

**Unit Tests:**
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_text_preprocessing() {
        let input = "Hello, World! 😀";
        let output = preprocess_text(input, "en").unwrap();
        assert!(output.contains("<en>") && !output.contains("😀"));
    }

    #[test]
    fn test_text_chunking() {
        let long_text = "sentence. ".repeat(50);
        let chunks = chunk_text(&long_text, 300);
        assert!(chunks.len() > 1);
    }

    #[test]
    fn test_voice_style_loading() {
        let style = load_voice_style("assets/voice_styles/M1.json").unwrap();
        assert_eq!(style.ttl.shape()[0], 1); // batch size
    }
}
```

**Integration Tests:**
```bash
# Test TTS with real models
cargo test --test integration_tests -- --nocapture
```

---

## Part 3: EPUB Reader Specific Considerations

### Text Extraction from EPUB

Use `epub` crate:
```rust
use epub::doc::Document;

let document = Document::open("book.epub")?;
for chapter in document.spine.clone().iter() {
    let content = document.get_resource(&chapter)?;
    let text = extract_text(&content); // Parse HTML/XML
}
```

### Metadata & Styling

```rust
pub struct EpubTtsConfig {
    pub voice: String,
    pub language: String,
    pub speed: f32,
    pub skip_headings: bool,
    pub skip_inline_markup: bool,
    pub auto_chunk: bool,
    pub quality_steps: usize,
}
```

### Bookmarks & Resume

```typescript
interface BookmarkWithAudio {
    chapter: number;
    offset: number;
    textPreview: string;
    audioFile?: string;  // Cache synthesized audio
    lastPlayedTime?: number;
}
```

---

## Part 4: Build & Deployment

### Building for Production

```bash
# Build for desktop
cargo build --release

# Build for Android
cargo tauri android build --release

# Create installers
cargo tauri build
```

### Asset Bundling

```bash
# ONNX files are large, consider:
# 1. Download on first app launch
# 2. Use compression (ONNX supports pruning)
# 3. Stream models if possible
# 4. Fallback to cloud TTS if offline
```

### Bundle Size Considerations

- ONNX Models: ~200-400 MB
- Voice Styles: ~5-10 MB
- App + Dependencies: ~100-150 MB
- **Total APK:** ~300-600 MB (manageable)

---

## Part 5: Troubleshooting

### Common Issues

**ONNX Runtime Panic on Exit:**
```rust
// Use libc::_exit(0) to bypass cleanup
unsafe { libc::_exit(0); }
```

**Text Encoding Issues:**
```rust
// Always use NFKD normalization
use unicode_normalization::UnicodeNormalization;
let normalized: String = text.nfkd().collect();
```

**GPU Memory Issues:**
```rust
// Current implementation uses CPU only
// GPU mode not yet supported in supertonic
```

**Large Text Memory:**
```rust
// Chunk text before synthesis
let chunks = chunk_text(text, 300);  // ~5-10 sec chunks
for chunk in chunks {
    let audio = synthesize(&chunk).await?;
}
```

---

## Part 6: API Reference

### Tauri Commands

#### `synthesize_text`
```typescript
interface SynthesizeRequest {
    text: string;           // Text to synthesize
    language: string;       // Language code (en, ko, es, pt, fr)
    voice_style: string;    // Voice ID (M1-M5, F1-F5)
    total_step: number;     // Denoising steps (1-20, default 5)
    speed: number;          // Speed multiplier (0.9-1.5, default 1.05)
}

interface SynthesizeResponse {
    success: boolean;
    message: string;
    audio_base64?: string;  // WAV audio as base64
    duration?: number;      // Duration in seconds
}
```

#### `get_available_voices`
Returns: `Vec<String>` - List of available voice styles

#### `get_available_languages`
Returns: `Vec<String>` - List of supported languages

#### `get_tts_status`
Returns: `String` - Status and configuration info

---

## Part 7: Supported Languages

| Code | Language | Notes |
|------|----------|-------|
| en | English | Default, best support |
| ko | Korean | Special handling for phonemes |
| es | Spanish | European/Latin American |
| pt | Portuguese | Brazilian/European |
| fr | French | European French |

---

## File Structure

```
test-tonic-mob/
├── src/
│   ├── App.tsx           # Frontend UI (POC demo)
│   ├── App.css           # Styles
│   └── index.tsx
├── src-tauri/
│   ├── src/
│   │   ├── main.rs       # Entry point
│   │   ├── lib.rs        # TTS commands and structures
│   │   └── tts_helper.rs # (To be created) Helper functions
│   ├── Cargo.toml        # Dependencies
│   ├── assets/           # (To be downloaded)
│   │   ├── onnx/         # ONNX models
│   │   └── voice_styles/ # Voice JSON files
│   └── tauri.conf.json
├── pnpm-lock.yaml
└── vite.config.ts

supertonic/
├── rust/
│   ├── src/
│   │   ├── example_onnx.rs    # Reference implementation
│   │   └── helper.rs          # Helper functions (port to Tauri)
│   └── Cargo.toml
└── [other language implementations]
```

---

## Next Steps

1. ✅ POC Frontend & Backend Structure (DONE)
2. ⬜ Download ONNX models from Hugging Face
3. ⬜ Implement full ONNX inference in `synthesize_text`
4. ⬜ Add audio playback with Web Audio API
5. ⬜ Integrate with EPUB reader (text extraction, chunking)
6. ⬜ Add caching and performance optimizations
7. ⬜ Build and test on Android
8. ⬜ Deploy to app store

---

## References

- **Supertonic Repository**: https://github.com/Supertone/supertonic
- **ONNX Runtime Rust**: https://github.com/pykeio/ort
- **Tauri Documentation**: https://tauri.app/
- **Solid.js Guide**: https://docs.solidjs.com/
- **EPUB Specification**: https://www.w3.org/publishing/epub/

