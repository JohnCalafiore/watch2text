// Tests the OpenAI request/response handling against a local mock server,
// and the yt-dlp "not installed" error path. Neither needs a real key.
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { transcribeAudioFile, downloadAudio } from "../lib/whisper";
import { buildMarkdown } from "../lib/markdown";

async function main() {
  const server = createServer((req, res) => {
    let body = Buffer.alloc(0);
    req.on("data", (c) => (body = Buffer.concat([body, c])));
    req.on("end", () => {
      const s = body.toString("latin1");
      const ok = req.url === "/v1/audio/transcriptions" && req.headers.authorization === "Bearer test-key"
        && s.includes('name="model"') && s.includes("whisper-1") && s.includes("verbose_json") && s.includes('filename="audio.m4a"');
      if (!ok) { res.writeHead(400); res.end("bad request shape"); return; }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ text: "hello world", segments: [
        { start: 0.0, end: 2.5, text: " Hello there, welcome to the show." },
        { start: 2.5, end: 6.0, text: " Today we talk about testing." },
        { start: 9.5, end: 12.0, text: " And that's a wrap." } ] }));
    });
  }).listen(0);
  const port = (server.address() as any).port;
  writeFileSync("/tmp/fake.m4a", Buffer.from("not really audio"));

  const segs = await transcribeAudioFile("/tmp/fake.m4a", { apiKey: "test-key", baseUrl: `http://127.0.0.1:${port}` });
  console.log("segments:", segs.length, JSON.stringify(segs[0]));
  const md = buildMarkdown({ meta: { id: "x", title: "Mock Video", channel: "Mock", channelUrl: "", url: "https://www.youtube.com/watch?v=x", publishedDate: "", durationSeconds: 12, description: "", keywords: [] }, segments: segs, captionSource: "whisper" });
  console.log("--- markdown body ---"); console.log(md.split("\n\n").slice(3).join("\n\n"));

  // 401 path
  const bad = createServer((_q, r) => { r.writeHead(401); r.end("nope"); }).listen(0);
  try { await transcribeAudioFile("/tmp/fake.m4a", { apiKey: "x", baseUrl: `http://127.0.0.1:${(bad.address() as any).port}` }); }
  catch (e: any) { console.log("401 handling:", e.message); }
  bad.close(); server.close();

  // missing yt-dlp path
  try { await downloadAudio("jNQXAC9IVRw", "definitely-not-installed-binary"); }
  catch (e: any) { console.log("missing yt-dlp:", e.message.slice(0, 80)); }
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
