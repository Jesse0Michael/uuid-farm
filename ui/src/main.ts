import "./index.css";
import { startFarmMusic } from "./music.ts";
import { adopt, surrender, ApiError, type Resident } from "./api.ts";
import { createCreatures } from "./creatures.ts";
import { createHistory } from "./history.ts";
import { createGuide } from "./guide.ts";
import { initializeAnalytics, type FailureReason, type Service } from "./analytics.ts";

const track = initializeAnalytics();
startFarmMusic();

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}

// Let the painted layers load before starting their staggered entrance.
Promise.allSettled(
  Array.from(
    document.querySelectorAll<HTMLImageElement>(".farm-scene img, .fence-art"),
  ).map((image) => image.decode()),
).then(() => {
  document.body.classList.add("scene-ready");
  document.dispatchEvent(new Event("farm:scene-ready"));
});

const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
createCreatures();
let service: Service = "adopt";
function trackScreen() {
  const screen = element("docs-view").hidden ? service : "documentation";
  track("screen_opened", { screen_name: screen });
}
document.addEventListener("farm:view-change", trackScreen);
createGuide();
document.documentElement.style.setProperty(
  "--sun-x",
  `${44 + Math.random() * 12}%`,
);
// One wind direction for the whole sky, chosen anew on each page load.
document.documentElement.style.setProperty(
  "--cloud-direction",
  Math.random() < 0.5 ? "normal" : "reverse",
);

let latestResident: Resident | undefined;
const history = createHistory(element<HTMLDetailsElement>("resident-history"));
function dateLabel(value: string | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
function showRecord(resident: Resident) {
  latestResident = resident;
  history.setResident(resident.id);
  document.querySelector(".registrar")?.classList.add("has-record");
  element("adopt-intro").hidden = true;
  const record = element("adoption-record");
  record.hidden = false;
  element("adopted-id").textContent = resident.id;
  element("record-name").textContent = resident.name || "Not yet named";
  const version = parseInt(resident.id[14] ?? "", 16);
  element("record-version").textContent = Number.isNaN(version)
    ? "UUID"
    : `UUID · Version ${version}`;
  element("record-surrendered").textContent = dateLabel(resident.surrenderDate);
  element("record-adopted").textContent = dateLabel(resident.adoptionDate);
  element("record-tag-row").hidden = !resident.tag;
  element("record-tag").textContent = resident.tag ?? "";
  element("adopt-button-label").textContent = "Make room for another";
  element("copy-id").textContent = "Copy UUID ⧉";
  if (!motionPreference.matches)
    record.animate(
      [
        { opacity: 0, transform: "translateY(15px) rotate(1deg)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 500, easing: "ease-out" },
    );
  element("record-title").focus({ preventScroll: true });
}

element("copy-id").addEventListener("click", async () => {
  if (!latestResident) return;
  try {
    await navigator.clipboard.writeText(latestResident.id);
    track("uuid_copied");
    element("copy-id").textContent = "Copied. Ready for a new beginning. ✓";
  } catch {
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(element("adopted-id"));
    selection?.removeAllRanges();
    selection?.addRange(range);
    element("adopt-status").textContent =
      "Your UUID is selected. Copy it to take it home.";
  }
});

const failureMessages: Record<FailureReason, string> = {
  invalid_uuid: "That doesn’t look like a UUID. Please check their identification.",
  already_available: "This UUID is already in our care, waiting for a home.",
  none_available: "Everyone has found a home. Please check back soon.",
  unavailable: "The reception desk is unavailable. Please try again in a moment.",
};

function failureReason(service: Service, error: unknown): FailureReason {
  if (error instanceof ApiError) {
    if (error.status === 400) return "invalid_uuid";
    if (error.status === 409) return "already_available";
    if (error.status === 404 && service === "adopt") return "none_available";
  }
  return "unavailable";
}

for (const action of ["adopt", "surrender"] as const) {
  element(`${action}-tab`).addEventListener("click", () => {
    for (const tab of ["adopt", "surrender"]) {
      const selected = tab === action;
      element(`${tab}-tab`).setAttribute("aria-pressed", String(selected));
      element(`${tab}-panel`).hidden = !selected;
    }
    if (service !== action) {
      service = action;
      trackScreen();
    }
  });
  const form = element<HTMLFormElement>(`${action}-form`);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button")!;
    if (button.disabled) return;
    button.disabled = true;
    track("service_requested", { service: action });
    form.setAttribute("aria-busy", "true");
    const status = element(`${action}-status`);
    status.dataset.error = "false";
    status.textContent =
      action === "adopt"
        ? "Getting your companion ready…"
        : "Preparing a place on the farm…";
    try {
      if (action === "adopt") {
        const resident = await adopt();
        track("adoption_completed");
        showRecord(resident);
        status.textContent = "It’s official. They’re coming home with you.";
      } else {
        const resident = await surrender(
          element<HTMLInputElement>("surrender-id").value,
        );
        track("surrender_completed");
        if (latestResident?.id === resident.id) {
          latestResident = undefined;
          history.setResident("");
          element("adoption-record").hidden = true;
          element("adopt-intro").hidden = false;
          element("adopt-button-label").textContent = "Adopt a UUID";
          element("adopt-status").textContent = "";
          document.querySelector(".registrar")?.classList.remove("has-record");
        }
        status.textContent = "They’re in good hands. Welcome to the farm.";
        element<HTMLInputElement>("surrender-id").value = "";
      }
    } catch (error) {
      const reason = failureReason(action, error);
      track("service_failed", { service: action, failure_reason: reason });
      status.dataset.error = "true";
      status.textContent = failureMessages[reason];
    } finally {
      button.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });
}
