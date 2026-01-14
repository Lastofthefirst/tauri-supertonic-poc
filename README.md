# Supertonic TTS + Tauri POC for EPUB Reading App

This repository contains a **proof of concept** demonstrating how to integrate the Supertonic text-to-speech model into a Tauri-based application, designed for building an EPUB reader with TTS capabilities.

## 🎯 Project Overview

This POC shows the complete architecture needed to add high-quality, on-device text-to-speech to an EPUB reading application using:

- **Tauri 2.0** - Cross-platform desktop/mobile app framework (Rust + Web)
- **Supertonic** - Fast, multilingual TTS model (167× real-time on M4 Pro)
- **ONNX Runtime** - For running the TTS models
- **Solid.js** - Reactive frontend framework

## 📁 Repository Structure

```
supertonic-mobile/
├── test-tonic-mob/              # Tauri POC application
│   ├── src/                     # Frontend (Solid.js/TypeScript)
│   │   ├── App.tsx              # TTS UI with controls
│   │   ├── App.css              # Styling
│   │   └── index.tsx
│   ├── src-tauri/               # Backend (Rust)
│   │   ├── src/
│   │   │   ├── lib.rs           # TTS commands & preprocessing
│   │   │   └── main.rs
│   │   ├── Cargo.toml           # Rust dependencies
│   │   └── tauri.conf.json      # Tauri config
│   └── package.json
├── supertonic/                  # Original TTS implementation
│   ├── rust/                    # Reference Rust implementation
│   │   ├── src/
│   │   │   ├── helper.rs        # Core TTS functions (400+ lines)
│   │   │   └── example_onnx.rs  # CLI demo
│   │   └── Cargo.toml
│   ├── python/, nodejs/, web/   # Other language implementations
│   └── ...                      # 11 total implementations
├── INTEGRATION_GUIDE.md         # Complete integration documentation
└── README.md                    # This file
```

## 🚀 Quick Start

### Prerequisites

- Rust 1.70+
- Node.js 18+ / pnpm
- Tauri CLI

### Run the POC

```bash
cd test-tonic-mob

# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev
```

The app will launch showing:
- TTS Engine Status
- Text synthesis interface
- Voice/language selection
- Quality and speed controls
- Result display (text preprocessing demo)

## ✨ What's Implemented

### Backend (Rust) - `src-tauri/src/lib.rs`

✅ **Text Preprocessing Pipeline**
- Unicode NFKD normalization
- Emoji removal
- Special character handling
- Punctuation spacing fixes
- Language tag wrapping (`<en>text</en>`)

✅ **TTS Data Structures**
- `Config` - TTS configuration (sample rate, chunk sizes, latent dims)
- `Style` - Voice style components (TTL + DP tensors)
- `VoiceStyleData` - JSON voice style format
- `SynthesizeRequest/Response` - API types

✅ **Tauri Commands**
- `synthesize_text` - Main TTS synthesis endpoint
- `get_available_voices` - List of voice styles (M1-M5, F1-F5)
- `get_available_languages` - Supported languages (en, ko, es, pt, fr)
- `get_tts_status` - Engine status and asset requirements

✅ **Dependencies**
```toml
ort = "2.0.0-rc.7"           # ONNX Runtime
ndarray = "0.16"              # Array operations
rustfft = "6.2"               # FFT for audio
hound = "3.5"                 # WAV file I/O
anyhow = "1.0"                # Error handling
unicode-normalization = "0.1" # Text processing
regex = "1.10"                # Pattern matching
rand/rand_distr               # Noise sampling for diffusion
```

### Frontend (Solid.js) - `src/App.tsx`

✅ **TTS UI Components**
- Multi-line text input area
- Language dropdown (5 languages)
- Voice style selector (10 voices)
- Denoising steps slider (1-20, controls quality)
- Speed factor slider (0.9-1.5x)
- Synthesize button with loading state

✅ **Result Display**
- Success/error status indicators
- Preprocessed text preview
- Duration display
- Audio player (for base64 WAV playback)

✅ **State Management**
- Reactive signals for all controls
- Async synthesis handling
- Status monitoring

### Styling - `src/App.css`

✅ Form layouts with flex/grid
✅ Dark mode support
✅ Responsive design
✅ Accessible form controls

## 📋 What's NOT Implemented (Next Steps)

To go from POC → Production, you need:

### 1. **Download ONNX Models**
The actual TTS models are NOT included in this repo (too large for Git).

