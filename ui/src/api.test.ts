import { test } from "node:test";
import assert from "node:assert/strict";
import { adopt, surrender, ApiError, listAvailableResidents, getHistory } from "./api.ts";

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

const anotherID = "223e4567-e89b-12d3-a456-426614174000";
const thirdID = "323e4567-e89b-12d3-a456-426614174000";
test("scene residents include only valid, unique available UUIDs", async () => {
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, "/v1/uuids?limit=100");
    assert.equal(options?.method, "GET");
    assert.ok(options?.signal);
    return Response.json({
      items: [
        { id, name: "Mabel", adoptionDate: "" },
        { id: id.toUpperCase() },
        { id: anotherID, adoptionDate: "2026-11-15T10:00:00Z" },
        { id: thirdID },
        { id: "not-a-uuid" },
        { id: anotherID, adoptionDate: null },
        null,
      ],
    });
  };
  const residents = await listAvailableResidents(fetcher);
  assert.deepEqual(
    residents.map((resident) => resident.id),
    [id, thirdID],
  );
  assert.equal(residents[0].name, "Mabel");
});

test("scene residents follow the API cursor to find available residents", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url) => {
    calls++;
    if (calls === 1) {
      return Response.json({
        items: [{ id, adoptionDate: "2026-11-15T10:00:00Z" }],
        nextCursor: id,
      });
    }
    assert.equal(url, `/v1/uuids?limit=100&cursor=${id}`);
    return Response.json({ items: [{ id: anotherID }] });
  };
  assert.deepEqual(
    (await listAvailableResidents(fetcher)).map((resident) => resident.id),
    [anotherID],
  );
  assert.equal(calls, 2);
});

test("scene browsing stops after six residents or three pages", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({
      items: Array.from({ length: 20 }, (_, i) => ({
        id: `${String(i).padStart(8, "0")}-e89b-12d3-a456-426614174000`,
      })),
      nextCursor: id,
    });
  };
  assert.equal((await listAvailableResidents(fetcher)).length, 6);
  assert.equal(calls, 1);
  calls = 0;
  const emptyPages: typeof fetch = async () => {
    calls++;
    return Response.json({
      items: [],
      nextCursor: `${String(calls).padStart(8, "0")}-e89b-12d3-a456-426614174000`,
    });
  };
  assert.deepEqual(await listAvailableResidents(emptyPages), []);
  assert.equal(calls, 3);
});

test("scene browsing stops on a repeated cursor", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({ items: [], nextCursor: id });
  };
  assert.deepEqual(await listAvailableResidents(fetcher), []);
  assert.equal(calls, 2);
});

for (const body of [
  null,
  {},
  { items: {} },
  { items: [], nextCursor: 4 },
  { items: [], nextCursor: "invalid" },
]) {
  test(`scene rejects malformed list responses: ${JSON.stringify(body)}`, async () => {
    await assert.rejects(
      listAvailableResidents(async () => Response.json(body)),
      /Invalid residents/,
    );
  });
}

test("scene HTTP and network errors reach the fallback handler", async () => {
  await assert.rejects(
    listAvailableResidents(async () => new Response("", { status: 503 })),
    (error) => error instanceof ApiError && error.status === 503,
  );
  await assert.rejects(
    listAvailableResidents(async () => {
      throw new TypeError("offline");
    }),
    /offline/,
  );
});

test("scene browsing respects abort before fetching and between pages", async () => {
  const aborted = AbortSignal.abort(new Error("leave scene"));
  let calls = 0;
  await assert.rejects(
    listAvailableResidents(async () => {
      calls++;
      return Response.json({ items: [] });
    }, aborted),
    /leave scene/,
  );
  assert.equal(calls, 0);
  const controller = new AbortController();
  await assert.rejects(
    listAvailableResidents(async (_url, options) => {
      calls++;
      assert.equal(options?.signal?.aborted, false);
      controller.abort(new Error("leave scene"));
      assert.equal(options?.signal?.aborted, true);
      return Response.json({ items: [], nextCursor: id });
    }, controller.signal),
    /leave scene/,
  );
  assert.equal(calls, 1);
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
