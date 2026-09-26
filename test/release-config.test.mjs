import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { validateApiOrigin } from "../scripts/build-release.mjs";

test("accepts a configured HTTPS API origin", () => {
  assert.equal(
    validateApiOrigin("https://api.restaurant.example:8443/"),
    "https://api.restaurant.example:8443",
  );
});

test("rejects missing, loopback, and non-HTTPS API origins", () => {
  for (const value of [
    undefined,
    "",
    "http://api.restaurant.example",
    "https://localhost:3001",
    "https://api.localhost",
    "https://127.0.0.1:3001",
    "https://[::1]:3001",
  ]) {
    assert.throws(() => validateApiOrigin(value));
  }
});

test("rejects URL components that would change the shared API base path", () => {
  for (const value of [
    " https://api.restaurant.example",
    "https://user:password@api.restaurant.example",
    "https://api.restaurant.example/api",
    "https://api.restaurant.example?mode=release",
    "https://api.restaurant.example#fragment",
    "not-a-url",
  ]) {
    assert.throws(() => validateApiOrigin(value));
  }
});

test("check mode fails without an origin and does not start a build", () => {
  const scriptPath = fileURLToPath(
    new URL("../scripts/build-release.mjs", import.meta.url),
  );
  const env = { ...process.env };
  delete env.NEXT_PUBLIC_API_SERVER;
  const result = spawnSync(process.execPath, [scriptPath, "--check"], {
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NEXT_PUBLIC_API_SERVER/);
});
