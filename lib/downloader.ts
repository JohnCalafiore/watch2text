/**
 * Download lane: save videos (or audio) to a local folder for offline watching.
 *
 * yt-dlp does the downloading, ffmpeg merges the separate video and audio
 * streams YouTube serves above 360p. Both are free and must be installed on
 * the machine running Watch2Text:
 *
 *   winget install yt-dlp
 *   winget install Gyan.FFmpeg
 *
 * Local only. The hosted site (Vercel) never exposes this lane.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { fetchTranscript } from "./transcript";
import { buildMarkdown } from "./markdown";

export type Quality = "720" | "1080" | "audio";

export interface DownloadJob {
  id: string;
  url: string;
  quality: Quality;
  transcript: boolean;
  status: "queued" | "downloading" | "transcribing" | "done" | "error";
  /** Title of the item currently downloading (playlists move through several). */
  title?: string;
  percent?: number;
  speed?: string;
  eta?: string;
  /** Item counter for playlists, e.g. 3 of 12. */
  index?: number;
  count?: number;
  files: string[];
  error?: string;
  notes: string[];
  startedAt: number;
  finishedAt?: number;
}

export interface LibraryItem {
  /** Path relative to the downloads folder, forward slashes. */
  path: string;
  name: string;
  channel: string;
  bytes: number;
  modified: number;
  kind: "video" | "audio";
  thumbnail?: string;
  transcript?: string;
}

const MEDIA_VIDEO = new Set([".mp4", ".mkv", ".webm", ".mov"]);
const MEDIA_AUDIO = new Set([".m4a", ".mp3", ".opus", ".ogg", ".aac"]);
const THUMB_EXT = [".jpg", ".jpeg", ".webp", ".png"];
const RC_PATH = join(homedir(), ".watch2textrc");

interface Rc { downloads?: string; ytdlpPath?: string; ffmpegPath?: string }
function readRc(): Rc {
  try { return JSON.parse(readFileSync(RC_PATH, "utf8")); } catch { return {}; }
}

