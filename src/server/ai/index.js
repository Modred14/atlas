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
  gemini: { label: "Google Gemini", kind: "gemini", envKey: "GEMINI_API_KEY", defaultModel: "gemini-2.5-flash" },
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
  const model = (s.model || preset.defaultModel || "").trim();
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

async function callGemini(cfg, { system, user, json, temperature, maxTokens }) {
  const data = await post(
    "Gemini",
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
    { "x-goog-api-key": cfg.apiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    },
  );
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
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
  const data = await post(
    "Gemini",
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": key },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    },
  );
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return { text, sources: chunks.map((c) => c.web).filter(Boolean) };
}
