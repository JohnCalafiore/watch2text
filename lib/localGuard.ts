/**
 * Guards for the local-only routes (download lane, library).
 *
 * 1. Off on the hosted site: Vercel never downloads videos.
 * 2. Host check: only answer to localhost or a Tailscale name (*.ts.net),
 *    so a random website can't reach the app through DNS rebinding.
 * 3. Writes must send Content-Type: application/json. Browsers can't send
 *    that cross-site without a CORS preflight, which this app never approves,
 *    so another tab can't quietly start downloads or delete files.
 *
 * Set WATCH2TEXT_ALLOWED_HOSTS=host1,host2 to allow other names.
 */
import { NextRequest, NextResponse } from "next/server";
import { isHosted } from "./downloader";

function hostAllowed(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".ts.net")) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(host)) return true; // Tailscale 100.64.0.0/10
  const extra = (process.env.WATCH2TEXT_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return extra.includes(host);
}

/** Returns an error response if the request should be refused, else null. */
export function guard(req: NextRequest, opts: { write?: boolean } = {}): NextResponse | null {
  if (isHosted()) return NextResponse.json({ error: "not_available" }, { status: 404 });
  if (!hostAllowed(req.headers.get("host"))) {
    return NextResponse.json({ error: "This page only works from this computer or your Tailscale network." }, { status: 403 });
  }
  if (opts.write && !(req.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
  }
  return null;
}