**Download from:** [Hugging Face - Supertone/supertonic-2](https://huggingface.co/Supertone/supertonic-2)

**Required files:**
```
src-tauri/assets/onnx/
├── duration_predictor.onnx      (~50-100 MB)
├── text_encoder.onnx            (~50-100 MB)
├── vector_estimator.onnx        (~100-200 MB)
├── vocoder.onnx                 (~50-100 MB)
├── tts.json                     (config)
└── unicode_indexer.json         (character mappings)

src-tauri/assets/voice_styles/
├── M1.json, M2.json, ..., M5.json
└── F1.json, F2.json, ..., F5.json
```

### 2. **Implement ONNX Inference Pipeline**

The current `synthesize_text` only does text preprocessing. Full synthesis requires:

1. Load ONNX sessions (4 models)
2. Process text through UnicodeProcessor
3. Run duration prediction model
4. Run text encoder with TTL style
5. Sample noisy latent (Gaussian noise)
6. Denoising loop (iterative refinement, `total_step` iterations)
7. Run vocoder to generate waveform
8. Encode as WAV and return base64

**Reference:** See `supertonic/rust/src/helper.rs` for full implementation

### 3. **Audio Playback**

Add base64 WAV decoding and Web Audio API playback:

```typescript
// Convert base64 to ArrayBuffer
const audioBuffer = base64ToArrayBuffer(response.audio_base64);

// Play using Web Audio API
const audioContext = new AudioContext();
const buffer = await audioContext.decodeAudioData(audioBuffer);
const source = audioContext.createBufferSource();
source.buffer = buffer;
source.connect(audioContext.destination);
source.start(0);
```

### 4. **EPUB Integration**

- Text extraction from EPUB files
- Chapter/paragraph segmentation
- Text selection for TTS
- Playback queue management
- Bookmark/resume functionality

### 5. **Performance Optimizations**

- **Text chunking** for long passages (max 300 chars)
- **Caching** synthesized audio by (text, lang, voice) hash
- **Parallel processing** with rayon
- **Progressive synthesis** (play first chunk while generating rest)
- **Background synthesis** with async workers

### 6. **Mobile Build**

Currently configured for desktop. For Android:

```bash
# Add Android target
cargo tauri android init

# Build APK
cargo tauri android build --release
```

## 📖 Documentation

- **[INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)** - Complete step-by-step guide for full integration
  - Part 1: Current POC implementation
  - Part 2: Steps to full integration
  - Part 3: EPUB reader considerations
  - Part 4: Build & deployment
  - Part 5: Troubleshooting
  - Part 6: API reference
  - Part 7: Supported languages

## 🎨 Key Features Demonstrated

### Text Preprocessing
```rust
// Input:  "Hello, World! 😀 This—is a test."
// Output: "<en>Hello, World! This-is a test.</en>"
```

### Multilingual Support
- English (en) - Default
- Korean (ko) - Special phoneme handling
- Spanish (es) - European/Latin American
- Portuguese (pt) - Brazilian/European
- French (fr) - European

### Voice Styles
- **Male voices:** M1, M2, M3, M4, M5
- **Female voices:** F1, F2, F3, F4, F5

Each voice has unique style vectors for:
- **TTL (Text-to-Latent)** - Text encoding style
- **DP (Diffusion Prior)** - Duration prediction style

### Quality Controls

**Denoising Steps** (total_step: 1-20)
- Lower = faster, lower quality
- Higher = slower, higher quality
- Default: 5 (good balance)
- 10+ for production quality

**Speed Factor** (0.9-1.5)
- <1.0 = slower speech
- 1.0 = natural speed
- >1.0 = faster speech
- Default: 1.05

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Solid.js)                 │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Text Input │  │ Voice Select │  │ Quality Sliders│  │
│  └────────────┘  └──────────────┘  └────────────────┘  │
│         │                │                    │         │
│         └────────────────┴────────────────────┘         │
│                          │                              │
│                   invoke("synthesize_text")             │
└──────────────────────────┼──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                 Backend (Rust + Tauri)                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Text Preprocessing                  │   │
│  │  • Unicode normalization                         │   │
│  │  • Emoji removal                                 │   │
│  │  • Special char replacement                      │   │
│  │  • Language tag wrapping                         │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │         ONNX Inference Pipeline (TODO)           │   │
│  │  1. Duration Prediction    (DP model)            │   │
│  │  2. Text Encoding          (Text Encoder)        │   │
│  │  3. Denoising Loop         (Vector Estimator)    │   │
│  │  4. Waveform Generation    (Vocoder)             │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │            WAV Encoding + Base64                 │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────┼──────────────────────────────┘
                           │
                           ▼
                   Return audio_base64
