import { NextRequest, NextResponse } from "next/server";
import { extractVideoId, fetchTranscript } from "@/lib/transcript";
import { buildMarkdown, suggestFilename } from "@/lib/markdown";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { url?: string; includeTimestamps?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const videoId = extractVideoId(body.url ?? "");
  if (!videoId) {
    return NextResponse.json(
      { error: "That doesn't look like a YouTube URL or video ID." },
      { status: 400 }
    );
  }

  try {
    const result = await fetchTranscript(videoId);

    if (result.blocked) {
      // IP-blocked upstream (datacenter egress). Beta-waitlist response, not an error blame-shift.
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
      // Lane 2 upsell moment: no captions available.
      return NextResponse.json(
        {
          error: "no_captions",
          message:
            "This video has no captions available. Whisper transcription (coming soon) will handle caption-less videos.",
          meta: result.meta,
        },
        { status: 422 }
      );
    }

    const markdown = buildMarkdown(result, {
      includeTimestamps: body.includeTimestamps ?? true,
    });

    return NextResponse.json({
      markdown,
      filename: suggestFilename(result.meta.title),
      meta: result.meta,
      stats: {
        segments: result.segments.length,
        words: markdown.split(/\s+/).length,
      },
    });
  } catch (err) {
    console.error("transcribe error:", err);
    return NextResponse.json(
      { error: "Couldn't fetch that video. It may be private, region-locked, or removed." },
      { status: 502 }
    );
  }
}
