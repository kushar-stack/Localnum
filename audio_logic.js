import { elements } from "./dom.js";
import { appState, audioState } from "./state.js";
import { summarizeArticle } from "./logic.js";
import { setStatus } from "./render.js";

let player = new Audio();
let currentBlobUrl = null;
let useWebSpeech = false;
let currentUtterance = null;

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
    // Use audioState.active (not playing, which is already false when ended)
    if (audioState.active) nextAudio();
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

  if (useWebSpeech) {
    speakWithWebSpeech(text);
    return;
  }

  setStatus("Generating premium audio brief...", "neutral");

  try {
    const res = await fetch("/api/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const msg = errorData.details || errorData.error || "Audio generation failed";
      throw new Error(msg);
    }

    const blob = await res.blob();
    currentBlobUrl = URL.createObjectURL(blob);
    player.src = currentBlobUrl;
    player.play();
  } catch (err) {
    console.warn("[Busy Brief TTS error]", err.message, "Falling back to local speech...");
    setStatus("Using local voice (API unavailable)", "warning");
    useWebSpeech = true;
    speakWithWebSpeech(text);
  }
}

function speakWithWebSpeech(text) {
  if (!window.speechSynthesis) {
    setStatus("Audio not supported on this device.", "error");
    setTimeout(nextAudio, 2000);
    return;
  }
  
  window.speechSynthesis.cancel();
  currentUtterance = new SpeechSynthesisUtterance(text);
  
  // Attempt to use a smoother English voice if available
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en-') && (v.name.includes('Premium') || v.name.includes('Google') || v.name.includes('Siri') || v.name.includes('Natural')));
  if (enVoice) currentUtterance.voice = enVoice;

  currentUtterance.onstart = () => {
    audioState.playing = true;
    updateAudioUi();
  };
  
  currentUtterance.onend = () => {
    if (audioState.active) nextAudio();
  };
  
  currentUtterance.onerror = (e) => {
    if (e.error !== 'interrupted') {
      audioState.playing = false;
      updateAudioUi();
      setTimeout(nextAudio, 1000);
    }
  };

  currentUtterance.onpause = () => {
    audioState.playing = false;
    updateAudioUi();
  };
  
  currentUtterance.onresume = () => {
    audioState.playing = true;
    updateAudioUi();
  };

  window.speechSynthesis.speak(currentUtterance);
}

export function toggleAudio() {
  if (audioState.active) {
    // Already playing a brief — toggle pause/resume
    if (useWebSpeech) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
      }
    } else {
      if (player.paused) {
        player.play();
      } else {
        player.pause();
      }
    }
  } else {
    // Not active — start a fresh brief
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
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
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
