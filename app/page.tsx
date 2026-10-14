"use client";

import { useState } from "react";

interface ApiResult {
  markdown: string;
  filename: string;
  meta: { title: string; channel: string; kind?: "video" | "article"; captionSource?: string; durationSeconds?: number };
  stats: { segments: number; words: number };
}

const REPO = "https://github.com/JohnCalafiore/watch2text";

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
    return <p className="joined">You're on the list. We'll email you the moment video opens up.</p>;
  }

  const id = `email-${source}`;
  return (
    <form className="inputRow" onSubmit={join}>
      <label htmlFor={id} className="sr-only">Email address</label>
      <input
        id={id}
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit" className="ghost" disabled={state === "busy"}>
        {state === "busy" ? "Joining…" : "Join the waitlist"}
      </button>
      {state === "error" && (
        <span className="opts" style={{ width: "100%" }}>Couldn't save that just now. Give it another try.</span>
      )}
    </form>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [timestamps, setTimestamps] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const paragraphs = result ? result.markdown.split(/\n\n+/).filter((p) => !p.startsWith("---") && !p.startsWith("#") && !p.startsWith(">")).length : 0;
  const minutes = result?.meta.durationSeconds ? Math.round(result.meta.durationSeconds / 60) : null;
  const sourceLabel =
    result?.meta.kind === "article"
      ? "article"
      : result?.meta.captionSource === "manual"
      ? "manual captions"
      : result?.meta.captionSource === "auto"
      ? "auto captions"
      : result?.meta.captionSource === "whisper"
      ? "whisper"
      : null;

  return (
    <>
      <header className="topbar">
        <div className="container">
          <a href="#top" className="brand">
            <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
              <path d="M12 10 Q12 6 16 8 L56 30 Q59 32 56 34 L16 56 Q12 58 12 54 Z" fill="var(--accent)" />
              <circle cx="30" cy="32" r="4.2" fill="var(--bg)" />
              <path d="M34 32 L55 32" stroke="var(--bg)" strokeWidth="3.2" strokeLinecap="round" />
            </svg>
            <span className="brand-name">Watch2Text</span>
          </a>
          <nav className="nav">
            <a href="#how">How it works</a>
            <a href={REPO} target="_blank" rel="noreferrer">Source</a>
            <a href="#waitlist" className="pill">Join the beta</a>
          </nav>
        </div>
      </header>

      <main id="top" className="container">
        <section className="hero">
          <h1>Turn any video into clean, readable text you can keep.</h1>
          <p className="sub">
            Paste a link and get a Markdown file with real paragraphs, YAML frontmatter, and timestamp
            links back to the exact moment in the video. Skim a 40-minute talk in five, search it, drop it
            into your notes, or hand it to an AI. No proprietary service, no lock-in. The files are yours.
          </p>
        </section>

        <section className="panel">
          <form className="inputRow" onSubmit={transcribe}>
            <label htmlFor="url" className="sr-only">Video or article URL</label>
            <input
              id="url"
              type="url"
              required
              placeholder="Paste a YouTube link or any article URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit" disabled={loading}>
              {loading ? "Working…" : "Make Markdown"}
            </button>
          </form>
          <div className="opts">
            <label>
              <input type="checkbox" checked={timestamps} onChange={(e) => setTimestamps(e.target.checked)} />
              Timestamp links on every paragraph
            </label>
            <span>Captioned videos are instant and free. Articles too.</span>
          </div>
          {error && <div className="error">{error}</div>}
        </section>

        {notice && (
          <div className="notice">
            {notice}
            <WaitlistForm source="beta-gate" />
          </div>
        )}

        {result && (
          <section className="result">
            <div className="resultBar">
              <div className="resultMeta">
                <div className="filename" title={result.filename}>{result.filename}</div>
                <div className="pills">
                  <span className="pill-stat">{result.stats.words.toLocaleString()} words</span>
                  {paragraphs > 0 && <span className="pill-stat">{paragraphs} paragraphs</span>}
                  {minutes ? <span className="pill-stat">{minutes} min</span> : null}
                  {sourceLabel && <span className="pill-stat accent">{sourceLabel}</span>}
                </div>
              </div>
              <div className="actions">
                <button type="button" className="ghost sm" onClick={copy}>
                  <CopyIcon /> {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" className="sm" onClick={download}>
                  <DownloadIcon /> Download .md
                </button>
              </div>
            </div>
            <pre className="preview">{result.markdown}</pre>
          </section>
        )}

        <section id="how" className="how">
          <h2 className="section">How it works</h2>
          <div className="cards">
            <article className="card">
              <span className="numeral" aria-hidden="true">1</span>
              <span className="rule" />
              <h3>Paste a link</h3>
              <p>A YouTube video or any web article. Captioned videos come back instantly and cost nothing.</p>
            </article>
            <article className="card">
              <span className="numeral" aria-hidden="true">2</span>
              <span className="rule" />
              <h3>We clean the mess</h3>
              <p>Cues stripped, duplicate fragments merged, real paragraphs rebuilt with a timestamp on each one.</p>
            </article>
            <article className="card">
              <span className="numeral" aria-hidden="true">3</span>
              <span className="rule" />
              <h3>Own the file</h3>
              <p>Plain Markdown with YAML frontmatter. Drop it in Obsidian, Notion, a folder, or straight into an AI.</p>
            </article>
          </div>
        </section>

        <section className="lanes" aria-label="What Watch2Text handles">
          <div className="lane">
            <span className="lane-label">Captions</span>
            <span className="lane-text">Free and instant for most YouTube videos.</span>
          </div>
          <div className="lane">
            <span className="lane-label">Articles</span>
            <span className="lane-text">Main content only. No nav, ads, or comments.</span>
          </div>
          <div className="lane">
            <span className="lane-label">Whisper</span>
            <span className="lane-text">Coming soon. Caption-less videos, transcribed with your own key.</span>
          </div>
        </section>

        <footer id="waitlist">
          <div className="footGrid">
            <div className="footCopy">
              <h2>Video on the hosted version is in private beta.</h2>
              <p>
                Articles work for everyone today. Leave an email and you'll be first in when video opens up.
                Or <a href={`${REPO}#use-it-as-a-command-recommended`} target="_blank" rel="noreferrer">run it on your own machine</a>, where everything already works.
              </p>
            </div>
            <WaitlistForm source="footer" />
          </div>
          <div className="footBar">
            <span>Watch2Text. MIT licensed. Built in Colorado.</span>
            <span className="links">
              <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
              <a href={`${REPO}#use-it-as-a-command-recommended`} target="_blank" rel="noreferrer">Command-line tool</a>
              <a href="https://jc-dev-partner.vercel.app" target="_blank" rel="noreferrer">Hire the maker</a>
            </span>
          </div>
        </footer>
      </main>
    </>
  );
}
