const root = document.querySelector("[data-radio-lab]");
const player = root?.querySelector("[data-radio-player]");
const toggle = root?.querySelector("[data-radio-toggle]");
const waveform = root?.querySelector("[data-radio-waveform]");
const current = root?.querySelector("[data-radio-current]");
const duration = root?.querySelector("[data-radio-duration]");
const fallback = root?.querySelector("[data-radio-fallback]");

const AUDIO_SRC = "/audio/2026-09-19-resumen-diario.mp3";

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};

if (
  !(root instanceof HTMLElement) ||
  !(player instanceof HTMLElement) ||
  !(toggle instanceof HTMLButtonElement) ||
  !(waveform instanceof HTMLElement) ||
  !(current instanceof HTMLElement) ||
  !(duration instanceof HTMLElement) ||
  !(fallback instanceof HTMLAudioElement)
) {
  throw new Error("ATLAS NEWS RADIO LAB: incomplete DOM");
}

try {
  const { default: WaveSurfer } = await import(
    "https://cdn.jsdelivr.net/npm/wavesurfer.js@7.12.12/dist/wavesurfer.esm.js"
  );

  const wavesurfer = WaveSurfer.create({
    container: waveform,
    url: AUDIO_SRC,
    waveColor: "#45433f",
    progressColor: "#9b3428",
    cursorColor: "#9b3428",
    cursorWidth: 1,
    height: 28,
    barWidth: 2,
    barGap: 3,
    barRadius: 2,
    barMinHeight: 2,
    normalize: true,
    interact: true,
    dragToSeek: true,
    fillParent: true,
    hideScrollbar: true,
  });

  let totalDuration = 297.3;

  const syncPlaying = (playing) => {
    root.dataset.playing = String(playing);
    toggle.setAttribute("aria-pressed", String(playing));
    toggle.setAttribute(
      "aria-label",
      `${playing ? "Pausar" : "Reproducir"} Resumen diario de ATLAS NEWS`,
    );
  };

  const syncTime = (elapsed = wavesurfer.getCurrentTime()) => {
    const safeElapsed = Number.isFinite(elapsed) ? elapsed : 0;
    const safeDuration =
      Number.isFinite(totalDuration) && totalDuration > 0
        ? totalDuration
        : wavesurfer.getDuration();

    current.textContent = formatTime(safeElapsed);
    duration.textContent =
      Number.isFinite(safeDuration) && safeDuration > 0
        ? formatTime(safeDuration)
        : "--:--";

    const ratio =
      Number.isFinite(safeDuration) && safeDuration > 0
        ? Math.min(1, Math.max(0, safeElapsed / safeDuration))
        : 0;

    waveform.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    waveform.setAttribute(
      "aria-valuetext",
      `${formatTime(safeElapsed)} de ${formatTime(safeDuration)}`,
    );
  };

  toggle.addEventListener("click", async () => {
    try {
      await wavesurfer.playPause();
    } catch {
      syncPlaying(false);
    }
  });

  waveform.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 15 : 5;
    const now = wavesurfer.getCurrentTime();
    const total = wavesurfer.getDuration() || totalDuration;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      wavesurfer.setTime(Math.min(total, now + step));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      wavesurfer.setTime(Math.max(0, now - step));
    } else if (event.key === "Home") {
      event.preventDefault();
      wavesurfer.setTime(0);
    } else if (event.key === "End" && Number.isFinite(total)) {
      event.preventDefault();
      wavesurfer.setTime(total);
    }

    syncTime();
  });

  wavesurfer.on("ready", (loadedDuration) => {
    if (Number.isFinite(loadedDuration) && loadedDuration > 0) {
      totalDuration = loadedDuration;
    }
    syncTime(0);
  });

  wavesurfer.on("timeupdate", syncTime);
  wavesurfer.on("audioprocess", syncTime);
  wavesurfer.on("interaction", () => syncTime());
  wavesurfer.on("play", () => syncPlaying(true));
  wavesurfer.on("pause", () => syncPlaying(false));
  wavesurfer.on("finish", () => {
    syncPlaying(false);
    syncTime(totalDuration);
  });

  wavesurfer.on("error", (error) => {
    console.error("ATLAS NEWS RADIO LAB · WaveSurfer", error);
    player.hidden = true;
    fallback.hidden = false;
  });

  syncPlaying(false);
  syncTime(0);
} catch (error) {
  console.error("ATLAS NEWS RADIO LAB · bootstrap", error);
  player.hidden = true;
  fallback.hidden = false;
}
