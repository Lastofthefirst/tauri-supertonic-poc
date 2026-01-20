import { createSignal, For, Show, onMount, createEffect, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { download } from "@tauri-apps/plugin-upload";
import { join } from "@tauri-apps/api/path";
import { mkdir, exists } from "@tauri-apps/plugin-fs";
import "./App.css";
import { TTSPlayer } from "./components/TTSPlayer";

interface SynthesizeRequest {
  text: string;
  language: string;
  voice_style: string;
  total_step: number;
  speed: number;
}

interface SynthesizeResponse {
  success: boolean;
  message: string;
  audio_base64?: string;
  duration?: number;
}

interface ModelStatus {
  downloaded: boolean;
  models_dir: string;
  missing_files: string[];
  total_files: number;
  downloaded_files: number;
}

// Configure the base URL for model downloads
const MODEL_BASE_URL = "https://github.com/Lastofthefirst/supertonic_files_for_correlate/releases/download/success";

function App() {
  // Model download state
  const [modelStatus, setModelStatus] = createSignal<ModelStatus | null>(null);
  const [downloading, setDownloading] = createSignal(false);
  const [downloadProgress, setDownloadProgress] = createSignal({ current: 0, total: 0, currentFile: "" });
  const [downloadError, setDownloadError] = createSignal<string | null>(null);

  // TTS section
  const [ttsText, setTtsText] = createSignal("This is a test of the text to speech system.");
  const [selectedLanguage, setSelectedLanguage] = createSignal("en");
  const [selectedVoice, setSelectedVoice] = createSignal("M1");
  const [totalSteps, setTotalSteps] = createSignal(5);
  const [speed, setSpeed] = createSignal(1.05);
  const [ttsStatus, setTtsStatus] = createSignal("Loading...");
  const [synthesizing, setSynthesizing] = createSignal(false);
  const [synthesizeResult, setSynthesizeResult] = createSignal<SynthesizeResponse | null>(null);
  const [audioUrl, setAudioUrl] = createSignal<string | null>(null);

  // Convert base64 to blob URL for faster playback
  createEffect(() => {
    const result = synthesizeResult();
    if (result?.audio_base64) {
      // Decode base64 to binary
      const binaryString = atob(result.audio_base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } else {
      setAudioUrl(null);
    }
  });

  // Cleanup blob URLs
  onCleanup(() => {
    const url = audioUrl();
    if (url) URL.revokeObjectURL(url);
  });
  const [availableVoices, setAvailableVoices] = createSignal<string[]>([
    "M1 - Male Voice 1",
    "M2 - Male Voice 2",
    "F1 - Female Voice 1",
    "F2 - Female Voice 2"
  ]);
  const [availableLanguages, setAvailableLanguages] = createSignal<string[]>([
    "en - English",
    "ko - Korean",
    "es - Spanish"
  ]);

  async function checkModelStatus() {
    try {
      const status = await invoke<ModelStatus>("get_model_status");
      setModelStatus(status);
      return status;
    } catch (error) {
      console.error("Failed to check model status:", error);
      return null;
    }
  }

  async function initializeTTS() {
    try {
      // First check model status
      const status = await checkModelStatus();

      // Get TTS status
      const ttsStatusStr = await invoke<string>("get_tts_status");
      setTtsStatus(ttsStatusStr);

      // If models are available, load voices and languages
      if (status?.downloaded || ttsStatusStr.includes("Loaded")) {
        const voices = await invoke<string[]>("get_available_voices");
        setAvailableVoices(voices);

        const languages = await invoke<string[]>("get_available_languages");
        setAvailableLanguages(languages);
      }
    } catch (error) {
      setTtsStatus(`Error initializing TTS: ${error}`);
    }
  }

  async function downloadModels() {
    setDownloading(true);
    setDownloadError(null);

    try {
      // Get the list of files to download (for future use)
      const _manifest = await invoke<string[]>("get_download_manifest");
      const status = modelStatus();

      if (!status) {
        throw new Error("Model status not available");
      }

      // Get the models directory
      const modelsDir = status.models_dir;

      // Create necessary directories
      const onnxDir = await join(modelsDir, "onnx");
      const voiceStylesDir = await join(modelsDir, "voice_styles");

      // Create directories if they don't exist
      if (!(await exists(modelsDir))) {
        await mkdir(modelsDir, { recursive: true });
      }
      if (!(await exists(onnxDir))) {
        await mkdir(onnxDir, { recursive: true });
      }
      if (!(await exists(voiceStylesDir))) {
        await mkdir(voiceStylesDir, { recursive: true });
      }

      // Download each missing file
      const missingFiles = status.missing_files;
      setDownloadProgress({ current: 0, total: missingFiles.length, currentFile: "" });

      for (let i = 0; i < missingFiles.length; i++) {
        const filePath = missingFiles[i];
        // Extract just the filename (e.g., "onnx/tts.json" -> "tts.json")
        const fileName = filePath.split("/").pop()!;
        const url = `${MODEL_BASE_URL}/${fileName}`;
        const destPath = await join(modelsDir, filePath);

        setDownloadProgress({ current: i, total: missingFiles.length, currentFile: fileName });

        console.log(`Downloading ${url} to ${destPath}`);

        await download(url, destPath, (progress) => {
          // Progress callback for individual file
          console.log(`${fileName}: ${progress.progress}/${progress.total} bytes`);
        });
      }

      setDownloadProgress({ current: missingFiles.length, total: missingFiles.length, currentFile: "Complete!" });

      // Refresh model status
      await checkModelStatus();

      // Try to initialize TTS engine
      try {
        const result = await invoke<string>("init_tts_engine_command");
        console.log(result);
        await initializeTTS();
      } catch (initError) {
        console.error("Failed to initialize TTS after download:", initError);
      }

    } catch (error) {
      console.error("Download error:", error);
      setDownloadError(`Download failed: ${error}`);
    } finally {
      setDownloading(false);
    }
  }

  async function synthesizeText() {
    if (!ttsText().trim()) {
      setSynthesizeResult({ success: false, message: "Please enter some text" });
      return;
    }

    setSynthesizing(true);
    setSynthesizeResult(null);

    try {
      const request: SynthesizeRequest = {
        text: ttsText(),
        language: selectedLanguage(),
        voice_style: selectedVoice(),
        total_step: totalSteps(),
        speed: speed(),
      };

      const response = await invoke<SynthesizeResponse>("synthesize_text", { req: request });
      setSynthesizeResult(response);
    } catch (error) {
      setSynthesizeResult({
        success: false,
        message: `Error: ${error}`,
      });
    } finally {
      setSynthesizing(false);
    }
  }

  onMount(() => {
    initializeTTS();
  });

  return (
    <main class="container">
      <h1>Supertonic TTS POC</h1>

      <div class="section">
        <h2>TTS Engine Status</h2>
        <pre style={{
          "white-space": "pre-wrap",
          "word-wrap": "break-word",
          background: "#f0f0f0",
          padding: "10px",
          "border-radius": "4px"
        }}>
          {ttsStatus()}
        </pre>

        {/* Model Download Section */}
        <Show when={modelStatus()}>
          {(status) => (
            <div style={{ "margin-top": "15px" }}>
              <h3>Model Files</h3>
              <div style={{
                background: status().downloaded ? "#d4edda" : "#fff3cd",
                padding: "10px",
                "border-radius": "4px",
                "margin-bottom": "10px"
              }}>
                <strong>
                  {status().downloaded
                    ? "✓ All models downloaded"
                    : `⏳ ${status().downloaded_files}/${status().total_files} files available`}
                </strong>
                <Show when={!status().downloaded}>
                  <p style={{ "font-size": "12px", margin: "5px 0 0 0" }}>
                    Missing: {status().missing_files.length} files (~257MB)
                  </p>
                </Show>
              </div>

              <Show when={!status().downloaded}>
                <Show when={downloading()}>
                  <div style={{
                    background: "#e7f3ff",
                    padding: "10px",
                    "border-radius": "4px",
                    "margin-bottom": "10px"
                  }}>
                    <p><strong>Downloading...</strong></p>
                    <p>File {downloadProgress().current + 1} of {downloadProgress().total}</p>
                    <p style={{ "font-size": "12px" }}>{downloadProgress().currentFile}</p>
                    <progress
                      value={downloadProgress().current}
                      max={downloadProgress().total}
                      style={{ width: "100%" }}
                    />
                  </div>
                </Show>

                <Show when={downloadError()}>
                  <div style={{
                    background: "#f8d7da",
                    padding: "10px",
                    "border-radius": "4px",
                    "margin-bottom": "10px"
                  }}>
                    <strong>Error:</strong> {downloadError()}
                  </div>
                </Show>

                <button
                  onClick={downloadModels}
                  disabled={downloading()}
                  style={{
                    width: "100%",
                    padding: "10px",
                    "font-size": "16px",
                    "background-color": "#007bff",
                    color: "white",
                    border: "none",
                    "border-radius": "4px",
                    cursor: downloading() ? "not-allowed" : "pointer"
                  }}
                >
                  {downloading() ? "Downloading..." : "Download TTS Models (~257MB)"}
                </button>

                <p style={{ "font-size": "12px", color: "#666", "margin-top": "5px" }}>
                  Models will be saved to: {status().models_dir}
                </p>
              </Show>
            </div>
          )}
        </Show>
      </div>

      <div class="section">
        <h2>Text-to-Speech Synthesis</h2>

        <div class="form-group">
          <label for="tts-text">Text to Synthesize:</label>
          <textarea
            id="tts-text"
            value={ttsText()}
            onInput={(e) => setTtsText(e.currentTarget.value)}
            placeholder="Enter text here..."
            rows={4}
            style={{ width: "100%", "box-sizing": "border-box" }}
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="language">Language:</label>
            <select
              id="language"
              value={selectedLanguage()}
              onChange={(e) => setSelectedLanguage(e.currentTarget.value)}
            >
              <For each={availableLanguages()}>
                {(lang) => {
                  const code = lang.split(" - ")[0];
                  return <option value={code}>{lang}</option>;
                }}
              </For>
            </select>
          </div>

          <div class="form-group">
            <label for="voice">Voice:</label>
            <select
              id="voice"
              value={selectedVoice()}
              onChange={(e) => setSelectedVoice(e.currentTarget.value)}
            >
              <For each={availableVoices()}>
                {(voice) => {
                  const code = voice.split(" - ")[0];
                  return <option value={code}>{voice}</option>;
                }}
              </For>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="steps">Denoising Steps: {totalSteps()}</label>
            <input
              id="steps"
              type="range"
              min="1"
              max="20"
              value={totalSteps()}
              onInput={(e) => setTotalSteps(parseInt(e.currentTarget.value))}
            />
            <small>Higher = better quality, slower</small>
          </div>

          <div class="form-group">
            <label for="speed">Speed: {speed().toFixed(2)}x</label>
            <input
              id="speed"
              type="range"
              min="0.9"
              max="1.5"
              step="0.05"
              value={speed()}
              onInput={(e) => setSpeed(parseFloat(e.currentTarget.value))}
            />
            <small>Lower = slower, Higher = faster</small>
          </div>
        </div>

        <button
          onClick={synthesizeText}
          disabled={synthesizing()}
          style={{ width: "100%", padding: "10px", "font-size": "16px" }}
        >
          {synthesizing() ? "Synthesizing..." : "Synthesize"}
        </button>
      </div>

      <Show when={synthesizeResult()}>
        {(result) => (
          <div class="section">
            <h2>Result</h2>
            <div
              style={{
                "background-color": result().success ? "#d4edda" : "#f8d7da",
                border: "1px solid #ccc",
                "border-radius": "4px",
                padding: "10px",
                "margin-bottom": "10px",
              }}
            >
              <strong>{result().success ? "✓ Success" : "✗ Error"}</strong>
            </div>
            <pre style={{
              "white-space": "pre-wrap",
              "word-wrap": "break-word",
              background: "#f0f0f0",
              padding: "10px",
              "border-radius": "4px",
            }}>
              {result().message}
            </pre>
            <Show when={result().duration}>
              <p><strong>Duration:</strong> {result().duration?.toFixed(2)} seconds</p>
            </Show>
            <Show when={audioUrl()}>
              <div>
                <p><strong>Audio:</strong></p>
                <audio
                  controls
                  autoplay
                  style={{ width: "100%" }}
                  src={audioUrl()!}
                />
              </div>
            </Show>
          </div>
        )}
      </Show>

      {/* Queue-based TTS Player - Pre-generates sentences for seamless playback */}
      <Show when={modelStatus()?.downloaded}>
        <div class="section">
          <h2>Queue Player (Pre-generation)</h2>
          <p style={{ "font-size": "13px", color: "#666", "margin-bottom": "12px" }}>
            Splits text into sentences, pre-generates audio ahead of playback for seamless listening.
            Click sentences to jump, use controls to navigate.
          </p>
          <TTSPlayer
            settings={{
              language: selectedLanguage(),
              voiceStyle: selectedVoice(),
              totalStep: totalSteps(),
              speed: speed(),
            }}
            initialText={`It was the best of times, it was the worst of times. It was the age of wisdom, it was the age of foolishness. It was the epoch of belief, it was the epoch of incredulity. It was the season of Light, it was the season of Darkness. It was the spring of hope, it was the winter of despair. We had everything before us, we had nothing before us. We were all going direct to Heaven, we were all going direct the other way. In short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only. There were a king with a large jaw and a queen with a plain face, on the throne of England. There were a king with a large jaw and a queen with a fair face, on the throne of France. In both countries it was clearer than crystal to the lords of the State preserves of loaves and fishes, that things in general were settled for ever. It was the year of Our Lord one thousand seven hundred and seventy-five. Spiritual revelations were conceded to England at that favoured period, as at this.`}
          />
        </div>
      </Show>
    </main>
  );
}

export default App;
