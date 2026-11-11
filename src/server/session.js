// src/server/session.js
// Signed session cookie using Web Crypto, so the same code runs in proxy.js and route handlers.
export const SESSION_COOKIE = "atlas_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

const enc = new TextEncoder();

function toB64Url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  return atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function sign(secret, data) {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toB64Url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data))));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret) {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  const payload = toB64Url(
    enc.encode(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
        n: toB64Url(crypto.getRandomValues(new Uint8Array(12))),
      }),
    ),
  );
  return `${payload}.${await sign(secret, payload)}`;
}

export async function verifySessionToken(token, secret) {
  if (!token || !secret || secret.length < 32) return false;
  const [payload, sig] = String(token).split(".");
  if (!payload || !sig) return false;
  if (!safeEqual(await sign(secret, payload), sig)) return false;
  try {
    const { exp } = JSON.parse(fromB64Url(payload));
    return typeof exp === "number" && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
