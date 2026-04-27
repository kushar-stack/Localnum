import { elements } from "./dom.js";
import { appState, audioState } from "./state.js";

let synthesis = window.speechSynthesis;
let currentUtterance = null;

export function initAudio() {
  if (!synthesis) return;

  // Synthesis voices are loaded asynchronously in many browsers
  if (synthesis.onvoiceschanged !== undefined) {
    synthesis.onvoiceschanged = () => {
      // Warm up the voice cache
      synthesis.getVoices();
    };
  }

  // Cleanup on page unload
  window.addEventListener("beforeunload", stopAudio);
}

export function playBrief() {
  if (!appState.currentBrief.length) return;
  
  audioState.queue = appState.currentBrief.map(article => ({
    title: article.title,
    bullets: article.summary?.bullets || [],
    id: article.id
  }));
  
  audioState.active = true;
  audioState.currentIndex = 0;
  audioState.playing = true;
  
  updateAudioUi();
  speakCurrent();
}

function speakCurrent() {
  if (currentUtterance) synthesis.cancel();
  
  const item = audioState.queue[audioState.currentIndex];
  if (!item) {
    stopAudio();
    return;
  }

  const text = `${item.title}. ${item.bullets.join(". ")}`;
  currentUtterance = new SpeechSynthesisUtterance(text);
  
  // Premium voice selection if available
  const voices = synthesis.getVoices();
  const premiumVoice = voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) || voices[0];
  if (premiumVoice) currentUtterance.voice = premiumVoice;
  
  currentUtterance.rate = 1.05; // Slightly faster for "Pulse" feel
  currentUtterance.pitch = 1.0;

  currentUtterance.onstart = () => {
    audioState.playing = true;
    updateAudioUi();
  };

  currentUtterance.onend = () => {
    if (audioState.playing) {
      nextAudio();
    }
  };

  currentUtterance.onerror = (e) => {
    console.error("TTS Error:", e);
    audioState.playing = false;
    updateAudioUi();
  };

  synthesis.speak(currentUtterance);
}

export function toggleAudio() {
  if (synthesis.speaking) {
    if (synthesis.paused) {
      synthesis.resume();
      audioState.playing = true;
    } else {
      synthesis.pause();
      audioState.playing = false;
    }
  } else {
    playBrief();
  }
  updateAudioUi();
}

export function stopAudio() {
  synthesis.cancel();
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
