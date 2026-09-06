"use client";

import { useState } from "react";

interface ApiResult {
  markdown: string;
  filename: string;
  meta: { title: string; channel: string };
  stats: { segments: number; words: number };
}

function WaitlistForm({ source }: { source: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="joined">You're on the list. We'll email you the moment the beta opens.</p>;
  }

  return (
    <form className="inputRow" onSubmit={join} style={{ marginTop: 12 }}>
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Email address"
      />
      <button type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Joining…" : "Join the waitlist"}
      </button>
      {state === "error" && (
        <span className="stats" style={{ width: "100%" }}>
          Couldn't save that just now. Give it another try.
        </span>
      )}
    </form>
  );
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
        if (data.error === "no_captions" || data.error === "beta") setNotice(data.message);
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
      <div className="brand"><b>Watch2Text</b> // video → text</div>

      <h1>
        Turn any video into <span className="hl">clean, readable text</span> you can keep.
      </h1>
      <p className="sub">
        Paste a URL, get a clean Markdown transcript with readable paragraphs and
        timestamp links back to the video. Skim a 40-minute video in 5, search it,
        drop it in your notes app, or feed it to AI. No proprietary service, no
        lock-in, your files.
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
        {notice && (
          <div className="notice">
            {notice}
            <WaitlistForm source="beta-gate" />
          </div>
        )}
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
        <p>
          Currently in private beta. Whisper transcription for caption-less videos is
          coming, with a bring-your-own-key option. Get in early:
        </p>
        <WaitlistForm source="footer" />
      </footer>
    </main>
  );
}
