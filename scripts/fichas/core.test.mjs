import assert from "node:assert/strict";
import test from "node:test";
import {
  createIdentity,
  isCalendarDate,
  isHttpUrl,
  parseArgs,
} from "./core.mjs";
import { DATE, URL } from "./test-support.mjs";

test("argumentos obligatorios, opciones y valores válidos", () => {
  assert.deepEqual(parseArgs(["--url", URL, "--fecha", DATE, "--force"]), {
    date: DATE,
    url: URL,
    force: true,
    help: false,
  });
  assert.equal(parseArgs(["--help"]).help, true);
  for (const args of [
    [],
    ["--fecha", DATE],
    ["--url", URL],
    ["--fecha"],
    ["--url", "--fecha", DATE],
    ["--otro"],
    ["--force", "--force"],
    ["--fecha", DATE, "--fecha", DATE],
    ["--help", "suelto"],
  ])
    assert.throws(() => parseArgs(args));
});

test("calendario gregoriano estricto, incluidos años anteriores a 100", () => {
  for (const date of [
    "2024-02-29",
    "2000-02-29",
    "0001-01-01",
    "0099-12-31",
    "9999-12-31",
  ])
    assert.equal(isCalendarDate(date), true, date);
  for (const date of [
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-1-01",
    "0000-01-01",
    "2026-10-01T00:00:00Z",
    " 2026-10-01",
    null,
  ])
    assert.equal(isCalendarDate(date), false, String(date));
});

test("HTTP(S) absoluto sin normalización silenciosa ni credenciales", () => {
  for (const url of [
    URL,
    "http://localhost:8080/a?b=2#x",
    "https://ejemplo.org/ruta/á?x=%2f&b=1#parte",
  ])
    assert.equal(isHttpUrl(url), true);
  for (const url of [
    "/relativa",
    "ftp://ejemplo.org",
    "file:///etc/passwd",
    "https:ejemplo.org",
    "https:///",
    "https://u:p@ejemplo.org",
    "https://ejemplo.org/a b",
    "https://ejemplo.org/a\nb",
    "https://ejemplo.org\\b",
    "javascript:alert(1)",
  ])
    assert.equal(isHttpUrl(url), false);
});

test("vector SHA-256 independiente de Python hashlib, UTF-8 y LF exactos", () => {
  const original = `  ${URL}\n`;
  const identity = createIdentity(DATE, original);
  // Fixed independent vector, not calculated with the implementation under test.
  assert.equal(
    identity.key,
    "d5b50eab0c74076def0a2cce1d89b89c029724004f5e0a949d27afa1ac98d508",
  );
  assert.equal(identity.originalUrl, original);
  assert.equal(identity.url, URL);
  assert.equal(createIdentity(DATE, URL).key, identity.key);
  for (const url of [`${URL}#x`, `${URL}?a=1&b=2`, `${URL}/`])
    assert.notEqual(createIdentity(DATE, url).key, identity.key);
  const variant = "https://EJEMPLO.org:443/a/../b?z=%2f&a=2#Frag";
  assert.equal(createIdentity(DATE, variant).url, variant);
  assert.notEqual(createIdentity("2026-10-02", URL).key, identity.key);
});
