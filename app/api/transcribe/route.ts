import { NextRequest, NextResponse } from "next/server";
import { extractVideoId, fetchTranscript } from "@/lib/transcript";
import { buildMarkdown, suggestFilename } from "@/lib/markdown";
import { fetchArticle, isWebUrl } from "@/lib/article";
import { whisperSegments } from "@/lib/whisper";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { url?: string; includeTimestamps?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = (body.url ?? "").trim();
  const videoId = extractVideoId(input);

  // Article lane: any non-YouTube web page.
  if (!videoId) {
    if (!isWebUrl(input)) {
      return NextResponse.json({ error: "That doesn't look like a YouTube URL or a web address." }, { status: 400 });
    }
    try {
      const a = await fetchArticle(input);
      return NextResponse.json({
        markdown: a.markdown,
        filename: a.filename,
        meta: { title: a.title, channel: a.siteName, kind: "article" },
        stats: { segments: 0, words: a.words },
      });
    } catch (err) {
      return NextResponse.json({ error: `Couldn't read that page: ${String((err as Error).message).slice(0, 160)}` }, { status: 502 });
    }
  }

  try {
    const result = await fetchTranscript(videoId);

    if (result.blocked) {
      return NextResponse.json(
        {
          error: "beta",
          message:
            "Watch2Text is in private beta while we scale up video fetching. Join the waitlist and we'll let you in the moment it opens:",
          meta: result.meta,
        },
        { status: 503 }
      );
    }

    if (result.captionSource === "none") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          {
            error: "no_captions",
            message:
              "This video has no captions. Running locally? Add OPENAI_API_KEY to .env.local (and install yt-dlp) and Watch2Text will transcribe the audio with Whisper.",
            meta: result.meta,
          },
          { status: 422 }
        );
      }
      result.segments = await whisperSegments(videoId, { apiKey });
      result.captionSource = "whisper";
    }

    const markdown = buildMarkdown(result, { includeTimestamps: body.includeTimestamps ?? true });
    return NextResponse.json({
      markdown,
      filename: suggestFilename(result.meta.title),
      meta: { ...result.meta, kind: "video", captionSource: result.captionSource },
      stats: { segments: result.segments.length, words: markdown.split(/\s+/).length },
    });
  } catch (err) {
    console.error("transcribe error:", err);
    return NextResponse.json(
      { error: `Couldn't process that video: ${String((err as Error).message ?? err).slice(0, 160)}` },
      { status: 502 }
    );
  }
}