```

## 🔬 Testing the POC

### Current Functionality

When you run the POC:

1. **Status Section** shows required assets
2. **Text Input** accepts any text
3. **Voice/Language** dropdowns populated from backend
4. **Synthesize Button** sends text to backend
5. **Result Display** shows:
   - Original text
   - Preprocessed text (with language tags, cleaned)
   - Success/error status

### Testing Text Preprocessing

Try these inputs to see preprocessing in action:

```
Input:  "Hello—World! 😊 This is a test..."
Output: "<en>Hello-World! This is a test.</en>"

Input:  "Testing @ mentions, e.g., special chars!!!"
Output: "<en>Testing at mentions, for example, special chars!</en>"

Input:  "안녕하세요 세계"
Output: "<ko>안녕하세요 세계.</ko>"
```

## 🛠️ Development

### Build Commands

```bash
# Check Rust backend
cargo check --manifest-path src-tauri/Cargo.toml

# Build frontend
cd test-tonic-mob
pnpm build

# Run dev mode
pnpm tauri dev

# Build release
pnpm tauri build
```

### Adding Full TTS Synthesis

To implement actual audio synthesis:

1. Copy helper functions from `supertonic/rust/src/helper.rs`:
   - `TextToSpeech` struct and implementation
   - `load_text_to_speech()` - Initialize ONNX sessions
   - `load_voice_style()` - Load voice JSON files
   - `sample_noisy_latent()` - Noise sampling
   - `chunk_text()` - Text chunking for long passages

2. Update `synthesize_text` command to:
   ```rust
   static TTS_ENGINE: OnceLock<TextToSpeech> = OnceLock::new();

   #[tauri::command]
   fn synthesize_text(req: SynthesizeRequest) -> Result<SynthesizeResponse, String> {
       let engine = TTS_ENGINE.get_or_init(|| {
           load_text_to_speech("assets/onnx", false).unwrap()
       });

       let style = load_voice_style(&format!("assets/voice_styles/{}.json", req.voice_style))?;
       let (audio, duration) = engine.call(&req.text, &req.language, &style, req.total_step, req.speed, 0.3)?;

       let wav_bytes = encode_wav(&audio, engine.sample_rate)?;
       let audio_base64 = base64::encode(&wav_bytes);

       Ok(SynthesizeResponse {
           success: true,
           message: "Synthesis complete".into(),
           audio_base64: Some(audio_base64),
           duration: Some(duration),
       })
   }
   ```

## 📊 Performance Metrics

Based on Supertonic benchmarks:

- **Speed:** 167× real-time on M4 Pro (5 denoising steps)
- **Quality:** Mean Opinion Score ~4.0 (high quality)
- **Latency:** <100ms for short sentences
- **Model Size:** ~200-400 MB total
- **Languages:** 5 supported (en, ko, es, pt, fr)
- **Voices:** 10 styles (5 male, 5 female)

## 🎓 Learning Resources

- **Tauri:** https://tauri.app/
- **Supertonic:** https://github.com/Supertone/supertonic
- **ONNX Runtime:** https://onnxruntime.ai/
- **Solid.js:** https://docs.solidjs.com/

## 📄 License

This POC follows the licenses of its components:
- Tauri: MIT/Apache 2.0
- Supertonic: Check original repository
- ONNX Runtime: MIT

## 🤝 Contributing

This is a proof of concept. For production use:

1. Download ONNX models from Hugging Face
2. Implement full inference pipeline
3. Add EPUB parsing
4. Optimize for mobile
5. Add caching and performance tuning

## 📝 Summary

**What this POC demonstrates:**
- ✅ Complete Tauri app structure (Rust backend + Solid.js frontend)
- ✅ TTS command architecture and data flow
- ✅ Text preprocessing pipeline
- ✅ Voice and language management
- ✅ Quality/speed parameter controls
- ✅ UI/UX for TTS interactions
- ✅ Build configuration for cross-platform deployment

**What you need to add:**
- ⬜ ONNX model files (download from Hugging Face)
- ⬜ Full ONNX inference pipeline
- ⬜ Audio encoding and playback
- ⬜ EPUB text extraction
- ⬜ Performance optimizations
- ⬜ Mobile build testing

**Result:** A complete roadmap from POC to production-ready EPUB reader with TTS! 🎉

---

For detailed implementation steps, see **[INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)**.
