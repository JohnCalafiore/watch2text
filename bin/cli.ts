/**
 * watch2text CLI
 *
 *   watch2text <url> [<url> ...]        transcribe one or more videos
 *   watch2text --file urls.txt          one URL per line
 *   watch2text --out <dir> <url>        write here instead of the default folder
 *   watch2text --set-out <dir>          remember a default output folder
 *   watch2text --stdout <url>           print the markdown instead of writing a file
 *   watch2text --no-timestamps <url>    plain paragraphs, no timestamp links
 *
 * Output folder resolution: --out, then WATCH2TEXT_DIR, then ~/.watch2textrc, then cwd.
 * Runs entirely on your machine, so no proxy is needed: your home IP is fine.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { extractVideoId, fetchTranscript } from "../lib/transcript";
import { buildMarkdown, suggestFilename } from "../lib/markdown";

const RC_PATH = join(homedir(), ".watch2textrc");

function readRc(): { out?: string } {
  try { return JSON.parse(readFileSync(RC_PATH, "utf8")); } catch { return {}; }
}

function usage(code = 0): never {
  console.log(`watch2text: turn a YouTube video into clean Markdown

Usage:
  watch2text <url> [<url> ...]
  watch2text --file urls.txt
  watch2text --out <dir> <url>
  watch2text --set-out <dir>
  watch2text --stdout <url>
  watch2text --no-timestamps <url>

Default output folder: --out, else $WATCH2TEXT_DIR, else ~/.watch2textrc, else the current directory.`);
  process.exit(code);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("-h") || args.includes("--help")) usage(0);

  let out: string | undefined;
  let file: string | undefined;
  let toStdout = false;
  let timestamps = true;
  const urls: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out") out = args[++i];
    else if (a === "--file") file = args[++i];
    else if (a === "--stdout") toStdout = true;
    else if (a === "--no-timestamps") timestamps = false;
    else if (a === "--set-out") {
      const dir = resolve(args[++i] ?? "");
      if (!dir) usage(1);
      mkdirSync(dir, { recursive: true });
      writeFileSync(RC_PATH, JSON.stringify({ out: dir }, null, 2));
      console.log(`Default output folder saved: ${dir}`);
      return;
    } else if (a.startsWith("-")) {
      console.error(`Unknown option: ${a}`);
      usage(1);
    } else urls.push(a);
  }

  if (file) {
    if (!existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith("#")) urls.push(t);
    }
  }
  if (!urls.length) usage(1);

  const outDir = resolve(out ?? process.env.WATCH2TEXT_DIR ?? readRc().out ?? process.cwd());
  if (!toStdout) mkdirSync(outDir, { recursive: true });

  let failures = 0;
  for (const url of urls) {
    const id = extractVideoId(url);
    if (!id) { console.error(`skip  ${url}  (not a YouTube URL or video ID)`); failures++; continue; }
    try {
      const result = await fetchTranscript(id);
      if (result.blocked) {
        console.error(`fail  ${id}  YouTube returned an empty response (IP blocked). Try from a home connection.`);
        failures++; continue;
      }
      if (result.captionSource === "none") {
        console.error(`skip  ${id}  no captions available (Whisper lane not built yet)`);
        failures++; continue;
      }
      const md = buildMarkdown(result, { includeTimestamps: timestamps });
      if (toStdout) { process.stdout.write(md); continue; }
      const path = join(outDir, suggestFilename(result.meta.title));
      writeFileSync(path, md, "utf8");
      const words = md.split(/\s+/).length;
      console.log(`wrote ${path}  (${words.toLocaleString()} words, ${result.captionSource} captions)`);
    } catch (err) {
      console.error(`fail  ${id}  ${String(err).slice(0, 140)}`);
      failures++;
    }
  }
  process.exit(failures && failures === urls.length ? 1 : 0);
}

main();
