/**
 * Proxy-aware fetch used for ALL YouTube traffic.
 *
 * Why this exists: YouTube returns empty/blocked responses to datacenter IPs
 * (Vercel, AWS). When PROXY_URL is set we route through it using undici's own
 * fetch, because the platform-patched global fetch is not guaranteed to honor
 * the `dispatcher` option. Locally, with PROXY_URL unset, this is global fetch.
 *
 * NOTE (tested Aug 2026): datacenter proxies (e.g. Webshare free tier) are
 * blocked by YouTube exactly like Vercel's own IPs. Only a RESIDENTIAL proxy
 * unblocks production. Wiring verified working: egress IP matched the proxy.
 *
 * FAIL-FAST: a dead or slow proxy used to hang requests for ~45s. Every proxied
 * request now has a hard timeout and falls back to a direct fetch, so the worst
 * case is a fast, honest "blocked" response instead of a stalled page.
 *
 * youtubei.js sometimes calls fetch with a Request OBJECT built from the
 * platform's global Request class. undici's fetch rejects foreign Request
 * instances, so we unwrap them into (url, init) form before forwarding.
 */

import { fetch as ufetch, ProxyAgent } from "undici";

const proxyUrl = process.env.PROXY_URL;
const PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS ?? 8000);

let impl: (input: any, init?: any) => Promise<any> = fetch as any;

if (proxyUrl) {
  // Static import (not require) so this module works in both the Next.js
  // server bundle and the ESM CLI bundle.
  const dispatcher = new ProxyAgent(proxyUrl);

  /** Normalize a Request object (possibly foreign) into (url, init). */
  const unwrap = async (input: any, init?: any) => {
    if (input && typeof input === "object" && typeof input.url === "string") {
      const headers: Record<string, string> = {};
      if (input.headers && typeof input.headers.forEach === "function") {
        input.headers.forEach((v: string, k: string) => (headers[k] = v));
      }
      let body: any = undefined;
      if (input.method && !["GET", "HEAD"].includes(input.method.toUpperCase())) {
        body = await input.clone().text();
      }
      return [input.url, { method: input.method ?? "GET", headers, body, ...init }] as const;
    }
    return [input, { ...init }] as const;
  };

  impl = async (input: any, init?: any) => {
    const [url, opts] = await unwrap(input, init);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), PROXY_TIMEOUT_MS);
    try {
      return await ufetch(url, { ...opts, dispatcher, signal: ac.signal });
    } catch (err) {
      // Dead/slow/misconfigured proxy: don't strand the request.
      console.warn("proxy fetch failed, falling back to direct:", String(err).slice(0, 120));
      return await fetch(url as any, opts as any);
    } finally {
      clearTimeout(timer);
    }
  };
}

export const proxiedFetch = ((input: any, init?: any) => impl(input, init)) as typeof fetch;

/** Safe-to-log proxy status: never exposes credentials. */
export function proxyInfo(): { set: boolean; host?: string; port?: string } {
  if (!proxyUrl) return { set: false };
  try {
    const u = new URL(proxyUrl);
    return { set: true, host: u.hostname, port: u.port };
  } catch {
    return { set: true, host: "unparseable-url" };
  }
}
