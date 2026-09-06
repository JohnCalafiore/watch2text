import { Innertube } from "youtubei.js";

export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
}

export interface VideoMeta {
  id: string;
  title: string;
  channel: string;
  channelUrl: string;
  url: string;
  publishedDate: string;
  durationSeconds: number;
  description: string;
  keywords: string[];
}

export interface TranscriptResult {
  meta: VideoMeta;
  segments: TranscriptSegment[];
  /** "manual" = human-written captions, "auto" = ASR, "none" = Lane 2 (Whisper) territory */
  captionSource: "manual" | "auto" | "none";
  captionLanguage?: string;
  /**
   * true when YouTube returned an empty shell (no title, no duration), which
   * means the request was IP-blocked (datacenter egress without a working
   * proxy), NOT that the video lacks captions. Callers should show a
   * "temporarily unavailable / beta" message, never "no captions."
   */
  blocked?: boolean;
}

/** Extract a YouTube video ID from any common URL form (watch, youtu.be, shorts, embed) or a bare ID. */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
    if (host.endsWith("youtube.com")) {
      if (url.searchParams.get("v")) return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => ["shorts", "embed", "live", "v"].includes(p));
      if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {
    return null;
  }
  return null;
}

import { proxiedFetch } from "./proxyFetch";

let innertubePromise: Promise<Innertube> | null = null;
function getInnertube(): Promise<Innertube> {
  if (!innertubePromise) {
    innertubePromise = Innertube.create({
      retrieve_player: false,
      fetch: proxiedFetch as any,
    });
  }
  return innertubePromise;
}

interface CaptionTrack {
  base_url: string;
  language_code: string;
  kind?: string; // "asr" = auto-generated
  name?: { text?: string };
}

/** Prefer manual English > auto English > first manual > first available. */
function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  const en = tracks.filter((t) => t.language_code?.startsWith("en"));
  return (
    en.find((t) => t.kind !== "asr") ??
    en[0] ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks[0]
  );
}

/**
 * Fetch video metadata + caption transcript (Lane 1).
 *
 * Implementation notes (learned the hard way, keep these):
 * - getBasicInfo with the ANDROID client is used deliberately: the full
 *   getInfo() watch-page parser is brittle against YouTube markup changes,
 *   and the WEB client returns UNPLAYABLE from datacenter IPs. ANDROID
 *   returns playable + caption tracks reliably.
 * - The caption base_url already carries an fmt param; it must be REPLACED
 *   with json3 via URL.searchParams.set, not appended.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  const yt = await getInnertube();
  const info = await yt.getBasicInfo(videoId, { client: "ANDROID" });
  const basic = info.basic_info;

  const meta: VideoMeta = {
    id: videoId,
    title: basic.title ?? "Untitled video",
    channel: basic.author ?? "Unknown channel",
    channelUrl: basic.channel_id
      ? `https://www.youtube.com/channel/${basic.channel_id}`
      : "",
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedDate: (basic as any).start_timestamp?.toISOString?.()?.slice(0, 10) ?? "",
    durationSeconds: basic.duration ?? 0,
    description: basic.short_description ?? "",
    keywords: basic.keywords ?? [],
  };

  // Empty shell response = IP-blocked by YouTube, not a caption-less video.
  const blocked = !basic.title && !basic.duration;

  const tracks = (info.captions?.caption_tracks ?? []) as unknown as CaptionTrack[];
  const track = pickTrack(tracks);

  if (!track) {
    return { meta, segments: [], captionSource: "none", blocked };
  }

  const captionUrl = new URL(track.base_url);
  captionUrl.searchParams.set("fmt", "json3");

  const res = await proxiedFetch(captionUrl);
  if (!res.ok) {
    return { meta, segments: [], captionSource: "none" };
  }

  const data = (await res.json()) as {
    events?: Array<{
      tStartMs?: number;
      dDurationMs?: number;
      segs?: Array<{ utf8?: string }>;
    }>;
  };

  const segments: TranscriptSegment[] = (data.events ?? [])
    .filter((e) => e.segs)
    .map((e) => {
      const start = e.tStartMs ?? 0;
      return {
        text: (e.segs ?? []).map((s) => s.utf8 ?? "").join("").replace(/\n/g, " "),
        startMs: start,
        endMs: start + (e.dDurationMs ?? 0),
      };
    })
    .filter((s) => s.text.trim().length > 0);

  if (!segments.length) {
    return { meta, segments: [], captionSource: "none" };
  }

  return {
    meta,
    segments,
    captionSource: track.kind === "asr" ? "auto" : "manual",
    captionLanguage: track.language_code,
  };
}
