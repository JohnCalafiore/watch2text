/**
 * Whisper lane: videos with no captions.
 *
 *   1. yt-dlp downloads the smallest usable audio track to a temp file.
 *      (yt-dlp, not youtubei.js: YouTube's media URLs now need proof-of-origin
 *      tokens that yt-dlp tracks weekly. Reimplementing that is a losing race.)
 *   2. OpenAI's transcription API (whisper-1, verbose_json) returns timed segments.
 *   3. Segments feed the same Markdown builder as captions, so output is identical.
 *
 * Runs locally with the user's own API key. Roughly $0.006 per minute of audio.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranscriptSegment } from "./transcript";

export interface WhisperOptions {
  apiKey: string;
  /** OpenAI model. whisper-1 is the one that returns segment timestamps. */
  model?: string;
  /** Path to yt-dlp if it isn't on PATH. */
  ytdlpPath?: string;
  /** Override for testing or compatible providers. */
  baseUrl?: string;
  /** Optional progress messages (CLI prints them, web app ignores). */
  onStatus?: (msg: string) => void;
}

const OPENAI_LIMIT_BYTES = 25 * 1024 * 1024;

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

/** Download the smallest audio track for a video into a temp dir. Returns the file path. */
export async function downloadAudio(videoId: string, ytdlpPath = "yt-dlp"): Promise<{ path: string; bytes: number; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), "watch2text-"));
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const args = [
    "--no-playlist", "--quiet", "--no-warnings",
    "-f", "worstaudio[ext=m4a]/worstaudio/bestaudio", // small file, Whisper doesn't need hi-fi
    "-o", join(dir, "audio.%(ext)s"),
    url,
  ];
  let result: { code: number; stderr: string };
  try {
    result = await run(ytdlpPath, args);
  } catch (err: any) {
    rmSync(dir, { recursive: true, force: true });
    if (err?.code === "ENOENT") {
      throw new Error(
        "yt-dlp is not installed or not on PATH. Install it with `winget install yt-dlp` (Windows) or `pip install yt-dlp`, then retry."
      );
    }
    throw err;
  }
  if (result.code !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`yt-dlp failed: ${result.stderr.trim().split("\n").pop() ?? "unknown error"}`);
  }
  const file = readdirSync(dir).find((f) => f.startsWith("audio."));
  if (!file) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error("yt-dlp finished but produced no audio file.");
  }
  const path = join(dir, file);
  const bytes = statSync(path).size;
  if (bytes > OPENAI_LIMIT_BYTES) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `Audio is ${(bytes / 1048576).toFixed(1)} MB; OpenAI's upload limit is 25 MB (about 60 to 90 minutes at low bitrate). Long-video chunking is on the roadmap.`
    );
  }
  return { path, bytes, dir };
}

interface VerboseJson {
  text?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
}

/** Send an audio file to OpenAI and get timed segments back. */
export async function transcribeAudioFile(path: string, opts: WhisperOptions): Promise<TranscriptSegment[]> {
  const base = (opts.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
  const model = opts.model ?? "whisper-1";
  const bytes = readFileSync(path);
  const ext = path.split(".").pop() ?? "m4a";

  const form = new FormData();
  form.append("file", new Blob([bytes]), `audio.${ext}`);
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch(`${base}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 401) throw new Error("OpenAI rejected the API key (401). Check the key and try again.");
    throw new Error(`OpenAI transcription failed (HTTP ${res.status}): ${detail}`);
  }
  const data = (await res.json()) as VerboseJson;
  const segs = (data.segments ?? []).map((s) => ({
    text: s.text.trim(),
    startMs: Math.round(s.start * 1000),
    endMs: Math.round(s.end * 1000),
  }));
  if (!segs.length && data.text) {
    return [{ text: data.text.trim(), startMs: 0, endMs: 0 }];
  }
  return segs;
}

/** Full lane: download audio, transcribe, clean up. */
export async function whisperSegments(videoId: string, opts: WhisperOptions): Promise<TranscriptSegment[]> {
  opts.onStatus?.("no captions, downloading audio with yt-dlp…");
  const { path, bytes, dir } = await downloadAudio(videoId, opts.ytdlpPath);
  try {
    opts.onStatus?.(`transcribing ${(bytes / 1048576).toFixed(1)} MB with ${opts.model ?? "whisper-1"}…`);
    return await transcribeAudioFile(path, opts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
