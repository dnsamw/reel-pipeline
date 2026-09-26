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
- `ffmpeg` on your `PATH`, only if you want music ducked under dialogue/sfx (`--sidechain=true`) — checked
  once at startup; if it's missing, the run warns and falls back to the normal mix instead of failing

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

# Only needed for the GUI's Settings page "Connect with Facebook" (see below) - leave blank otherwise
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_REDIRECT_URI=http://localhost:4300/api/facebook/callback
FACEBOOK_CONFIG_ID=          # from a "Facebook Login for Business" Configuration - see docs/ARCHITECTURE.md
```

Then generate the Prisma client against the schema in this repo:

```bash
npm run prisma:generate
```

`npm run studio` and the GUI's template color preview both need real sample phrases to display -
`src/compositions/sample-data.json`, gitignored since it's DB content, isn't in the repo yet. Generate it once
(needs `DATABASE_URL` working):

```bash
npm run data:export-sample
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

# Duck background music under dialogue/sfx (real sidechain compression via ffmpeg)
npm run render:batch -- --chapters=0-0 --tts=true --sidechain=true
```

Finished videos land in `output/`, alongside `manifest.json` (what's been rendered, with what settings, plus
a suggested social caption for each). Re-running the same command later only renders what's new — add
`--force` to redo everything anyway.

### GUI (batch monitor, start-render form, template + recipe libraries, settings, Facebook publishing)

A local React + Express control panel wraps the CLI above — same `render:batch` underneath, just with a form
instead of flags, a live view of `manifest.json`/running renders (with inline playback), a library of saved
config/color presets ("templates" in the GUI sense), a library of composition **recipes** (which scenes a
"Composition" choice sequences — the 3 built-ins plus any you create, see
[docs/COMPOSITION_DESIGNER.md](docs/COMPOSITION_DESIGNER.md)), a Settings page for GUI-wide defaults, and
one-click publishing of a rendered reel to a connected Facebook Page.

```bash
npm run gui   # starts the API server (:4300) and the Vite dev server (:5183) together
```

Then open `http://localhost:5183`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#gui-batch-monitor--template-library)
for how it's wired together, what "template" presets can and can't do yet, and where intro/outro video-clip
support (not implemented yet) fits in.

Two ways to render from the GUI:
- **Batch Render** — bulk/unattended, same as the CLI flags below.
- **Queue Render** — a two-column workspace: the left column lists every reel in scope (tabbed "Not yet" /
  "Rendered"), where you can expand a reel to correct its text and save it straight to the database. The right
  column floats alongside it with the style to render against and a Render Queue you hand-pick reels into from
  the left, then batch-render together (or one at a time) once you're happy with the text. Corrections save
  straight to the database either way, so they also fix the main StudyPal app's content, not just this tool's
  renders.

**Recipes page** — which scenes a "Composition" choice actually sequences (intro → a repeating per-phrase
unit → outro), as data instead of one hand-written React component per composition. The 3 built-ins
(Classic/Side-by-side/Reversed) are read-only; create a custom one on a canvas-style editor: a
multi-track **Timeline** (drag beats to reorder, resize a Custom beat's duration; select one to see its
layers as their own track underneath, each independently trimmable) drives a **Graph** panel (a real
node/wire canvas — drag a data field, like phrase/Sinhala meaning/pronunciation/explanation, onto a
text layer to bind it, scoped to whichever beat is selected) and an **Inspector** panel (every other
field — position/size/rotation/color/font/animation/shape — for exactly whatever's selected, one thing
at a time). One beat kind, **Custom**, is what unlocks all this — instead of one of the fixed scene
layouts, it's a stack of positioned text/shape/image layers with no code needed for a new visual
arrangement. Data bindings are matched against a registry (`src/data/dataSources.ts`) so more data
models beyond phrases can be added later without changing the editor. A custom recipe is fully
renderable, not just previewable — pick it anywhere a "Composition" is chosen. See
[docs/COMPOSITION_DESIGNER.md](docs/COMPOSITION_DESIGNER.md) for the full design.

