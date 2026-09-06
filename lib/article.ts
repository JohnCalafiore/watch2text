/**
 * Article lane: any web page -> clean Markdown with the same frontmatter
 * shape as the video lane. Readability pulls the main content out of the
 * page (strips nav, ads, comments), Turndown converts the HTML to Markdown.
 */
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { suggestFilename } from "./markdown";

export interface ArticleResult {
  title: string;
  byline: string;
  siteName: string;
  url: string;
  excerpt: string;
  markdown: string;
  words: number;
  filename: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

function yamlEscape(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Turn the article's HTML into tidy Markdown. */
function htmlToMarkdown(html: string): string {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });
  // Drop things that never belong in a note.
  td.remove(["script", "style", "noscript", "iframe", "form", "button", "nav", "footer"]);
  // Keep images as links only when they have a real src; skip tracking pixels.
  td.addRule("images", {
    filter: "img",
    replacement: (_c, node) => {
      const el = node as HTMLImageElement;
      const src = el.getAttribute("src") ?? "";
      const alt = (el.getAttribute("alt") ?? "").trim();
      if (!/^https?:\/\//.test(src) || /pixel|1x1|tracking/i.test(src)) return "";
      return `![${alt}](${src})`;
    },
  });
  return td
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n") // collapse runaway blank lines
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export async function fetchArticle(url: string): Promise<ArticleResult> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();

  const { document } = parseHTML(html);
  // Readability needs a base URI to resolve relative links.
  const base = document.createElement("base");
  base.setAttribute("href", url);
  document.head?.appendChild(base);

  const parsed = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
  if (!parsed || !parsed.content) {
    throw new Error("Couldn't find readable article content on that page.");
  }

  const title = (parsed.title || document.title || "Untitled article").trim();
  const byline = (parsed.byline ?? "").trim();
  const siteName = (parsed.siteName ?? new URL(url).hostname.replace(/^www\./, "")).trim();
  const excerpt = (parsed.excerpt ?? "").trim();

  const body = htmlToMarkdown(parsed.content);
  const today = new Date().toISOString().slice(0, 10);

  const frontmatter = [
    "---",
    `title: ${yamlEscape(title)}`,
    `source: ${url}`,
    byline ? `author: ${yamlEscape(byline)}` : null,
    `site: ${yamlEscape(siteName)}`,
    `captured: ${today}`,
    "tags: [article, web-clip]",
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const header = `# ${title}\n\n> ${[byline, siteName].filter(Boolean).join(" · ")} · [Source](${url})`;
  const markdown = `${frontmatter}\n\n${header}\n\n${body}\n`;

  return {
    title,
    byline,
    siteName,
    url,
    excerpt,
    markdown,
    words: body.split(/\s+/).filter(Boolean).length,
    filename: suggestFilename(title),
  };
}

/** True for anything that looks like a fetchable web page (and isn't a YouTube video). */
export function isWebUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
