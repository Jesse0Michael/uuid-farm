import { getHistory } from "./api.ts";
import "./history.css";

/** Check for earlier visits after adoption; changing residents cancels old reads. */
export function createHistory(details: HTMLDetailsElement) {
  const list = details.querySelector<HTMLOListElement>("ol")!;
  const status = details.querySelector<HTMLElement>("[role=status]")!;
  const more = details.querySelector<HTMLButtonElement>("button")!;
  const dates = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  let residentID = "";
  let cursor = "";
  let pending: AbortController | undefined;
  const seen = new Set<string>();

  async function load() {
    if (!residentID || pending) return;
    const controller = new AbortController();
    pending = controller;
    more.disabled = true;
    status.textContent = "Opening their records…";
    list.setAttribute("aria-busy", "true");
    try {
      const page = await getHistory(residentID, cursor, fetch, controller.signal);
      if (controller.signal.aborted) return;
      for (const event of page.items) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        const item = document.createElement("li");
        const label = document.createElement("span");
        label.textContent =
          event.type === "surrendered" ? "Welcomed to the farm" : "Found a home";
        const date = document.createElement("time");
        date.dateTime = event.date;
        date.textContent = dates.format(new Date(event.date));
        item.append(label, date);
        list.append(item);
      }
      const next = page.nextCursor ?? "";
      // The current arrival and adoption already appear on the record above.
      details.hidden = seen.size <= 2 && !next;
      more.hidden = !next || next === cursor;
      cursor = next;
      more.textContent = "Earlier chapters";
      status.textContent = seen.size
        ? "Most recent first. Every recorded beginning, kept with care."
        : "No earlier chapters have been recorded.";
    } catch {
      if (controller.signal.aborted) return;
      status.textContent = "Their history is unavailable for the moment.";
      more.textContent = "Try their records again";
      more.hidden = false;
    } finally {
      if (pending === controller) {
        pending = undefined;
        more.disabled = false;
        list.removeAttribute("aria-busy");
      }
    }
  }

  more.addEventListener("click", () => void load());
  window.addEventListener("pagehide", () => pending?.abort());

  return {
    setResident(id: string) {
      pending?.abort();
      pending = undefined;
      residentID = id;
      cursor = "";
      seen.clear();
      details.hidden = true;
      details.open = false;
      list.replaceChildren();
      list.removeAttribute("aria-busy");
      status.textContent = "";
      more.hidden = true;
      more.disabled = false;
      if (residentID) void load();
    },
  };
}
