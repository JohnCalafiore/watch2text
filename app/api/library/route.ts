import { NextRequest, NextResponse } from "next/server";
import { deleteLibraryItem, listLibrary, setDownloadsDir, toolStatus } from "@/lib/downloader";
import { guard } from "@/lib/localGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Downloaded files plus tool status (yt-dlp, ffmpeg, folder). */
export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  const [tools, items] = await Promise.all([toolStatus(), Promise.resolve(listLibrary())]);
  return NextResponse.json({ tools, items });
}

/** Change the downloads folder: { downloads: "C:\\Users\\me\\Videos\\Watch2Text" } */
export async function POST(req: NextRequest) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  let body: { downloads?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const dir = (body.downloads ?? "").trim();
  if (!dir) return NextResponse.json({ error: "Folder path is required." }, { status: 400 });
  try {
    return NextResponse.json({ downloads: setDownloadsDir(dir) });
  } catch (err) {
    return NextResponse.json({ error: `Couldn't use that folder: ${String((err as Error).message).slice(0, 160)}` }, { status: 400 });
  }
}

/** Delete a downloaded file and its thumbnail/transcript: { path } */
export async function DELETE(req: NextRequest) {
  const denied = guard(req, { write: true });
  if (denied) return denied;
  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const ok = deleteLibraryItem(body.path ?? "");
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "File not found." }, { status: 404 });
}
