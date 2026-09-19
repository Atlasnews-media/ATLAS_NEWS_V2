const root = document.querySelector("[data-radio-lab]");

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};

const setState = (message, kind = "ready") => {
  const state = root?.querySelector("[data-radio-state]");
  if (!(state instanceof HTMLElement)) return;
  state.textContent = message;
  state.dataset.kind = kind;
};

if (!(root instanceof HTMLElement)) {
  throw new Error("ATLAS NEWS RADIO LAB: root unavailable");
}

const audio = root.querySelector("audio");
const waveform = root.querySelector("[data-radio-waveform]");
const current = root.querySelector("[data-radio-current]");
const duration = root.querySelector("[data-radio-duration]");
const volumeSlot = root.querySelector("[data-radio-volume]");
const gapHost = root.querySelector(".gap-player");

if (
  !(audio instanceof HTMLAudioElement) ||
  !(waveform instanceof HTMLElement) ||
  !(current instanceof HTMLElement) ||
  !(duration instanceof HTMLElement) ||
  !(volumeSlot instanceof HTMLElement) ||
  !(gapHost instanceof HTMLElement)
) {
  setState("No fue posible preparar el reproductor.", "error");
  throw new Error("ATLAS NEWS RADIO LAB: incomplete DOM");
}

try {
  if (typeof window.GreenAudioPlayer !== "function") {
    throw new Error("Green Audio Player unavailable");
  }

  window.GreenAudioPlayer.init({
    selector: ".gap-player",
    stopOthersOnPlay: true,
    enableKeystrokes: true,
    showTooltips: true,
  });

  const gapTimeline = gapHost.querySelector(".controls");
  if (gapTimeline instanceof HTMLElement) {
    gapTimeline.classList.add("atlas-gap-hidden-controls");
    gapTimeline.setAttribute("aria-hidden", "true");
  }

  const volume = gapHost.querySelector(".volume");
  if (volume instanceof HTMLElement) {
    volumeSlot.append(volume);
  }

  const { default: WaveSurfer } = await import(
    "https://cdn.jsdelivr.net/npm/wavesurfer.js@7.12.12/dist/wavesurfer.esm.js"
  );

  const wavesurfer = WaveSurfer.create({
    container: waveform,
    media: audio,
    waveColor: "#65625b",
    progressColor: "#9b3428",
    cursorColor: "#9b3428",
    cursorWidth: 1,
    height: 42,
    barWidth: 2,
    barGap: 2,
    barRadius: 2,
    barMinHeight: 2,
    normalize: true,
    interact: true,
    dragToSeek: true,
    fillParent: true,
    hideScrollbar: true,
  });

  const syncTime = () => {
    const elapsed = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const total = Number.isFinite(audio.duration) ? audio.duration : 0;
    const ratio =
      total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;

    current.textContent = formatTime(elapsed);
    duration.textContent = total > 0 ? formatTime(total) : "--:--";
    waveform.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    waveform.setAttribute(
      "aria-valuetext",
      total > 0
        ? `${formatTime(elapsed)} de ${formatTime(total)}`
        : formatTime(elapsed),
    );
  };

  const syncPlaying = () => {
    root.dataset.playing = String(!audio.paused && !audio.ended);
  };

  const seekBy = (seconds) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.min(
      audio.duration,
      Math.max(0, audio.currentTime + seconds),
    );
    syncTime();
  };

  waveform.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      seekBy(5);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekBy(-5);
    } else if (event.key === "Home") {
      event.preventDefault();
      audio.currentTime = 0;
      syncTime();
    } else if (event.key === "End" && Number.isFinite(audio.duration)) {
      event.preventDefault();
      audio.currentTime = audio.duration;
      syncTime();
    }
  });

  audio.addEventListener("loadedmetadata", syncTime);
  audio.addEventListener("durationchange", syncTime);
  audio.addEventListener("timeupdate", syncTime);
  audio.addEventListener("play", syncPlaying);
  audio.addEventListener("pause", syncPlaying);
  audio.addEventListener("ended", syncPlaying);
  audio.addEventListener("error", () => {
    setState("El MP3 no pudo cargarse.", "error");
  });

  wavesurfer.on("ready", () => {
    syncTime();
    setState("Waveform real cargada · seek habilitado");
  });

  wavesurfer.on("interaction", syncTime);
  wavesurfer.on("error", () => {
    setState("WaveSurfer no pudo procesar el MP3.", "error");
  });

  syncTime();
  syncPlaying();
} catch (error) {
  audio.controls = true;
  setState(
    "Fallback HTML5 activo: no se pudo cargar una dependencia externa.",
    "error",
  );
  console.error(error);
}
