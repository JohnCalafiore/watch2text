/**
 * Batch quality test: run many videos through the Lane 1 pipeline at once,
 * write each .md to ./test-output/, and print a quality report.
 *
 * Usage:
 *   npx tsx scripts/batch-test.ts                    # uses the default list below
 *   npx tsx scripts/batch-test.ts urls.txt           # one URL per line
 *   npx tsx scripts/batch-test.ts <url> <url> ...
 *
 * What to look for in the report:
 *   - ARTIFACTS > 0 means the cleaner missed something (see the flagged strings)
 *   - AVG PARA very low (<200 chars) means paragraphs are fragmenting; raise paragraphGapMs
 *   - AVG PARA very high (>1200) means walls of text; lower maxParagraphChars
 *   - "none" caption source is expected for some videos; that's the Lane 2 upsell
 */
import { extractVideoId, fetchTranscript } from "../lib/transcript";
import { buildMarkdown, suggestFilename } from "../lib/markdown";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Swap these for videos YOU would actually save to your vault.
const DEFAULT_URLS = [
  "https://www.youtube.com/watch?v=iG9CE55wbtY", // TED talk, manual captions, 20 min
  "https://www.youtube.com/watch?v=jNQXAC9IVRw", // tiny video, sanity check
];

const OUT_DIR = "./test-output";

/** Strings that should never survive the cleaner. */
const ARTIFACT_PATTERNS: Array<[string, RegExp]> = [
  ["bracket cue", /\[(music|applause|laughter|inaudible|foreign)\]/i],
  ["html entity", /&(amp|quot|#39|lt|gt);/],
  ["double space", / {2,}/],
  ["newline in para", /\S\n\S/],
  ["arrow timestamp", /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/],
];

interface Row {
  title: string;
  source: string;
  words: number;
  paras: number;
  avgPara: number;
  artifacts: string[];
  file: string;
}

function analyze(md: string): { paras: number; avgPara: number; artifacts: string[] } {
  const body = md.split(/^---$/m).slice(2).join("---");
  const paras = body.split(/\n\n+/).filter((p) => p.trim().length > 40);
  const avg = paras.length
    ? Math.round(paras.reduce((n, p) => n + p.length, 0) / paras.length)
    : 0;
  const artifacts = ARTIFACT_PATTERNS.filter(([, re]) => re.test(body)).map(([n]) => n);
  return { paras: paras.length, avgPara: avg, artifacts };
}

async function main() {
  const args = process.argv.slice(2);
  let urls: string[];
  if (args.length === 1 && existsSync(args[0])) {
    urls = readFileSync(args[0], "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  } else if (args.length) {
    urls = args;
  } else {
    urls = DEFAULT_URLS;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const rows: Row[] = [];
  const failures: string[] = [];

  for (const [i, url] of urls.entries()) {
    const id = extractVideoId(url);
    process.stdout.write(`[${i + 1}/${urls.length}] ${id ?? url} … `);
    if (!id) {
      failures.push(`${url} → not a valid YouTube URL/ID`);
      console.log("SKIP (bad url)");
      continue;
    }
    try {
      const result = await fetchTranscript(id);
      if (result.captionSource === "none") {
        failures.push(`${result.meta.title || id} → no captions (Lane 2 candidate)`);
        console.log("no captions");
        continue;
      }
      const md = buildMarkdown(result);
      const file = `${OUT_DIR}/${suggestFilename(result.meta.title)}`;
      writeFileSync(file, md);
      const { paras, avgPara, artifacts } = analyze(md);
      rows.push({
        title: result.meta.title.slice(0, 44),
        source: result.captionSource,
        words: md.split(/\s+/).length,
        paras,
        avgPara,
        artifacts,
        file,
      });
      console.log(`ok (${paras} paras${artifacts.length ? ", ⚠ " + artifacts.join("/") : ""})`);
    } catch (err) {
      failures.push(`${id} → ${String(err).slice(0, 90)}`);
      console.log("ERROR");
    }
  }

  console.log("\n" + "=".repeat(96));
  console.log("QUALITY REPORT");
  console.log("=".repeat(96));
  console.log(
    "TITLE".padEnd(46) + "SRC".padEnd(8) + "WORDS".padStart(7) + "PARAS".padStart(7) + "AVG".padStart(7) + "  ARTIFACTS"
  );
  for (const r of rows) {
    console.log(
      r.title.padEnd(46) +
        r.source.padEnd(8) +
        String(r.words).padStart(7) +
        String(r.paras).padStart(7) +
        String(r.avgPara).padStart(7) +
        "  " +
        (r.artifacts.length ? "⚠ " + r.artifacts.join(", ") : "clean")
    );
  }

  const dirty = rows.filter((r) => r.artifacts.length);
  console.log("\n" + `${rows.length} passed, ${failures.length} skipped/failed, ${dirty.length} with artifacts`);
  if (failures.length) {
    console.log("\nSKIPPED / FAILED:");
    failures.forEach((f) => console.log("  - " + f));
  }
  if (dirty.length) {
    console.log("\nFIX THESE FIRST (open the file, find the artifact, patch lib/markdown.ts):");
    dirty.forEach((r) => console.log(`  - ${r.file}  [${r.artifacts.join(", ")}]`));
  }
  console.log(`\nAll output written to ${OUT_DIR}/ — open a few in Obsidian to judge real quality.\n`);
}

main();
