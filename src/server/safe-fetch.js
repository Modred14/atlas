// src/server/safe-fetch.js
import dns from "node:dns/promises";
import net from "node:net";

// Atlas fetches third-party websites (company sites, CV source). Every hop is validated so a hostile
// redirect or DNS answer can never point the server at localhost, a cloud metadata IP or a private network.
export const resolver = { lookup: (host) => dns.lookup(host, { all: true }) };

const UA = "AtlasOutreachBot/1.0";

function ipv4Private(ip) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("::ffff:")) {
    const mapped = v.slice(7);
    return net.isIPv4(mapped) ? ipv4Private(mapped) : true;
  }
  return /^(fc|fd|fe[89ab])/.test(v);
}

export async function assertPublicUrl(raw) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Non-standard ports are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private addresses are not allowed");
    return url;
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Private hostnames are not allowed");
  }
  const addrs = await resolver.lookup(host);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("Host resolves to a private address");
  }
  return url;
}

async function readCapped(res, maxBytes, truncate) {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {}
      if (truncate) {
        chunks.push(value.subarray(0, Math.max(0, value.length - (total - maxBytes))));
        break;
      }
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function safeFetch(
  raw,
  { timeoutMs = 8000, maxBytes = 1_500_000, headers = {}, maxRedirects = 3, truncate = false } = {},
) {
  let target = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(target);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": UA, accept: "*/*", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect without a Location header");
      target = new URL(loc, url).toString();
      continue;
    }
    const body = await readCapped(res, maxBytes, truncate);
    return {
      ok: res.ok,
      status: res.status,
      url: url.toString(),
      contentType: res.headers.get("content-type") || "",
      contentDisposition: res.headers.get("content-disposition") || "",
      body,
    };
  }
  throw new Error("Too many redirects");
}
