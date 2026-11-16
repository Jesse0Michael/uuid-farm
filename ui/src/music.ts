import "./music.css";

const preferenceKey = "uuid-farm-music-muted";

export function startFarmMusic() {
  const button = document.querySelector<HTMLButtonElement>("#music-toggle");
  const label = document.querySelector<HTMLElement>("#music-label");
  const status = document.querySelector<HTMLElement>("#music-status");
  if (!button || !label || !status) return;

  const audio = new Audio();
  audio.preload = "none";
  audio.src = "/audio/barnyard-groove.m4a";
  audio.loop = true;
  audio.volume = 0.25;

  let enabled = true;
  try {
    enabled = localStorage.getItem(preferenceKey) !== "true";
  } catch {
    // The sound control also works when browser storage is unavailable.
  }
  let playing = false;
  let pending = false;
  let attempt = 0;
  let needsInteraction = enabled;

  function render() {
    button!.setAttribute("aria-pressed", String(playing));
    button!.dataset.playing = String(playing);
    button!.title = playing ? "Mute farm music" : "Play Barnyard Groove";
    label!.textContent = playing ? "Music on" : "Music off";
  }

  function remember() {
    try {
      localStorage.setItem(preferenceKey, String(!enabled));
    } catch {
      // Keep the current visit's choice even if it cannot be saved.
    }
  }

  async function play() {
    if (!enabled || pending || playing) return;
    const currentAttempt = ++attempt;
    pending = true;
    status!.textContent = "";
    try {
      if (audio.error) audio.load();
      await audio.play();
      if (currentAttempt !== attempt) return;
      playing = !audio.paused;
      needsInteraction = false;
    } catch (error) {
      if (currentAttempt !== attempt) return;
      playing = false;
      needsInteraction =
        error instanceof DOMException && error.name === "NotAllowedError";
      if (!needsInteraction)
        status!.textContent = "Farm music is unavailable. You can try again.";
    } finally {
      if (currentAttempt === attempt) {
        pending = false;
        render();
      }
    }
  }

  button.addEventListener("click", () => {
    if (playing || pending) {
      enabled = false;
      needsInteraction = false;
      ++attempt;
      pending = false;
      audio.pause();
      playing = false;
      status.textContent = "";
      render();
    } else {
      enabled = true;
      void play();
    }
    remember();
  });

  function onInteraction(event: Event) {
    if (
      !event.isTrusted ||
      !needsInteraction ||
      (event.target instanceof Node && button!.contains(event.target))
    )
      return;
    if (
      event instanceof KeyboardEvent &&
      (event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        ["Tab", "Escape", "Shift", "Control", "Alt", "Meta"].includes(event.key))
    )
      return;
    void play();
  }
  document.addEventListener("click", onInteraction);
  document.addEventListener("keydown", onInteraction);
  audio.addEventListener("pause", () => {
    playing = false;
    render();
  });
  audio.addEventListener("error", () => {
    ++attempt;
    pending = false;
    playing = false;
    needsInteraction = false;
    status.textContent = "Farm music is unavailable. You can try again.";
    render();
  });
  window.addEventListener("pagehide", () => audio.pause());
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && enabled) void play();
  });
  render();
  if (enabled) void play();
}
