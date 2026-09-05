# vid2md

Paste a video URL, get a clean Markdown file for Obsidian/Logseq/AI ingestion. See `SPEC.md` for scope and product strategy.

## Status (scaffold, built Aug 17)

Lane 1 (caption extraction → cleaned markdown) is **working end to end and tested** against real videos, including a 20-minute TED talk (427 segments → 3,200-word clean markdown with timestamp links). Lane 2 (Whisper) is stubbed at the API level (`no_captions` response) and is Day 3 work.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Pipeline test without the UI:

```bash
npx tsx scripts/e2e-test.ts "https://www.youtube.com/watch?v=iG9CE55wbtY"
```

## Architecture

- `lib/transcript.ts` — fetches metadata + caption tracks via youtubei.js. **Read the comment block in `fetchTranscript` before touching it**: it deliberately uses `getBasicInfo` with the ANDROID client (the WEB client returns UNPLAYABLE from datacenter IPs, and the full watch-page parser is brittle), and the caption URL's `fmt` param must be replaced with `json3`, not appended.
- `lib/markdown.ts` — the cleaning pipeline (cue stripping, dedupe, paragraph rebuilding on time gaps, YAML frontmatter, Obsidian-safe filenames). This is the product; invest polish here.
- `app/api/transcribe/route.ts` — POST `{url}` → `{markdown, filename, meta, stats}`. Returns `422 no_captions` for caption-less videos (the Lane 2 upsell moment).
- `app/page.tsx` — landing page + live demo UI with copy/download.

## Deployment note (important)

YouTube throttles/blocks some datacenter IP ranges. The ANDROID-client path worked from a cloud sandbox in testing, but if Vercel's IPs get blocked in production, the fixes in order of effort: (1) route transcript fetches through a small proxy, (2) use youtubei.js session with po_token, (3) move just the fetch step to a worker with a residential egress. Don't solve this before it's actually a problem; test on Vercel first.

## Day 3 (Lane 2) plan

- No captions → extract audio, transcribe with a hosted Whisper API to ship fast
- BYO-API-key option (free) alongside hosted transcription (the paywall)
- Supabase auth + free/paid gate (3 free Whisper jobs), email capture for paid tier

## Day 4 plan

Name + domain, PostHog, polish landing copy, three-tier pricing preview.
