import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticsMode } from "./analytics.ts";

const config = { measurementId: "G-TEST000001", hostname: "uuid.farm" };

test("only a production build on the configured host can load Google", () => {
  assert.equal(analyticsMode(config, "uuid.farm", true, false), "live");
  assert.equal(analyticsMode(config, "preview.uuid.farm", true, true), "off");
  assert.equal(analyticsMode(config, "127.0.0.1", true, false), "off");
  assert.equal(analyticsMode({ measurementId: config.measurementId }, "uuid.farm", true, false), "off");
  assert.equal(analyticsMode(config, "uuid.farm", false, false), "off");
  assert.equal(analyticsMode(config, "localhost", false, true), "debug");
});

test("missing or invalid IDs disable collection even in debug", () => {
  for (const measurementId of ["", "UA-123", "G-BAD&extra=1", "g-lowercase"]) {
    const invalid = { ...config, measurementId };
    assert.equal(analyticsMode(invalid, config.hostname, true, false), "off");
    assert.equal(analyticsMode(invalid, "localhost", false, true), "off");
  }
  assert.equal(analyticsMode(undefined, config.hostname, true, false), "off");
});