/** Where downloads go: $WATCH2TEXT_DOWNLOADS, else ~/.watch2textrc "downloads", else ~/Videos/Watch2Text. */
export function downloadsDir(): string {
  const dir = resolve(process.env.WATCH2TEXT_DOWNLOADS ?? readRc().downloads ?? join(homedir(), "Videos", "Watch2Text"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Remember a downloads folder in ~/.watch2textrc (shared with the CLI's settings). */
export function setDownloadsDir(dir: string): string {
  const abs = resolve(dir);
  mkdirSync(abs, { recursive: true });
  const rc = (() => { try { return JSON.parse(readFileSync(RC_PATH, "utf8")); } catch { return {}; } })();
  writeFileSync(RC_PATH, JSON.stringify({ ...rc, downloads: abs }, null, 2));
  return abs;
}

/** True when running on the hosted site, where this lane must stay off. */
export function isHosted(): boolean {
  return Boolean(process.env.VERCEL);
}

function ytdlp(): string { return process.env.YTDLP_PATH ?? readRc().ytdlpPath ?? "yt-dlp"; }
function ffmpeg(): string { return process.env.FFMPEG_PATH ?? readRc().ffmpegPath ?? "ffmpeg"; }
function ffmpegConfigured(): boolean { return Boolean(process.env.FFMPEG_PATH ?? readRc().ffmpegPath); }

function probe(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((res) => {
    try {
      const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
      let out = "";
      child.stdout.on("data", (d) => (out += d.toString()));
      child.on("error", () => res(null));
      child.on("close", (code) => res(code === 0 ? out.trim().split(/\r?\n/)[0] : null));
    } catch {
      res(null);
    }
  });
}

/** Which tools are installed. The library page shows setup steps for anything missing. */
export async function toolStatus() {
  const [ytdlpVersion, ffmpegVersion] = await Promise.all([probe(ytdlp(), ["--version"]), probe(ffmpeg(), ["-version"])]);
  return {
    ytdlp: ytdlpVersion,
    ffmpeg: ffmpegVersion ? ffmpegVersion.replace(/^ffmpeg version\s+/, "").split(" ")[0] : null,
    downloads: downloadsDir(),
  };
}

/**
 * yt-dlp format selectors. Video prefers H.264 (avc1) + AAC in MP4 because
 * that plays everywhere, including the iPhone's built-in player, without
 * conversion. Falls back to whatever exists at that height.
 */
function formatArgs(q: Quality): string[] {
  // Audio: grab the audio track (or the whole file if that's all there is) and keep M4A,
  // which the iPhone plays natively. ffmpeg copies rather than re-encodes when it can.
  if (q === "audio") return ["-f", "ba[ext=m4a]/ba/b", "-x", "--audio-format", "m4a", "-k"];
  const h = q;
  return [
    "-f",
    `bv*[height<=${h}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`,
    "--merge-output-format", "mp4",
  ];
}

// Jobs live in memory on globalThis so Next's dev reloads don't lose them.
const g = globalThis as unknown as { __w2tJobs?: Map<string, DownloadJob> };
const jobs: Map<string, DownloadJob> = (g.__w2tJobs ??= new Map());

export function listJobs(): DownloadJob[] {
  return [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 30);
}

export function clearFinishedJobs() {
  for (const [id, j] of jobs) if (j.status === "done" || j.status === "error") jobs.delete(id);
}

export function startDownload(url: string, quality: Quality, transcript: boolean): DownloadJob {
  const job: DownloadJob = {
    id: randomUUID(),
    url,
    quality,
    transcript,
    status: "queued",
    files: [],
    notes: [],
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  void runJob(job);
  return job;
}

const PROGRESS_PREFIX = "W2TPROG|";
const DONE_PREFIX = "W2TDONE|";
const ITEM_PREFIX = "W2TITEM|";

async function runJob(job: DownloadJob) {
  const root = downloadsDir();
  const isPlaylist = /[?&]list=/.test(job.url) && !/[?&]v=/.test(job.url);
  const args = [
    "--newline",
    "--progress",
    "--no-warnings",
    "--windows-filenames",
    "--no-mtime",
    isPlaylist ? "--yes-playlist" : "--no-playlist",
    ...formatArgs(job.quality),
    // Only pass a location when one is configured; a bare "ffmpeg" isn't looked up on PATH.
    ...(ffmpegConfigured() ? ["--ffmpeg-location", ffmpeg()] : []),
    "--embed-metadata",
    "--embed-chapters",
    // Thumbnail goes inside the file as cover art (shows in Explorer and players),
    // so there's no separate .jpg next to each video.
    "--embed-thumbnail",
    "--convert-thumbnails", "jpg",
    "-o", join(root, "%(channel,uploader|Unknown)s", "%(title).150B [%(id)s].%(ext)s"),
    "--progress-template", `download:${PROGRESS_PREFIX}%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s`,
    "--print", `before_dl:${ITEM_PREFIX}%(playlist_index|1)s|%(n_entries|1)s|%(title)s`,
    "--print", `after_move:${DONE_PREFIX}%(id)s|%(filepath)s`,
    job.url,
  ];

  job.status = "downloading";
  const stderrTail: string[] = [];
  const completed: { id: string; path: string }[] = [];

  const code = await new Promise<number>((res) => {
    let child;
    try {
      child = spawn(ytdlp(), args, { windowsHide: true });
    } catch (err) {
      job.error = String(err);
      return res(1);
    }
    let buf = "";
    const onLine = (line: string) => {
      const l = line.trim();
      if (l.startsWith(PROGRESS_PREFIX)) {
        const [pct, speed, eta] = l.slice(PROGRESS_PREFIX.length).split("|");
        const n = parseFloat(pct);
        if (!Number.isNaN(n)) job.percent = n;
        job.speed = speed?.trim();
        job.eta = eta?.trim();
      } else if (l.startsWith(ITEM_PREFIX)) {
        const [idx, count, ...title] = l.slice(ITEM_PREFIX.length).split("|");
        job.index = parseInt(idx, 10) || 1;
        job.count = parseInt(count, 10) || 1;
        job.title = title.join("|");
        job.percent = 0;
      } else if (l.startsWith(DONE_PREFIX)) {
        const [id, ...p] = l.slice(DONE_PREFIX.length).split("|");
        const path = p.join("|");
        completed.push({ id, path });
        job.files.push(relative(root, path).split(sep).join("/"));
      }
    };
    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop() ?? "";
      lines.forEach(onLine);
    });
    child.stderr.on("data", (d: Buffer) => {
      for (const l of d.toString().split(/\r?\n/)) if (l.trim()) stderrTail.push(l.trim());
      while (stderrTail.length > 8) stderrTail.shift();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      job.error =
        err.code === "ENOENT"
          ? "yt-dlp is not installed. In PowerShell run: winget install yt-dlp  (then restart Watch2Text)"
          : String(err.message);
      res(1);
    });
    child.on("close", (c) => {
      if (buf) onLine(buf);
      res(c ?? 1);
    });
  });

  if (code !== 0 && !completed.length) {
    job.status = "error";
    job.error ??= explainFailure(stderrTail);
    job.finishedAt = Date.now();
    return;
  }
  if (code !== 0) job.notes.push(`Some items failed: ${explainFailure(stderrTail)}`);

  if (job.transcript) {
    job.status = "transcribing";
    const isYouTube = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(new URL(job.url).hostname);
    for (const item of completed) {
      if (!isYouTube || !/^[\w-]{11}$/.test(item.id)) {
        job.notes.push("Transcripts are only available for YouTube videos.");
        break;
      }
      try {
        const result = await fetchTranscript(item.id);
        if (result.blocked || result.captionSource === "none" || !result.segments.length) {
          job.notes.push(`No captions for ${basename(item.path)}, skipped transcript.`);
          continue;
        }
        const md = buildMarkdown(result, { includeTimestamps: true });
        const mdPath = join(dirname(item.path), basename(item.path, extname(item.path)) + ".md");
        writeFileSync(mdPath, md, "utf8");
      } catch (err) {
        job.notes.push(`Transcript failed for ${basename(item.path)}: ${String((err as Error).message).slice(0, 120)}`);
      }
    }
  }

  job.status = "done";
  job.percent = 100;
  job.finishedAt = Date.now();
}

function explainFailure(lines: string[]): string {
  const text = lines.join("\n");
  if (/ffmpeg|ffprobe/i.test(text) && /not found|not installed/i.test(text)) {
    return "ffmpeg is not installed. In PowerShell run: winget install Gyan.FFmpeg  (then restart Watch2Text)";
  }
  if (/Sign in to confirm|bot/i.test(text)) {
    return "YouTube asked for a sign-in check. Update yt-dlp (yt-dlp -U, or winget upgrade yt-dlp) and try again.";
  }
  if (/Unsupported URL|is not a valid URL/i.test(text)) return "That link isn't a supported video URL.";
  if (/Private video|Video unavailable|members-only/i.test(text)) return "That video is private, removed, or members-only.";
  const last = lines.filter((l) => /ERROR/i.test(l)).pop() ?? lines.pop() ?? "unknown error";
  return `${last.replace(/^ERROR:\s*/i, "").slice(0, 220)}  (If this keeps happening, update yt-dlp: winget upgrade yt-dlp)`;
}

/** Resolve a library-relative path safely. Returns null if it escapes the folder or doesn't exist. */
export function resolveLibraryPath(rel: string): string | null {
  const root = downloadsDir();
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return existsSync(abs) ? abs : null;
}

export function listLibrary(): LibraryItem[] {
  const root = downloadsDir();
  const items: LibraryItem[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const abs = join(dir, name);
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) { walk(abs, depth + 1); continue; }
      const ext = extname(name).toLowerCase();
      // Skip half-finished downloads.
      if (name.endsWith(".part") || /\.f\d+\./.test(name)) continue;
      const kind = MEDIA_VIDEO.has(ext) ? "video" : MEDIA_AUDIO.has(ext) ? "audio" : null;
      if (!kind) continue;
      const stem = abs.slice(0, -ext.length);
      const thumb = THUMB_EXT.map((e) => stem + e).find((p) => existsSync(p));
      // No sidecar image (the normal case now): use YouTube's thumbnail for the tile.
      const ytId = name.match(/\[([\w-]{11})\]\.[^.]+$/)?.[1];
      const md = existsSync(stem + ".md") ? stem + ".md" : undefined;
      const toRel = (p: string) => relative(root, p).split(sep).join("/");
      items.push({
        path: toRel(abs),
        name: basename(name, ext).replace(/\s*\[[\w-]{11}\]$/, ""),
        channel: dirname(abs) === root ? "" : basename(dirname(abs)),
        bytes: st.size,
        modified: st.mtimeMs,
        kind,
        thumbnail: thumb ? toRel(thumb) : ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : undefined,
        transcript: md ? toRel(md) : undefined,
      });
    }
  };
  walk(root, 0);
  return items.sort((a, b) => b.modified - a.modified);
}

/** Delete a media file plus its thumbnail and transcript. */
export function deleteLibraryItem(rel: string): boolean {
  const abs = resolveLibraryPath(rel);
  if (!abs) return false;
  const ext = extname(abs).toLowerCase();
  if (!MEDIA_VIDEO.has(ext) && !MEDIA_AUDIO.has(ext)) return false;
  const stem = abs.slice(0, -ext.length);
  for (const p of [abs, stem + ".md", ...THUMB_EXT.map((e) => stem + e)]) {
    try { rmSync(p, { force: true }); } catch { /* ignore */ }
  }
  // Remove the channel folder if it is now empty.
  const dir = dirname(abs);
  try { if (dir !== downloadsDir() && readdirSync(dir).length === 0) rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  return true;
}

export function contentTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  return (
    {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
      ".m4a": "audio/mp4",
      ".mp3": "audio/mpeg",
      ".opus": "audio/ogg",
      ".ogg": "audio/ogg",
      ".aac": "audio/aac",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".png": "image/png",
      ".md": "text/markdown; charset=utf-8",
    } as Record<string, string>
  )[ext] ?? "application/octet-stream";
}
