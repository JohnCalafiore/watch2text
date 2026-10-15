import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { contentTypeFor, resolveLibraryPath } from "@/lib/downloader";
import { guard } from "@/lib/localGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve a library file. Supports HTTP Range requests so video can seek and
 * stream (browsers and iPhones need this). ?dl=1 makes it a download.
 */
export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  const rel = req.nextUrl.searchParams.get("path") ?? "";
  const abs = resolveLibraryPath(rel);
  if (!abs) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const size = statSync(abs).size;
  const type = contentTypeFor(abs);
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0",
  };
  if (req.nextUrl.searchParams.get("dl") === "1") {
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(basename(abs))}`;
  }

  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
    let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new NextResponse(stream, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}
