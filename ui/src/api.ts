import type { components } from "./api-types.ts";

export type Resident = components["schemas"]["Uuid"];
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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResident(value: unknown): value is Resident {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    uuidPattern.test(value.id) &&
    ["name", "tag", "surrenderDate", "adoptionDate"].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    )
  );
}

/** A bounded glimpse of residents for the scene, never a full collection scan.
 * Empty or failed requests let the caller choose decorative fallback creatures.
 * All three pages share one deadline so the scene does not wait indefinitely.
 */
export async function listAvailableResidents(
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Resident[]> {
  const deadline = AbortSignal.timeout(8_000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const residents: Resident[] = [];
  const seenIDs = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor = "";

  for (let page = 0; page < 3; page++) {
    requestSignal.throwIfAborted();
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const response = await fetcher(`/v1/uuids?${query}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: requestSignal,
    });
    if (!response.ok)
      throw new ApiError(
        response.status,
        `Request failed (${response.status})`,
      );
    const body: unknown = await response.json();
    requestSignal.throwIfAborted();
    if (!isRecord(body) || !Array.isArray(body.items))
      throw new Error("Invalid residents response");

    for (const candidate of body.items.slice(0, 100)) {
      if (!isResident(candidate) || candidate.adoptionDate) continue;
      const id = candidate.id.toLowerCase();
      if (seenIDs.has(id)) continue;
      seenIDs.add(id);
      residents.push({ ...candidate, id });
      if (residents.length === 6) return residents;
    }
    if (body.nextCursor === undefined || body.nextCursor === "") break;
    if (
      typeof body.nextCursor !== "string" ||
      !uuidPattern.test(body.nextCursor)
    ) {
      throw new Error("Invalid residents cursor");
    }
    cursor = body.nextCursor;
    if (seenCursors.has(cursor)) break;
    seenCursors.add(cursor);
  }
  return residents;
}
