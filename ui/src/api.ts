import type { components } from "./api-types.ts";

export type Resident = components["schemas"]["Uuid"];
export type HistoryPage = components["schemas"]["HistoryPage"];
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requestResident(
  path: string,
  fetcher: typeof fetch = fetch,
): Promise<Resident> {
  const response = await fetcher(`/v1${path}`, {
    method: "POST",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Request failed (${response.status})`);
  }
  const resident: Resident = await response.json();
  if (typeof resident.id !== "string")
    throw new Error("Invalid resident response");
  return resident;
}

export function surrender(
  id: string,
  fetcher?: typeof fetch,
): Promise<Resident> {
  return requestResident(`/uuids/${encodeURIComponent(id.trim())}`, fetcher);
}
export function adopt(fetcher?: typeof fetch): Promise<Resident> {
  return requestResident("/uuids", fetcher);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Fetch one page of recorded arrivals and adoptions, most recent first. */
export async function getHistory(
  id: string,
  cursor = "",
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<HistoryPage> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  const deadline = AbortSignal.timeout(10_000);
  const response = await fetcher(
    `/v1/uuids/${encodeURIComponent(id)}/history${query}`,
    {
      headers: { Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    },
  );
  if (!response.ok)
    throw new ApiError(response.status, `Request failed (${response.status})`);
  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    !Array.isArray(body.items) ||
    !body.items.every(
      (event) =>
        isRecord(event) &&
        typeof event.id === "string" &&
        event.id.length > 0 &&
        (event.type === "surrendered" || event.type === "adopted") &&
        typeof event.date === "string" &&
        Number.isFinite(Date.parse(event.date)),
    ) ||
    (body.nextCursor !== undefined && typeof body.nextCursor !== "string")
  ) {
    throw new Error("Invalid history response");
  }
  return body as HistoryPage;
}
