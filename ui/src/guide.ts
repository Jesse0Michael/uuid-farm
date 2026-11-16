import "./guide.css";

/** The reference is local and read-only; opening the guide never calls the API. */
export function createGuide() {
  const farm = document.querySelector<HTMLElement>("#farm-view")!;
  const guide = document.querySelector<HTMLElement>("#docs-view")!;
  const tab = document.querySelector<HTMLAnchorElement>("#docs-tab")!;
  const frame = document.querySelector<HTMLIFrameElement>("#api-reference")!;
  const loading = document.querySelector<HTMLElement>("#reference-loading")!;
  const error = document.querySelector<HTMLElement>("#reference-error")!;
  const reference = document.querySelector<HTMLElement>(".field-guide")!;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let reading = false;
  let started = false;
  let ready = false;
  let timeout = 0;
  let farmScroll = 0;
  const farmTitle = document.title;

  function chapter() {
    return location.hash.match(/^#docs\/operation\/([\w-]+)$/)?.[1];
  }
  function referenceURL() {
    const operation = chapter();
    return `/reference/index.html${operation ? `#/other/${operation.toLowerCase()}` : ""}`;
  }
  function openChapter() {
    const operation = chapter();
    const reader = frame.contentWindow;
    if (!operation || !reader) return;
    // Go's static server redirects index.html to its directory. Keep that
    // canonical URL when changing chapters, so navigation never reloads it.
    const url = new URL(reader.location.href);
    url.hash = `/other/${operation.toLowerCase()}`;
    if (reader.location.hash !== url.hash) reader.location.replace(url.href);
  }
  function showError() {
    window.clearTimeout(timeout);
    loading.hidden = true;
    error.hidden = false;
    frame.hidden = true;
    reference.removeAttribute("aria-busy");
  }
  function loadReference() {
    started = true;
    ready = false;
    loading.hidden = false;
    error.hidden = true;
    // ReDoc measures its viewport while hydrating; keep the frame laid out.
    frame.hidden = false;
    reference.setAttribute("aria-busy", "true");
    window.clearTimeout(timeout);
    timeout = window.setTimeout(showError, 20000);
    frame.src = referenceURL();
  }
  frame.addEventListener("load", () => {
    // Ignore the initial about:blank document, and reject an HTML fallback/404.
    if (!started) return;
    try {
      if (frame.contentWindow?.location.href === "about:blank") return;
      if (!frame.contentDocument?.querySelector("#redoc h1")) {
        showError();
        return;
      }
      window.clearTimeout(timeout);
      ready = true;
      loading.hidden = true;
      error.hidden = true;
      frame.hidden = false;
      reference.removeAttribute("aria-busy");
      openChapter();
    } catch {
      showError();
    }
  });
  frame.addEventListener("error", showError);
  document.querySelector("#reference-retry")!
    .addEventListener("click", loadReference);

  function enterView(view: HTMLElement) {
    view.classList.remove("view-entering");
    if (!motion.matches) {
      // Restart the arrival when revisiting, without recreating either view.
      void view.offsetWidth;
      view.classList.add("view-entering");
    }
  }
  function navigate(initial = false) {
    const nextReading =
      location.hash === "#docs" || location.hash.startsWith("#docs/");
    const changed = nextReading !== reading;
    if (changed && nextReading) farmScroll = window.scrollY;
    reading = nextReading;
    farm.hidden = reading;
    guide.hidden = !reading;
    document.body.classList.toggle("is-reading", reading);
    document.title = reading ? "Documentation · UUID Farm" : farmTitle;
    if (reading) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");

    if (changed || initial) {
      if (!initial) enterView(reading ? guide : farm);
      window.scrollTo({ top: reading ? 0 : farmScroll, behavior: "instant" });
      if (reading) guide.focus({ preventScroll: true });
      else if (!initial) tab.focus({ preventScroll: true });
      document.dispatchEvent(new Event("farm:view-change"));
    }
    if (reading) {
      if (!started) loadReference();
      else if (ready) openChapter();
      if (chapter()) {
        reference.scrollIntoView({ behavior: "instant", block: "start" });
        if (ready) frame.focus({ preventScroll: true });
      }
    }
  }
  window.addEventListener("hashchange", () => navigate());
  document.querySelector(".wordmark")!.addEventListener("click", (event) => {
    if (
      !reading || !(event instanceof MouseEvent) ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
    ) return;
    event.preventDefault();
    location.hash = "farm";
  });
  navigate(true);
}
