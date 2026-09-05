"use client";

import { useState } from "react";

interface ApiResult {
  markdown: string;
  filename: string;
  meta: { title: string; channel: string };
  stats: { segments: number; words: number };
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [timestamps, setTimestamps] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function transcribe(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, includeTimestamps: timestamps }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "no_captions") setNotice(data.message);
        else setError(data.error ?? "Something went wrong.");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([result.markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function copy() {
    if (result) navigator.clipboard.writeText(result.markdown);
  }

  return (
    <main className="wrap">
      <div className="brand"><b>vid2md</b> // video → markdown</div>

      <h1>
        Turn any video into <span className="hl">clean Markdown</span> for your second brain.
      </h1>
      <p className="sub">
        Paste a URL, get a note-ready .md file with frontmatter, readable paragraphs, and
        timestamp links. Built for Obsidian, Logseq, and AI workflows. No proprietary
        service, no lock-in, your files.
      </p>

      <form className="card" onSubmit={transcribe}>
        <div className="inputRow">
          <input
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Working…" : "Make Markdown"}
          </button>
        </div>
        <div className="opts">
          <label>
            <input
              type="checkbox"
              checked={timestamps}
              onChange={(e) => setTimestamps(e.target.checked)}
            />
            Timestamp links per paragraph
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        {notice && <div className="notice">{notice}</div>}
      </form>

      {result && (
        <section className="result">
          <div className="resultBar">
            <span className="stats">
              {result.filename} · {result.stats.words.toLocaleString()} words ·{" "}
              {result.stats.segments} segments
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="ghost" onClick={copy}>Copy</button>
              <button onClick={download}>Download .md</button>
            </span>
          </div>
          <pre className="preview">{result.markdown}</pre>
        </section>
      )}

      <section className="how">
        <div className="card">
          <span className="step">01</span>
          <h3>Paste a link</h3>
          <p>Any YouTube video with captions works instantly, free.</p>
        </div>
        <div className="card">
          <span className="step">02</span>
          <h3>We clean the mess</h3>
          <p>Cues stripped, fragments merged, real paragraphs rebuilt with timestamps.</p>
        </div>
        <div className="card">
          <span className="step">03</span>
          <h3>Own the file</h3>
          <p>Plain Markdown with YAML frontmatter. Drop it straight into your vault.</p>
        </div>
      </section>

      <footer>
        No captions on your video? Whisper transcription is coming, with a
        bring-your-own-key option. <a href="mailto:jcalafiore@gmail.com">Get notified</a>.
      </footer>
    </main>
  );
}
