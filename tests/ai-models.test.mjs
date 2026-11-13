// tests/ai-models.test.mjs
// Regression tests for the Oct 2026 outage: gemini-2.5-flash was shut down, so every AI call 404'd.
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, mockFetch } from "./helpers.mjs";

const { setSecret, setSetting } = await import("../src/server/settings.js");
const { complete, effectiveGeminiModel } = await import("../src/server/ai/index.js");
const { explainServerError } = await import("../src/server/errors.js");

const ok = (text = '{"subject":"Hi","body":"Hello"}') => ({ candidates: [{ content: { parts: [{ text }] } }] });
const geminiUrl = (calls) => calls.filter((c) => c.url.includes(":generateContent")).map((c) => c.url);

test("retired Gemini model names are swapped for the current default", async () => {
  assert.equal(effectiveGeminiModel("gemini-2.5-flash"), "gemini-3.5-flash");
  assert.equal(effectiveGeminiModel("gemini-2.0-flash-lite"), "gemini-3.5-flash");
  assert.equal(effectiveGeminiModel(""), "gemini-3.5-flash");
  assert.equal(effectiveGeminiModel("gemini-3.1-flash-lite"), "gemini-3.1-flash-lite");

  await freshDb();
  await setSecret("ai_key:gemini", "k");
  await setSetting("ai", { provider: "gemini", model: "gemini-2.5-flash" });
  const m = mockFetch([["generateContent", ok()]]);
  try {
    await complete({ system: "s", user: "u" });
    assert.match(geminiUrl(m.calls)[0], /models\/gemini-3\.5-flash:generateContent/);
  } finally {
    m.restore();
  }
});

test("a 404 from Gemini falls back to the newest flash model the key can use", async () => {
  await freshDb();
  await setSecret("ai_key:gemini", "k");
  await setSetting("ai", { provider: "gemini", model: "gemini-3.5-flash" });
  const m = mockFetch([
    ["models/gemini-3.5-flash:generateContent", { status: 404, body: { error: { message: "no longer available" } } }],
    [
      "/v1beta/models?pageSize",
      {
        models: [
          { name: "models/gemini-3.9-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.10-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.9-flash-image", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-embedding-2", supportedGenerationMethods: ["embedContent"] },
        ],
      },
    ],
    ["models/gemini-3.10-flash:generateContent", ok()],
  ]);
  try {
    const out = await complete({ system: "s", user: "u" });
    assert.equal(out.text, '{"subject":"Hi","body":"Hello"}');
    assert.match(geminiUrl(m.calls).at(-1), /gemini-3\.10-flash/);
  } finally {
    m.restore();
  }
});

test("Gemini gets enough output tokens that thinking cannot starve the answer", async () => {
  await freshDb();
  await setSecret("ai_key:gemini", "k");
  const m = mockFetch([["generateContent", ok()]]);
  try {
    await complete({ system: "s", user: "u", maxTokens: 1500 });
    const body = JSON.parse(m.calls.find((c) => c.url.includes("generateContent")).body);
    assert.ok(body.generationConfig.maxOutputTokens >= 6000);
  } finally {
    m.restore();
  }
});

test("common deployment errors are explained instead of a vague 500", () => {
  assert.match(explainServerError(new Error("DATABASE_URL is not set")), /DATABASE_URL/);
  assert.match(explainServerError(Object.assign(new Error('relation "companies" does not exist'), { code: "42P01" })), /npm run migrate/);
  assert.match(explainServerError(Object.assign(new Error("x"), { code: "28P01" })), /password/);
  assert.match(explainServerError(new Error("timeout exceeded when trying to connect")), /connect to the database/);
  assert.match(explainServerError(new Error("ENCRYPTION_KEY is not set")), /ENCRYPTION_KEY/);
  assert.equal(explainServerError(new Error("something else")), null);
});
