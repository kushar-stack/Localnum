import { elements } from "./dom.js";
import { appState, audioState } from "./state.js";
import { summarizeArticle } from "./logic.js";
import { setStatus } from "./render.js";

let player = new Audio();
let currentBlobUrl = null;

export function initAudio() {
  player.onplay = () => {
    audioState.playing = true;
    updateAudioUi();
  };
  player.onpause = () => {
    audioState.playing = false;
    updateAudioUi();
  };
  player.onended = () => {
    if (audioState.playing) nextAudio();
  };
  player.onerror = (e) => {
    console.error("Audio player error:", e);
    audioState.playing = false;
    updateAudioUi();
  };

  // Cleanup on page unload
  window.addEventListener("beforeunload", stopAudio);
}

export function playBrief() {
  if (!appState.currentBrief.length) return;
  
  audioState.queue = appState.currentBrief.map((article) => {
    const summary = summarizeArticle(article);
    return {
      title: article.title,
      bullets: article.summary?.bullets?.length ? article.summary.bullets : summary.bullets,
      id: article.id,
    };
  });
  
  audioState.active = true;
  audioState.currentIndex = 0;
  audioState.playing = true;
  
  updateAudioUi();
  speakCurrent();
}

async function speakCurrent() {
  const item = audioState.queue[audioState.currentIndex];
  if (!item) {
    stopAudio();
    return;
  }

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  const text = `${item.title}. ${item.bullets.join(". ")}`;
  setStatus("Generating premium audio brief...", "neutral");

  try {
    const res = await fetch("/api/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Audio generation failed");
    }

    const blob = await res.blob();
    currentBlobUrl = URL.createObjectURL(blob);
    player.src = currentBlobUrl;
    player.play();
  } catch (err) {
    console.error("[Busy Brief TTS error]", err);
    setStatus(err.message || "Failed to load premium audio. Skipping story.", "error");
    setTimeout(nextAudio, 1500);
  }
}

export function toggleAudio() {
  if (player.src) {
    if (player.paused) {
      player.play();
    } else {
      player.pause();
    }
  } else {
    playBrief();
  }
}

export function stopAudio() {
  player.pause();
  player.src = "";
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  audioState.active = false;
  audioState.playing = false;
  audioState.currentIndex = 0;
  updateAudioUi();
}

export function nextAudio() {
  if (audioState.currentIndex < audioState.queue.length - 1) {
    audioState.currentIndex++;
    speakCurrent();
  } else {
    stopAudio();
  }
}

export function prevAudio() {
  if (audioState.currentIndex > 0) {
    audioState.currentIndex--;
    speakCurrent();
  }
}

function updateAudioUi() {
  if (!elements.audioHub) return;
  
  elements.audioHub.classList.toggle("active", audioState.active);
  
  if (elements.audioStatus) {
    const current = audioState.queue[audioState.currentIndex];
    elements.audioStatus.textContent = current 
      ? `Briefing: ${current.title}` 
      : "Ready to brief";
  }
  
  if (elements.audioPlayPause) {
    const playIcon = elements.audioPlayPause.querySelector(".play-icon");
    const pauseIcon = elements.audioPlayPause.querySelector(".pause-icon");
    if (playIcon) playIcon.classList.toggle("hidden", audioState.playing);
    if (pauseIcon) pauseIcon.classList.toggle("hidden", !audioState.playing);
  }

  if (elements.audioProgressBar) {
    const progress = audioState.queue.length 
      ? ((audioState.currentIndex + 1) / audioState.queue.length) * 100 
      : 0;
    elements.audioProgressBar.style.width = `${progress}%`;
  }
}
