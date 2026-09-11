# StudyPal Reel Pipeline

Bulk-generates vertical reel videos (Instagram/TikTok-style, 1080×1920) promoting *The Ultimate
Sinhala-to-English Phrasebook* directly from StudyPal's live database — a phrase in, a fully edited,
narrated, captioned `.mp4` out.

Three ready-made templates, background music rotation, optional Azure-voiced narration, and a resumable
batch runner that only ever renders what's new.

<p>
  <img alt="Node" src="https://img.shields.io/badge/node-24-339933?logo=node.js&logoColor=white">
  <img alt="Remotion" src="https://img.shields.io/badge/remotion-4-black?logo=remotion&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-5-3178c6?logo=typescript&logoColor=white">
</p>

## What it does

For each phrase in the book (English sentence, Sinhala pronunciation, Sinhala meaning, explanation in both
languages), the pipeline builds a short "guess the meaning" reel: the phrase appears, a countdown runs, then
the meaning reveals — with background music, a countdown tick, a reveal stinger, and (optionally) a voiced
narration reading the phrase and its meaning aloud.

| Template | Look | Format |
|---|---|---|
| 1 — Classic | Light | Phrase, countdown, and reveal are separate screens |
| 2 — Side-by-side | Light | Phrase stays on screen, shrinking as the countdown runs in place beneath it, then the meaning reveals alongside it |
| 3 — Reversed | Dark | Shows the Sinhala meaning first and asks the viewer to guess the English phrase |

A non-technical, step-by-step usage guide (for book authors who just need to *run* this, not maintain it)
exists separately — ask whoever maintains this repo for the current link.

## Requirements

- Node.js 24+
- Access to the StudyPal Postgres database (same `DATABASE_URL` the [main app](https://github.com/dnsamw/study-pal)
  uses)
- An [Azure Speech](https://azure.microsoft.com/en-us/products/ai-services/ai-speech) resource, only if you
  want narrated (`--tts=true`) reels — see [Setup](#setup)

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
AZURE_SPEECH_KEY=            # only needed for --tts=true — Azure Portal → your Speech resource → Keys and Endpoint
AZURE_SPEECH_REGION=eastus   # match your Speech resource's region
```

Then generate the Prisma client against the schema in this repo:

```bash
npm run prisma:generate
```

## Usage

Preview compositions and live-tweak settings (durations, volumes, colors, text) in a real UI:

```bash
npm run studio
```

Generate videos:

```bash
# One test video, so you can check it before generating a whole chapter
npm run render:batch -- --chapters=0-0 --limit=1

# The whole chapter
npm run render:batch -- --chapters=0-0

# A specific template, with narration on
npm run render:batch -- --chapters=0-0 --template=2 --tts=true
```

Finished videos land in `output/`, alongside `manifest.json` (what's been rendered, with what settings, plus
a suggested social caption for each). Re-running the same command later only renders what's new — add
`--force` to redo everything anyway.

| Flag | Meaning |
|---|---|
| `--chapters=0-2` | Chapter range to render, by `BookChapter.order` (counts from 0) |
| `--book=<uuid-or-title>` | Which book to pull from — required once more than one book exists in the DB |
| `--template=1\|2\|3` | Which visual template (default `1`) |
| `--tts=true\|false` | Voiced narration on/off (default `false`) |
| `--limit=N` | Stop after N *new* renders this run |
| `--force` | Re-render even batches already in the manifest |

Add more background music any time by dropping `.mp3`/`.wav`/`.m4a`/`.ogg` files into `assets/music/` — new
tracks are automatically included in the rotation for the next generation, no config change needed.

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the pipeline is put together, how to build a new
  template, and exactly what changes when pointing this at a second book/volume.

## Project layout

```
prisma/           Read-only schema, points at StudyPal's real DB
src/
  data/            DB access + phrase batching (Node-only)
  theme/           Brand colors/fonts (ported from the main StudyPal app)
  config/          All tunable durations/volumes/text, as a Zod schema
  audio/           Music/sfx/voice/TTS selection (Node-only)
  compositions/    The Remotion video templates + shared scene components
  render/          The batch runner (renderBatch.ts) + manifest tracking
assets/            fonts, music, sfx, voice-over, and generated TTS audio
output/            Rendered videos + manifest.json (gitignored)
```

## Notes

- This is a separate project from [`study-pal`](https://github.com/dnsamw/study-pal) (the Next.js app) —
  its own dependencies, not deployed anywhere, run locally.
- `assets/music/` and `audio-samples/` are gitignored (large binary files) — source your own tracks and drop
  them in `assets/music/` after cloning. `assets/voice/` and `assets/sfx/` (small, already-sourced clips) are
  committed.
- `.env` (DB credentials, Azure key) is gitignored — never commit real credentials.
