// src/server/ai/index.js
import { getSecret, getSetting } from "../settings.js";
import { sleep } from "../util.js";

export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

// One interface, three wire formats. Anything OpenAI-compatible (Groq, OpenRouter, OpenAI, local
// gateways) goes through the "openai" kind; pick "custom" and set a base URL for others.
export const PROVIDERS = {
  gemini: { label: "Google Gemini", kind: "gemini", envKey: "GEMINI_API_KEY", defaultModel: "gemini-3.5-flash" },
  groq: {
    label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY", defaultModel: "llama-3.3-70b-versatile",
  },
  openrouter: {
    label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY", defaultModel: "",
  },
  openai: {
    label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY", defaultModel: "",
  },
  anthropic: { label: "Anthropic Claude", kind: "anthropic", envKey: "ANTHROPIC_API_KEY", defaultModel: "" },
  custom: { label: "Custom (OpenAI-compatible)", kind: "openai", envKey: "CUSTOM_AI_API_KEY", defaultModel: "" },
};

export async function getApiKey(provider) {
  const preset = PROVIDERS[provider];
  if (!preset) return null;
  return (await getSecret(`ai_key:${provider}`)) || process.env[preset.envKey] || null;
}

export async function getAiConfig() {
  const s = await getSetting("ai");
  const preset = PROVIDERS[s.provider];
  if (!preset) throw new AiError(`Unknown AI provider "${s.provider}". Pick one in Settings → AI.`, 400);
  const apiKey = await getApiKey(s.provider);
  if (!apiKey) {
    throw new AiError(`No API key for ${preset.label}. Add one in Settings → AI (or set ${preset.envKey}).`, 400);
  }
  const model = (s.provider === "gemini" ? effectiveGeminiModel(s.model) : s.model || preset.defaultModel || "").trim();
  if (!model) throw new AiError(`Choose a model for ${preset.label} in Settings → AI.`, 400);
  const baseUrl = (s.provider === "custom" ? s.baseUrl : preset.baseUrl || "").replace(/\/$/, "");
  if (preset.kind === "openai" && !baseUrl) throw new AiError("Set a base URL for the custom provider in Settings → AI.", 400);
  return { provider: s.provider, label: preset.label, kind: preset.kind, model, baseUrl, apiKey, settings: s };
}

function describeFailure(label, status, data) {
  const detail = data?.error?.message || data?.error || data?.message || "";
  const msg = typeof detail === "string" ? detail : JSON.stringify(detail);
  if (status === 401 || status === 403) return `${label} rejected the API key (HTTP ${status}). Check it in Settings → AI.`;
  if (status === 404) return `${label} could not find that model. Check the model name in Settings → AI. ${msg}`.trim();
  if (status === 429) return `${label} rate limit or free-tier quota reached. Wait a bit or switch provider in Settings → AI.`;
  return `${label} error (HTTP ${status}). ${msg}`.trim();
}

async function post(label, url, headers, body, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      if (attempt < retries) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      throw new AiError(`Could not reach ${label}: ${err.message}`);
    }
    const data = await res.json().catch(() => null);
    if (res.ok) return data;
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = Math.min(Number(res.headers.get("retry-after")) || 1.5 * (attempt + 1), 15);
      await sleep(wait * 1000);
      continue;
    }
    const err = new AiError(describeFailure(label, res.status, data), res.status === 429 ? 429 : 502);
    err.providerStatus = res.status;
    err.raw = data;
    throw err;
  }
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Google retires Gemini models on a fixed schedule (2.0 in June 2026, 2.5 on 16 Oct 2026). A saved
// setting or old default naming one of them would 404 forever, so such names are swapped for the default.
const GEMINI_RETIRED = /^gemini-(1\.\d+|2\.0|2\.5)(-|$)/;

export function effectiveGeminiModel(requested) {
  const m = String(requested || "").trim();
  return !m || GEMINI_RETIRED.test(m) ? PROVIDERS.gemini.defaultModel : m;
}

