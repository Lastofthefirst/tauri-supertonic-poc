<script>
  import Greet from './lib/Greet.svelte'
  import { ping, play, pause, resume, stop, next, previous, seek, getState } from 'music-notification-api'

	let response = $state('')
	let currentState = $state({ isPlaying: false, position: 0, duration: 0 })

	function updateResponse(returnValue) {
		response += `[${new Date().toLocaleTimeString()}] ` + (typeof returnValue === 'string' ? returnValue : JSON.stringify(returnValue)) + '<br>'
	}

	function _ping() {
		ping("Pong!").then(updateResponse).catch(updateResponse)
	}

	function _play() {
		play({
			url: "https://warpfs.hermesbackend.xyz/api/public/Um9ja3N0YXIgLSBQb3N0IE1hbG9uZSAtIE5pbmlvIFNhY3JvIChTcGFuaXNoIFZlcnNpb24pICgxKS5tcDM6MTc2MDQ4MDYwMzEwMQ==",
			title: "Rockstar",
			artist: "Post Malone",
			album: "Hollywood's Bleeding"
		}).then(updateResponse).catch(updateResponse)
	}

	function _pause() {
		pause().then(updateResponse).catch(updateResponse)
	}

	function _resume() {
		resume().then(updateResponse).catch(updateResponse)
	}

	function _stop() {
		stop().then(updateResponse).catch(updateResponse)
	}

	function _next() {
		next().then(updateResponse).catch(updateResponse)
	}

	function _previous() {
		previous().then(updateResponse).catch(updateResponse)
	}

	function _seek() {
		seek(30000).then(updateResponse).catch(updateResponse)
	}

	function _getState() {
		getState().then((state) => {
			currentState = state
			updateResponse(state)
		}).catch(updateResponse)
	}
</script>

<main class="container">
  <h1>Music Notification Plugin</h1>

  <div class="row">
    <a href="https://vite.dev" target="_blank">
      <img src="/vite.svg" class="logo vite" alt="Vite Logo" />
    </a>
    <a href="https://tauri.app" target="_blank">
      <img src="/tauri.svg" class="logo tauri" alt="Tauri Logo" />
    </a>
    <a href="https://svelte.dev" target="_blank">
      <img src="/svelte.svg" class="logo svelte" alt="Svelte Logo" />
    </a>
  </div>

  <p>
    Test the music notification plugin controls.
  </p>

  <div class="row">
    <Greet />
  </div>

  <div class="controls">
    <button onclick="{_ping}">Ping</button>
    <button onclick="{_play}">Play Music</button>
    <button onclick="{_pause}">Pause</button>
    <button onclick="{_resume}">Resume</button>
    <button onclick="{_stop}">Stop</button>
    <button onclick="{_previous}">Previous</button>
    <button onclick="{_next}">Next</button>
    <button onclick="{_seek}">Seek to 30s</button>
    <button onclick="{_getState}">Get State</button>
  </div>

  <div class="state">
    <h3>Current State:</h3>
    <p>Playing: {currentState.isPlaying ? 'Yes' : 'No'}</p>
    <p>Position: {Math.floor(currentState.position / 1000)}s / {Math.floor(currentState.duration / 1000)}s</p>
  </div>

  <div class="response">
    <h3>Responses:</h3>
    <div>{@html response}</div>
  </div>

</main>

<style>
  .logo.vite:hover {
    filter: drop-shadow(0 0 2em #747bff);
  }

  .logo.svelte:hover {
    filter: drop-shadow(0 0 2em #ff3e00);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 20px 0;
  }

  .controls button {
    padding: 8px 16px;
    border-radius: 4px;
    background-color: #646cff;
    color: white;
    border: none;
    cursor: pointer;
  }

  .controls button:hover {
    background-color: #535bf2;
  }

  .state {
    margin: 20px 0;
    padding: 10px;
    background-color: #ffffff;
    border-radius: 4px;
  }

  .response {
    margin: 20px 0;
    padding: 10px;
    background-color: #fff;
    border-radius: 4px;
    max-height: 300px;
    overflow-y: auto;
  }
</style>
