# vid2md — Spec (v1)

**Promise:** Paste a video URL, get a clean Markdown file built for your second brain (Obsidian, Logseq, AI ingestion). No proprietary service, no lock-in.

## The one flow that matters (v1)

1. User pastes a YouTube URL
2. App pulls the video's existing captions (manual or auto-generated)
3. Pipeline cleans them: strips cues/timestamps, merges fragments, rebuilds paragraphs
4. Output: `.md` file with YAML frontmatter (title, source, channel, date, duration, tags) + preview
5. One-click download

## Two-lane architecture (the product strategy)

- **Lane 1 (free, instant):** caption extraction + cleaning. Zero marginal cost. This file implements Lane 1.
- **Lane 2 (paid, Day 3):** no captions or higher quality wanted → Whisper transcription of the audio. BYO API key = free alternative that reinforces the "no lock-in" positioning. Hosted key = the paywall.

## Out of scope for v1 (parking lot)

Batch/playlists, summaries and chapter generation, RAG-ready chunking, API access, non-YouTube sources (Vimeo, podcast RSS, local files), Obsidian plugin. These are the upsells, not the MVP.

## Positioning and copy rules

- Say "turn videos into Markdown notes." Never market it as a downloader.
- Headline audience: Obsidian/PKM users and people feeding notes to AI tools.
- Differentiator vs Obsidian Web Clipper and similar: no proprietary service in the loop, output is plain files you own.

## Success criteria for launch week

Working URL-to-markdown for captioned videos, output good enough that YOU would save it to your own vault, live on a custom domain, email capture for the paid tier.