const versionOf = (name) => (/^gemini-(\d+)(?:\.(\d+))?-flash$/.exec(name) || []).slice(1).map((n) => Number(n || 0));
const newer = (a, b) => versionOf(b)[0] - versionOf(a)[0] || versionOf(b)[1] - versionOf(a)[1];

// Newest plain "flash" model this key can call, discovered from the API itself so a future retirement
// does not break the app again.
async function listGeminiFlashModels(apiKey) {
  try {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return (data?.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n))
      .sort(newer);
  } catch {
    return [];
  }
}

let geminiSubstitute = null; // { from, to }: remembered for the life of the server process

async function geminiGenerate(apiKey, requested, body) {
  const model = geminiSubstitute?.from === requested ? geminiSubstitute.to : effectiveGeminiModel(requested);
  const call = (m) => post("Gemini", `${GEMINI_BASE}/models/${encodeURIComponent(m)}:generateContent`, { "x-goog-api-key": apiKey }, body);
  try {
    return await call(model);
  } catch (err) {
    if (err.providerStatus !== 404) throw err;
    const [next] = (await listGeminiFlashModels(apiKey)).filter((n) => n !== model);
    if (!next) throw err;
    const data = await call(next);
    geminiSubstitute = { from: requested, to: next };
    console.warn(`[ai] Gemini model "${model}" is unavailable; using "${next}". Update Settings → AI.`);
    return data;
  }
}

async function callGemini(cfg, { system, user, json, temperature, maxTokens }) {
  const data = await geminiGenerate(cfg.apiKey, cfg.model, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      // Gemini's internal "thinking" tokens count against this limit; a tight cap leaves no room for the answer.
      maxOutputTokens: Math.max(maxTokens * 4, 8192),
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  });
  const text = (data?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  if (!text) {
    const why = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "empty response";
    throw new AiError(`Gemini returned no text (${why}).`);
  }
  return text;
}

async function callOpenAi(cfg, { system, user, json, temperature, maxTokens }) {
  const build = (withFormat) => ({
    model: cfg.model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(json && withFormat ? { response_format: { type: "json_object" } } : {}),
  });
  const url = `${cfg.baseUrl}/chat/completions`;
  const headers = { authorization: `Bearer ${cfg.apiKey}` };
  let data;
  try {
    data = await post(cfg.label, url, headers, build(true));
  } catch (err) {
    if (json && err.providerStatus === 400 && /response_format|json/i.test(JSON.stringify(err.raw || ""))) {
      data = await post(cfg.label, url, headers, build(false));
    } else throw err;
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new AiError(`${cfg.label} returned no text.`);
  return text;
}

async function callAnthropic(cfg, { system, user, temperature, maxTokens }) {
  const data = await post(
    "Anthropic",
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    { model: cfg.model, max_tokens: maxTokens, temperature, system, messages: [{ role: "user", content: user }] },
  );
  const text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!text) throw new AiError("Anthropic returned no text.");
  return text;
}

export async function complete({ system, user, json = false, temperature = 0.7, maxTokens = 2048 }) {
  const cfg = await getAiConfig();
  const args = { system, user, json, temperature, maxTokens };
  const text =
    cfg.kind === "gemini" ? await callGemini(cfg, args)
    : cfg.kind === "anthropic" ? await callAnthropic(cfg, args)
    : await callOpenAi(cfg, args);
  return { text, provider: cfg.provider, model: cfg.model };
}

export function parseJsonLoose(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {}
  }
  throw new AiError("The model did not return valid JSON. Try again or pick a different model.");
}

export async function completeJson(opts) {
  const { text, provider, model } = await complete({ ...opts, json: true });
  return { data: parseJsonLoose(text), provider, model };
}

// Web-grounded answer via Gemini's Google Search tool. Independent of the provider chosen for writing:
// it only needs a Gemini key. Returns null when no Gemini key exists.
export async function groundedSearch(prompt) {
  const key = await getApiKey("gemini");
  if (!key) return null;
  const s = await getSetting("ai");
  const model = s.provider === "gemini" && s.model ? s.model : PROVIDERS.gemini.defaultModel;
  const data = await geminiGenerate(key, model, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
  });
  const text = (data?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return { text, sources: chunks.map((c) => c.web).filter(Boolean) };
}