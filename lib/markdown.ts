import type { TranscriptResult, TranscriptSegment } from "./transcript";

/**
 * The cleaning pipeline is the product. Auto-captions arrive as short,
 * unpunctuated, sometimes-duplicated fragments. We:
 *  1. strip bracketed cues ([Music], [Applause]) and stray artifacts
 *  2. de-duplicate overlapping/repeated fragments (common in auto-captions)
 *  3. merge fragments into sentences/paragraphs, breaking on time gaps
 *  4. emit YAML frontmatter + clean prose
 */

const CUE_RE = /\[(music|applause|laughter|cheering|silence|inaudible|foreign)[^\]]*\]/gi;

function cleanFragment(text: string): string {
  return text
    .replace(CUE_RE, " ")
    .replace(/&(amp|#39|quot|lt|gt);/g, (m) =>
      ({ "&amp;": "&", "&#39;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" }[m] ?? " ")
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove exact-duplicate consecutive fragments and fragments fully contained in the previous one. */
function dedupe(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (prev) {
      const a = prev.text.toLowerCase().trim();
      const b = seg.text.toLowerCase().trim();
      if (a === b || a.endsWith(b)) continue;
    }
    out.push(seg);
  }
  return out;
}

export interface MarkdownOptions {
  paragraphGapMs?: number; // start a new paragraph when the gap between fragments exceeds this
  maxParagraphChars?: number; // soft cap so paragraphs stay readable
  includeTimestamps?: boolean; // prefix each paragraph with [mm:ss] linked to the video
  tags?: string[];
}

function fmtTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function yamlEscape(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildMarkdown(result: TranscriptResult, opts: MarkdownOptions = {}): string {
  const {
    paragraphGapMs = 2500,
    maxParagraphChars = 900,
    includeTimestamps = true,
    tags = ["video-notes", "transcript"],
  } = opts;

  const { meta } = result;
  const cleaned = dedupe(
    result.segments
      .map((s) => ({ ...s, text: cleanFragment(s.text) }))
      .filter((s) => s.text.length > 0)
  );

  // Group fragments into paragraphs.
  interface Para { startMs: number; parts: string[]; chars: number; }
  const paras: Para[] = [];
  let current: Para | null = null;
  let lastEnd = 0;

  for (const seg of cleaned) {
    const gap = seg.startMs - lastEnd;
    const needsBreak =
      !current || gap > paragraphGapMs || current.chars > maxParagraphChars;
    if (needsBreak) {
      current = { startMs: seg.startMs, parts: [], chars: 0 };
      paras.push(current);
    }
    current!.parts.push(seg.text);
    current!.chars += seg.text.length + 1;
    lastEnd = seg.endMs || seg.startMs;
  }

  const body = paras
    .map((p) => {
      const text = p.parts.join(" ").replace(/\s+/g, " ").trim();
      if (!includeTimestamps) return text;
      const secs = Math.floor(p.startMs / 1000);
      return `[${fmtTimestamp(p.startMs)}](${meta.url}&t=${secs}s) ${text}`;
    })
    .join("\n\n");

  const durationMin = Math.round(meta.durationSeconds / 60);
  const today = new Date().toISOString().slice(0, 10);

  const frontmatter = [
    "---",
    `title: ${yamlEscape(meta.title)}`,
    `source: ${meta.url}`,
    `channel: ${yamlEscape(meta.channel)}`,
    meta.publishedDate ? `published: ${yamlEscape(meta.publishedDate)}` : null,
    `duration_minutes: ${durationMin}`,
    `captured: ${today}`,
    `tags: [${tags.join(", ")}]`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return `${frontmatter}\n\n# ${meta.title}\n\n> Channel: [${meta.channel}](${meta.channelUrl}) · ${durationMin} min · [Watch](${meta.url})\n\n${body}\n`;
}

/** Obsidian-safe filename from the video title. */
export function suggestFilename(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${safe || "video-notes"}.md`;
}
