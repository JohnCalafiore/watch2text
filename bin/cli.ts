/**
 * watch2text CLI
 *
 *   watch2text <url> [<url> ...]        YouTube videos OR web articles, mixed freely
 *   watch2text --file urls.txt          one URL per line
 *   watch2text --out <dir> <url>        write here instead of the default folder
 *   watch2text --set-out <dir>          remember a default output folder
 *   watch2text --set-key <openai-key>   remember an OpenAI key for caption-less videos
 *   watch2text --stdout <url>           print the markdown instead of writing a file
 *   watch2text --no-timestamps <url>    plain paragraphs, no timestamp links
 *
 * Lanes: YouTube captions (free) -> Whisper via yt-dlp + your OpenAI key (if no
 * captions and a key is set) -> web article extraction for any other http(s) URL.
 * Everything runs on your machine.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { extractVideoId, fetchTranscript } from "../lib/transcript";
import { buildMarkdown, suggestFilename } from "../lib/markdown";
import { fetchArticle, isWebUrl } from "../lib/article";
import { whisperSegments } from "../lib/whisper";

const RC_PATH = join(homedir(), ".watch2textrc");

interface Rc { out?: string; openaiKey?: string; ytdlpPath?: string }
function readRc(): Rc {
  try { return JSON.parse(readFileSync(RC_PATH, "utf8")); } catch { return {}; }
}
function writeRc(patch: Rc) {
  const next = { ...readRc(), ...patch };
  writeFileSync(RC_PATH, JSON.stringify(next, null, 2));
  try { chmodSync(RC_PATH, 0o600); } catch { /* Windows: ignore */ }
}

function usage(code = 0): never {
  console.log(`watch2text: turn videos and articles into clean Markdown

Usage:
  watch2text <url> [<url> ...]        YouTube videos or web articles
  watch2text --file urls.txt          one URL per line
  watch2text --out <dir> <url>        one-off output folder
  watch2text --set-out <dir>          remember a default output folder
  watch2text --set-key <openai-key>   remember an OpenAI key (for videos with no captions)
  watch2text --stdout <url>           print instead of writing a file
  watch2text --no-timestamps <url>    plain paragraphs

Output folder: --out, else $WATCH2TEXT_DIR, else ~/.watch2textrc, else current directory.
Whisper needs yt-dlp installed (winget install yt-dlp) and a key via --set-key or $OPENAI_API_KEY.`);
  process.exit(code);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("-h") || args.includes("--help")) usage(0);

  let out: string | undefined, file: string | undefined;
  let toStdout = false, timestamps = true;
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
      writeRc({ out: dir });
      console.log(`Default output folder saved: ${dir}`);
      return;
    } else if (a === "--set-key") {
      const key = (args[++i] ?? "").trim();
      if (!key.startsWith("sk-")) { console.error("That doesn't look like an OpenAI key (should start with sk-)."); process.exit(1); }
      writeRc({ openaiKey: key });
      console.log(`OpenAI key saved to ${RC_PATH} (readable only by you).`);
      return;
    } else if (a.startsWith("-")) {
      console.error(`Unknown option: ${a}`); usage(1);
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

  const rc = readRc();
  const outDir = resolve(out ?? process.env.WATCH2TEXT_DIR ?? rc.out ?? process.cwd());
  if (!toStdout) mkdirSync(outDir, { recursive: true });
  const apiKey = process.env.OPENAI_API_KEY ?? rc.openaiKey;

  const emit = (md: string, filename: string, note: string) => {
    if (toStdout) { process.stdout.write(md); return; }
    const path = join(outDir, filename);
    writeFileSync(path, md, "utf8");
    console.log(`wrote ${path}  (${note})`);
  };

  let failures = 0;
  for (const url of urls) {
    const id = extractVideoId(url);
    try {
      if (id) {
        const result = await fetchTranscript(id);
        if (result.blocked) {
          console.error(`fail  ${id}  YouTube returned an empty response (IP blocked). Try from a home connection.`);
          failures++; continue;
        }
        if (result.captionSource === "none") {
          if (!apiKey) {
            console.error(`skip  ${id}  no captions. Set an OpenAI key (watch2text --set-key sk-...) to transcribe audio with Whisper.`);
            failures++; continue;
          }
          const segments = await whisperSegments(id, { apiKey, ytdlpPath: rc.ytdlpPath, onStatus: (m) => console.error(`      ${id}  ${m}`) });
          result.segments = segments;
          result.captionSource = "whisper";
        }
        const md = buildMarkdown(result, { includeTimestamps: timestamps });
        emit(md, suggestFilename(result.meta.title), `${md.split(/\s+/).length.toLocaleString()} words, ${result.captionSource}`);
      } else if (isWebUrl(url)) {
        const a = await fetchArticle(url);
        const warn = a.words < 120 ? ", looks thin: may be an index page rather than an article" : "";
        emit(a.markdown, a.filename, `${a.words.toLocaleString()} words, article${warn}`);
      } else {
        console.error(`skip  ${url}  (not a YouTube URL, video ID, or web address)`);
        failures++;
      }
    } catch (err) {
      console.error(`fail  ${id ?? url}  ${String((err as Error).message ?? err).slice(0, 200)}`);
      failures++;
    }
  }
  process.exit(failures && failures === urls.length ? 1 : 0);
}

main();