**Settings page** — GUI-wide defaults (durations/volumes/TTS/colors/copy, plus the default composition and
whether music-ducking is on by default) that every render starts from, whether it goes through the CLI flags
above, Batch Render, or Queue Render. A saved template preset still overrides these where it sets a field;
explicit flags on a single run override both. This is also where a Facebook Page gets connected ("Connect with
Facebook").

**Publishing to Facebook** — once a Page is connected, the Monitor page's "Rendered batches" list plays each
reel back inline and can publish it straight to that Page (`POST /{page-id}/videos` via the Graph API) with an
editable caption, pre-filled from the manifest's suggested caption. Every publish attempt (and its result) is
recorded, so Monitor always shows what's been generated vs. what's actually live, with a link to the post once
it's up. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#gui-batch-monitor--template-library) for the OAuth
setup steps and how the Page token is stored.

**Post Creator page** (`/post-creator`) — static 1080×1080 image posts. Pick a post template from the
dropdown (each option has a small live preview), edit its text fields and optional background photo, then set
its colors directly or load them from any reel template on the Templates page (light or dark palette). **Export
PNG** renders the exact same React component through Remotion's `renderStill`, so the PNG matches the preview,
downloads it, and keeps a copy in `output/posts/`. The first export after a code change waits for a Remotion
bundle (~20-30s); later ones take a few seconds. Your in-progress post for each template is remembered in the
browser.

**Export reel (MP4)** turns the same post into a still-image video: pick a background track from
`assets/music/` (▶ previews it from your chosen start point), set the length (3-90s), start offset and volume,
then export. Square posts are centred on a 9:16 canvas filled with the post's background colour, or kept at
their original size if you prefer. Music loops if it's shorter than the reel and fades in/out. The MP4 is
H.264/AAC at 30fps, downloaded and saved next to the PNG in `output/posts/`. It uses ffmpeg on `PATH`, falling
back to the copy bundled with Remotion.

To add a new post design: drop the HTML mock into `post-templates/`, port it to
`src/posts/templates/<Name>.tsx` exporting a `PostTemplateDef` (fields, color slots, defaults, and how to map a
reel palette onto its colors), and append it to `src/posts/registry.ts`. Repeating content (like the list story's
numbered items) is a `type: "list"` field. The Content panel then gets add/remove/reorder controls for it, and
the template sizes itself to however many items there are. The page, the dropdown and the PNG
export pick it up automatically.

| Flag | Meaning |
|---|---|
| `--chapters=0-2` | Chapter range to render, by `BookChapter.order` (counts from 0) |
| `--book=<uuid-or-title>` | Which book to pull from — required once more than one book exists in the DB |
| `--template=1\|2\|3` | Which visual template (default `1`) |
| `--tts=true\|false` | Voiced narration on/off (default `false`) |
| `--limit=N` | Stop after N *new* renders this run |
| `--force` | Re-render even batches already in the manifest |
| `--sidechain=true\|false` | Duck background music under dialogue/sfx via ffmpeg's real `sidechaincompress` filter (default `false`). Costs a second render pass per batch (~10-20% more total time, measured — not a flat 2x, since frame-painting isn't the dominant render cost here). Requires `ffmpeg` on `PATH`; if it's missing, the whole run warns once and falls back to the normal single-pass mix instead of failing |
| `--presetFile=path.json` | Merge a JSON `ReelConfig` (partial) into `defaultConfig` as this run's baseline, before the flags above apply — how the GUI's template library applies a saved preset. Rarely hand-written; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#gui-batch-monitor--template-library) |
| `--phraseIds=id1,id2,id3` | Render (or re-render) exactly these phrases as one reel, in this order — ignores `--chapters`/`--book`/`--limit` and always renders regardless of manifest state. How the GUI's Queue Render page targets one specific reel from its Render Queue; rarely hand-written |
| `--recipeFile=path.json` | Render through a custom (non-built-in) composition recipe instead of `--template`'s 3 built-ins — the file is a full recipe (`src/compositions/recipe/schema.ts`). Takes precedence over `--template`; the recipe's own id becomes the manifest-key/filename tag. How the GUI's Recipes page renders a custom recipe; rarely hand-written — see [docs/COMPOSITION_DESIGNER.md](docs/COMPOSITION_DESIGNER.md) |

Add more background music any time by dropping `.mp3`/`.wav`/`.m4a`/`.ogg` files into `assets/music/` — new
tracks are automatically included in the rotation for the next generation, no config change needed.

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the pipeline is put together, how to build a new
  template, and exactly what changes when pointing this at a second book/volume.

## Project layout

```
prisma/           Schema pointing at StudyPal's real DB (mostly read; the Queue Render page writes phrase corrections)
src/
  data/            DB access + phrase batching (Node-only)
  theme/           Brand colors/fonts (ported from the main StudyPal app) + ThemeContext for per-template overrides
  config/          All tunable durations/volumes/text/theme/TTS rate, as a Zod schema
  audio/           Music/sfx/voice/TTS selection + ffmpeg availability check (Node-only)
  compositions/    Composition recipes (recipe/) + beat-kind scene components - see docs/COMPOSITION_DESIGNER.md
  posts/           Post Creator image templates (React) + registry, rendered to PNG via the "Post" still
  render/          The batch runner (renderBatch.ts), manifest tracking, and sidechain ducking post-process
server/            Express API for the GUI - template + recipe libraries (SQLite + git export), global
                   settings, Facebook OAuth + publishing, render orchestration, chapter/book lookups
gui/               React + Vite control panel (batch monitor w/ playback+publish, Batch Render form, Queue
                   Render, template + recipe libraries, settings, video-clip spec reference)
templates/         Git-tracked JSON export of every saved template preset (one file per template) - see server/templates.ts
recipes/           Git-tracked JSON export of every saved custom recipe (one file per recipe) - see server/recipes.ts
data/              SQLite db for the GUI's own state - template + recipe libraries, global settings, connected
                   Facebook Page token, publish history (gitignored - templates/*.json and recipes/*.json are
                   the only parts with a git export)
assets/            fonts, music, sfx, voice-over, and generated TTS audio
post-templates/    Original HTML mocks for post designs - the source each src/posts/templates/*.tsx is ported from
output/            Rendered videos + manifest.json, and output/posts/ PNG exports (gitignored)
```

## Notes

- This is a separate project from [`study-pal`](https://github.com/dnsamw/study-pal) (the Next.js app) —
  its own dependencies, not deployed anywhere, run locally.
- `assets/music/` and `audio-samples/` are gitignored (large binary files) — source your own tracks and drop
  them in `assets/music/` after cloning. `assets/voice/` and `assets/sfx/` (small, already-sourced clips) are
  committed. `assets/images/` (custom recipe image layers, uploaded via the Recipes page) is gitignored the
  same way as `assets/music/`.
- `.env` (DB credentials, Azure key, Facebook app credentials) is gitignored — never commit real credentials.
- The connected Facebook Page's access token lives in `data/gui.db` (gitignored, same trust boundary as
  `.env`) — the GUI frontend is only ever shown the Page's name/id, never the token itself.
