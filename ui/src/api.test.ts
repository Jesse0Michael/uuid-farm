import { test } from "node:test";
import assert from "node:assert/strict";
import { adopt, surrender, ApiError, getHistory } from "./api.ts";

const id = "123e4567-e89b-12d3-a456-426614174000";
test("adoption posts to the same-origin API and returns the resident", async () => {
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, "/v1/uuids");
    assert.equal(options?.method, "POST");
    assert.ok(options?.signal);
    return Response.json({ id });
  };
  assert.equal((await adopt(fetcher)).id, id);
});
test("surrender trims and encodes user input as one path segment", async () => {
  const fetcher: typeof fetch = async (url) => {
    assert.equal(url, "/v1/uuids/a%2Fb");
    return Response.json({ id });
  };
  await surrender(" a/b ", fetcher);
});
for (const status of [400, 404, 409, 500]) {
  test(`HTTP ${status} preserves status without trusting an HTML error body`, async () => {
    const fetcher: typeof fetch = async () =>
      new Response("<html>error</html>", { status });
    await assert.rejects(
      adopt(fetcher),
      (error) => error instanceof ApiError && error.status === status,
    );
  });
}
test("network errors reach the UI error handler", async () => {
  await assert.rejects(
    adopt(async () => {
      throw new TypeError("offline");
    }),
    /offline/,
  );
});

test("history reads one page using an encoded identity and opaque cursor", async () => {
  const body = {
    items: [{ id: "00000000000000000002", type: "adopted", date: "2026-11-15T12:00:00Z" }],
    nextCursor: "00000000000000000002",
  };
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, "/v1/uuids/a%2Fb/history?cursor=older%2Fchapter");
    assert.equal(options?.method ?? "GET", "GET");
    assert.ok(options?.signal);
    assert.equal(new Headers(options?.headers).get("Accept"), "application/json");
    return Response.json(body);
  };
  assert.deepEqual(await getHistory("a/b", "older/chapter", fetcher), body);
});

test("history accepts empty records and omits an empty cursor", async () => {
  assert.deepEqual(await getHistory(id, "", async (url) => {
    assert.equal(url, `/v1/uuids/${id}/history`);
    return Response.json({ items: [] });
  }), { items: [] });
});

for (const body of [
  null,
  {},
  { items: [null] },
  { items: [{ id: "1", type: "renamed", date: "2026-11-15T12:00:00Z" }] },
  { items: [{ id: "1", type: "adopted", date: "not a date" }] },
  { items: [{ id: "", type: "adopted", date: "2026-11-15T12:00:00Z" }] },
  { items: [], nextCursor: 3 },
]) {
  test(`history rejects malformed records: ${JSON.stringify(body)}`, async () => {
    await assert.rejects(getHistory(id, "", async () => Response.json(body)), /Invalid history/);
  });
}

test("history failures retain HTTP status without interpreting HTML", async () => {
  await assert.rejects(
    getHistory(id, "", async () => new Response("<h1>Unavailable</h1>", { status: 503 })),
    (error) => error instanceof ApiError && error.status === 503,
  );
  await assert.rejects(getHistory(id, "", async () => { throw new TypeError("offline"); }), /offline/);
});

test("changing records aborts the history request", async () => {
  const controller = new AbortController();
  await assert.rejects(getHistory(id, "", async (_url, options) => {
    assert.equal(options?.signal?.aborted, false);
    controller.abort(new Error("another resident"));
    assert.equal(options?.signal?.aborted, true);
    options?.signal?.throwIfAborted();
    return Response.json({ items: [] });
  }, controller.signal), /another resident/);
});
