import { fetchArticle } from "../lib/article";
async function main() {
  const url = process.argv[2] ?? "https://en.wikipedia.org/wiki/Markdown";
  const a = await fetchArticle(url);
  console.log("title:", a.title, "| author:", a.byline || "(none)", "| site:", a.siteName, "| words:", a.words);
  console.log("file:", a.filename);
  console.log("---");
  console.log(a.markdown.slice(0, 900));
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
