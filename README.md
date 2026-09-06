# Watch2Text

Turn any YouTube video into clean, readable Markdown: real paragraphs, YAML frontmatter, and timestamp links back to the exact moment in the video. Built for note-takers, researchers, and anyone feeding video content to AI tools.

**Live:** https://www.watch2text.com (the hosted version is in private beta, see [Why the hosted version is gated](#why-the-hosted-version-is-gated))

![Watch2Text turning a 20-minute TED talk into a 3,234-word Markdown document](docs/screenshot.png)

## What it does

Paste a URL. Get back a `.md` file that looks like this:

```markdown
---
title: "Do schools kill creativity? | Sir Ken Robinson | TED"
source: https://www.youtube.com/watch?v=iG9CE55wbtY
channel: "TED"
duration_minutes: 20
captured: 2026-09-05
tags: [video-notes, transcript]
---

# Do schools kill creativity? | Sir Ken Robinson | TED

[0:27](https://www.youtube.com/watch?v=iG9CE55wbtY&t=27s) Good morning. How are you? It's been great, hasn't it? I've been blown away by the whole thing...
```

Every paragraph carries a link to the second it starts, so the document doubles as an index into the video.

## Why this exists

Video is a terrible reference format. You can't skim it, search it, or paste it into your notes. Captions already contain the text, but raw captions arrive as unpunctuated fragments full of `[Music]` cues, duplicated lines, and HTML entities. The cleaning pipeline is the actual product; the transcription part is the easy 20%.

## How it works

Two lanes by design:

- **Lane 1 (free, instant):** most YouTube videos have captions, creator-uploaded or auto-generated. We fetch them and run the cleaning pipeline. Zero marginal cost, so it's free forever.
- **Lane 2 (planned):** no captions? Whisper transcription of the audio, with a bring-your-own-API-key option so the "no lock-in" promise applies to the paid lane too.

### The cleaning pipeline (`lib/markdown.ts`)

1. Strip bracketed cues (`[Music]`, `[Applause]`) and decode HTML entities
2. De-duplicate overlapping fragments (auto-captions repeat themselves constantly)
3. Rebuild paragraphs using the timing gaps between caption segments, with a soft length cap so nothing becomes a wall of text
4. Emit YAML frontmatter, a header block, and one timestamp link per paragraph
5. Produce a filename that survives Obsidian, Windows, and macOS

Tested against a batch of real videos: a 20-minute talk (427 caption segments) comes out as ~3,200 words in 24 paragraphs with zero leftover artifacts.

### Fetching captions (`lib/transcript.ts`)

Uses [youtubei.js](https://github.com/LuanRT/YouTube.js) with two deliberate choices, both learned the hard way:

- `getBasicInfo` with the **ANDROID client**, because the full watch-page parser is brittle against markup changes and the WEB client returns `UNPLAYABLE` from datacenter IPs
- The caption URL's `fmt` parameter must be **replaced** with `json3` (via `URL.searchParams.set`), not appended, or you get XML back

## Why the hosted version is gated

YouTube serves empty responses to requests from datacenter IP ranges (Vercel, AWS, and also free proxy providers, which are datacenter IPs too). Your home connection is fine; a server is not. The app detects this (`blocked` flag) and shows an honest "private beta" message instead of a misleading "no captions" error.

The fix is a residential proxy (`PROXY_URL`), which costs money. Rather than spend ahead of demand, the hosted site collects a waitlist. **Running locally, everything works with no proxy at all.** The proxy layer (`lib/proxyFetch.ts`) has an 8-second fail-fast timeout with fallback to direct fetch, so a dead proxy can never hang a request.

## Run it locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

Batch quality check across many videos (writes each `.md` to `test-output/` and prints an artifact report):

```bash
npx tsx scripts/batch-test.ts urls.txt      # one URL per line
```

## Stack

Next.js 15 (App Router), TypeScript, youtubei.js, undici (proxy dispatcher), Supabase (waitlist storage via insert-only RLS). Deployed on Vercel.

## Roadmap

- [ ] `npx watch2text <url>` CLI that writes straight into a notes folder
- [ ] Article-to-Markdown lane (same output format, web pages instead of video)
- [ ] Whisper lane for caption-less videos, BYO key
- [ ] Playlists and batch export
- [ ] Residential proxy for the hosted version, once the waitlist justifies it

## License

MIT
