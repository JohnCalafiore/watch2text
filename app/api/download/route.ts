import { NextRequest, NextResponse } from "next/server";
import { clearFinishedJobs, listJobs, startDownload, type Quality } from "@/lib/downloader";
import { guard } from "@/lib/localGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUALITIES: Quality[] = ["720", "1080", "audio"];

/** Current and recent download jobs (the library page polls this). */
export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  return NextResponse.json({ jobs: listJobs() });
}

/** Start a download: { url, quality: "720" | "1080" | "audio", transcript?: boolean } */
export async function POST(req: NextRequest) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  let body: { url?: string; quality?: string; transcript?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Paste a full video or playlist link." }, { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return NextResponse.json({ error: "Only http(s) links are supported." }, { status: 400 });
  }
  const quality = (QUALITIES as string[]).includes(body.quality ?? "") ? (body.quality as Quality) : "720";
  const job = startDownload(parsed.toString(), quality, Boolean(body.transcript));
  return NextResponse.json({ job }, { status: 202 });
}

/** Clear finished and failed jobs from the list. */
export async function DELETE(req: NextRequest) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  clearFinishedJobs();
  return NextResponse.json({ ok: true });
}
