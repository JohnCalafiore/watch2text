"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Quality = "720" | "1080" | "audio";

interface Job {
  id: string;
  url: string;
  quality: Quality;
  status: "queued" | "downloading" | "transcribing" | "done" | "error";
  title?: string;
  percent?: number;
  speed?: string;
  eta?: string;
  index?: number;
  count?: number;
  files: string[];
  error?: string;
  notes: string[];
}

interface Item {
  path: string;
  name: string;
  channel: string;
  bytes: number;
  modified: number;
  kind: "video" | "audio";
  thumbnail?: string;
  transcript?: string;
}

interface Tools {
  ytdlp: string | null;
  ffmpeg: string | null;
  downloads: string;
}

const fileUrl = (path: string, dl = false) => `/api/library/file?path=${encodeURIComponent(path)}${dl ? "&dl=1" : ""}`;

function fmtBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function fmtDate(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function postJson(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

function Brand() {
  return (
    <a href="/" className="brand">
      <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M12 10 Q12 6 16 8 L56 30 Q59 32 56 34 L16 56 Q12 58 12 54 Z" fill="var(--accent)" />
        <circle cx="30" cy="32" r="4.2" fill="var(--bg)" />
        <path d="M34 32 L55 32" stroke="var(--bg)" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      <span className="brand-name">Watch2Text</span>
    </a>
  );
}

export default function Library() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [tools, setTools] = useState<Tools | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState<Quality>("720");
  const [transcript, setTranscript] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Item | null>(null);
  const [folderEdit, setFolderEdit] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const activeRef = useRef(false);

  const loadLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/library", { cache: "no-store" });
      if (res.status === 404) return setAvailable(false);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAvailable(true);
      setTools(data.tools);
      setItems(data.items);
    } catch (err) {
      setAvailable(true);
      setError(String((err as Error).message ?? err));
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/download", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const list: Job[] = data.jobs;
      const active = list.some((j) => j.status === "queued" || j.status === "downloading" || j.status === "transcribing");
      // A job just finished: refresh the library so the new file appears.
      if (activeRef.current && !active) loadLibrary();
      activeRef.current = active;
      setJobs(list);
    } catch {
      /* offline for a moment; next poll retries */
    }
  }, [loadLibrary]);

  useEffect(() => {
    loadLibrary();
    loadJobs();
  }, [loadLibrary, loadJobs]);

  useEffect(() => {
    if (!available) return;
    const t = setInterval(() => {
      if (activeRef.current) loadJobs();
    }, 1000);
    return () => clearInterval(t);
  }, [available, loadJobs]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/download", "POST", { url, quality, transcript });
      setUrl("");
      activeRef.current = true;
      loadJobs();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Item) {
    if (!confirm(`Delete "${item.name}"? This removes the file from your computer.`)) return;
    try {
      await postJson("/api/library", "DELETE", { path: item.path });
      setItems((xs) => xs.filter((x) => x.path !== item.path));
      if (playing?.path === item.path) setPlaying(null);
    } catch (err) {
      setError(String((err as Error).message));
    }
  }

  async function saveFolder(e: React.FormEvent) {
    e.preventDefault();
    if (folderEdit == null) return;
    try {
      await postJson("/api/library", "POST", { downloads: folderEdit });
      setFolderEdit(null);
      loadLibrary();
    } catch (err) {
      setError(String((err as Error).message));
    }
  }

  async function clearJobs() {
    await postJson("/api/download", "DELETE", {}).catch(() => {});
    loadJobs();
  }

  const missing = tools && (!tools.ytdlp || !tools.ffmpeg);
  const totalBytes = items.reduce((s, i) => s + i.bytes, 0);
  const shown = filter
    ? items.filter((i) => `${i.name} ${i.channel}`.toLowerCase().includes(filter.toLowerCase()))
    : items;
  const finishedJobs = jobs.some((j) => j.status === "done" || j.status === "error");

  return (
    <>
      <header className="topbar">
        <div className="container">
          <Brand />
          <nav className="nav">
            <a href="/">Transcribe</a>
            <a href="/library" className="pill">Library</a>
          </nav>
        </div>
      </header>

      <main className="container lib">
        <section className="libHead">
          <h1 className="libTitle">Library</h1>
          <p className="sub">Download videos to watch offline. Everything stays on this computer.</p>
        </section>

        {available === false && (
          <div className="notice">
            The library runs on your own computer, not the hosted site. Start Watch2Text locally and open{" "}
            <a href="http://localhost:3005/library">localhost:3005/library</a>.
          </div>
        )}

        {available && (
          <>
            {missing && (
              <section className="setup">
                <h2>One-time setup</h2>
                <p>Downloading needs two free tools. Open PowerShell, run each line, then restart Watch2Text.</p>
                <ul>
                  <li className={tools?.ytdlp ? "ok" : ""}>
                    <code>winget install yt-dlp</code>
                    <span>{tools?.ytdlp ? `installed (${tools.ytdlp})` : "downloads the video"}</span>
                  </li>
                  <li className={tools?.ffmpeg ? "ok" : ""}>
                    <code>winget install Gyan.FFmpeg</code>
                    <span>{tools?.ffmpeg ? `installed (${tools.ffmpeg})` : "joins video and audio for 720p and up"}</span>
                  </li>
                </ul>
              </section>
            )}

            <section className="panel">
              <form className="inputRow" onSubmit={start}>
                <label htmlFor="dlurl" className="sr-only">Video or playlist URL</label>
                <input
                  id="dlurl"
                  type="url"
                  required
                  placeholder="Paste a YouTube video or playlist link"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <button type="submit" disabled={busy || !!missing}>
                  {busy ? "Starting…" : "Download"}
                </button>
              </form>
              <div className="opts">
                <div className="seg" role="radiogroup" aria-label="Quality">
                  {([
                    ["720", "720p", "Small, great on a phone"],
                    ["1080", "1080p", "Sharper, about twice the size"],
                    ["audio", "Audio", "Podcasts and talks"],
                  ] as const).map(([v, label, hint]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={quality === v}
                      title={hint}
                      className={quality === v ? "on" : ""}
                      onClick={() => setQuality(v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label>
                  <input type="checkbox" checked={transcript} onChange={(e) => setTranscript(e.target.checked)} />
                  Also save a Markdown transcript
                </label>
              </div>
              {error && <div className="error">{error}</div>}
            </section>

            {jobs.length > 0 && (
              <section className="jobs">
                <div className="rowHead">
                  <h2 className="h2sm">Downloads</h2>
                  {finishedJobs && (
                    <button type="button" className="link" onClick={clearJobs}>Clear finished</button>
                  )}
                </div>
                {jobs.map((j) => (
                  <div key={j.id} className={`job ${j.status}`}>
                    <div className="jobTop">
                      <span className="jobTitle">{j.title ?? j.url}</span>
                      <span className="jobState">
                        {j.status === "downloading" &&
                          `${j.count && j.count > 1 ? `${j.index} of ${j.count} · ` : ""}${Math.round(j.percent ?? 0)}%${j.eta && j.eta !== "NA" ? ` · ${j.eta} left` : ""}`}
                        {j.status === "queued" && "Starting…"}
                        {j.status === "transcribing" && "Writing transcript…"}
                        {j.status === "done" && `Done${j.files.length > 1 ? ` · ${j.files.length} files` : ""}`}
                        {j.status === "error" && "Failed"}
                      </span>
                    </div>
                    {(j.status === "downloading" || j.status === "queued") && (
                      <div className="bar"><span style={{ width: `${Math.max(2, j.percent ?? 0)}%` }} /></div>
                    )}
                    {j.error && <p className="jobErr">{j.error}</p>}
                    {j.notes.map((n, i) => <p key={i} className="jobNote">{n}</p>)}
                  </div>
                ))}
              </section>
            )}

            <section className="libList">
              <div className="rowHead">
                <h2 className="h2sm">
                  {items.length} {items.length === 1 ? "file" : "files"}
                  {items.length > 0 && <span className="muted"> · {fmtBytes(totalBytes)}</span>}
                </h2>
                {items.length > 6 && (
                  <input
                    className="filter"
                    type="search"
                    placeholder="Filter"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                )}
              </div>

              {items.length === 0 && <p className="empty">Nothing yet. Paste a link above and it will show up here.</p>}

              <div className="grid">
                {shown.map((it) => (
                  <article key={it.path} className="tile">
                    <button type="button" className="thumb" onClick={() => setPlaying(it)} aria-label={`Play ${it.name}`}>
                      {it.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.thumbnail.startsWith("http") ? it.thumbnail : fileUrl(it.thumbnail)}
                          alt=""
                          loading="lazy"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        <span className="noThumb">{it.kind === "audio" ? "♪" : "▶"}</span>
                      )}
                      {it.kind === "audio" && <span className="badge">Audio</span>}
                    </button>
                    <div className="tileBody">
                      <h3 title={it.name}>{it.name}</h3>
                      <p className="meta">
                        {it.channel && <>{it.channel} · </>}
                        {fmtBytes(it.bytes)} · {fmtDate(it.modified)}
                      </p>
                      <div className="tileActions">
                        <button type="button" className="sm" onClick={() => setPlaying(it)}>Play</button>
                        <a className="btnGhost" href={fileUrl(it.path, true)}>Save</a>
                        {it.transcript && <a className="btnGhost" href={fileUrl(it.transcript)} target="_blank" rel="noreferrer">Text</a>}
                        <button type="button" className="ghost sm danger" onClick={() => remove(it)} aria-label={`Delete ${it.name}`}>Delete</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {tools && (
              <section className="folder">
                {folderEdit == null ? (
                  <p>
                    Saving to <code>{tools.downloads}</code>{" "}
                    <button type="button" className="link" onClick={() => setFolderEdit(tools.downloads)}>Change</button>
                  </p>
                ) : (
                  <form className="inputRow" onSubmit={saveFolder}>
                    <label htmlFor="folderPath" className="sr-only">Downloads folder</label>
                    <input
                      id="folderPath"
                      className="textIn"
                      value={folderEdit}
                      onChange={(e) => setFolderEdit(e.target.value)}
                    />
                    <button type="submit" className="sm">Save</button>
                    <button type="button" className="ghost sm" onClick={() => setFolderEdit(null)}>Cancel</button>
                  </form>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {playing && (
        <div className="player" role="dialog" aria-label={playing.name} onClick={() => setPlaying(null)}>
          <div className="playerInner" onClick={(e) => e.stopPropagation()}>
            <div className="playerBar">
              <span className="jobTitle">{playing.name}</span>
              <button type="button" className="ghost sm" onClick={() => setPlaying(null)}>Close</button>
            </div>
            {playing.kind === "video" ? (
              <video src={fileUrl(playing.path)} controls autoPlay playsInline />
            ) : (
              <audio src={fileUrl(playing.path)} controls autoPlay />
            )}
          </div>
        </div>
      )}
    </>
  );
}
