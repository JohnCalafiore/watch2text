// End-to-end Lane 1 test: video ID -> cleaned markdown written to /tmp
// Usage: npx tsx scripts/e2e-test.ts [videoIdOrUrl]
import { extractVideoId, fetchTranscript } from "../lib/transcript";
import { buildMarkdown, suggestFilename } from "../lib/markdown";
import { writeFileSync } from "node:fs";

async function main() {
  const input = process.argv[2] ?? "jNQXAC9IVRw";
  const id = extractVideoId(input);
  if (!id) throw new Error("bad input");

  const result = await fetchTranscript(id);
  console.log("title:", result.meta.title);
  console.log("captionSource:", result.captionSource, "| segments:", result.segments.length);

  if (result.captionSource !== "none") {
    const md = buildMarkdown(result);
    const file = "/tmp/" + suggestFilename(result.meta.title);
    writeFileSync(file, md);
    console.log("wrote:", file, `(${md.length} chars)`);
    console.log("---- preview ----");
    console.log(md.slice(0, 600));
  }
}
main();
