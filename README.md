# StudyPal Studio

StudyPal's content studio: batch-rendered phrase reels, image posts and still-image reels (Post Creator),
a media library, and one-click publishing to a Facebook Page - through a local web app (`npm run gui`) or
the CLI below.

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

The app follows your OS light/dark setting. The theme button at the bottom of the sidebar switches between
System, Light and Dark, and the choice is remembered per browser. All GUI colours are CSS variables at the
top of `gui/src/styles.css` (a light set and a dark set built from the brand's dark palette), so new UI should
use those rather than hard-coded colours.

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

**Media Library page** (`/library`) — every generated or uploaded file in one place, in three tabs: batch
reels (`output/`), Post Creator exports (`output/posts/`) and uploaded images (`assets/images/`). Each card
shows whether it's tracked in the manifest, published to Facebook, or still used by a recipe/template. Select
files and **Delete selected**. Deleting a batch reel also removes its manifest entry, so that batch counts as
not rendered again. The **Render manifest** panel can **Remove missing entries** (entries whose video is gone)
or **Reset manifest** (every batch becomes not rendered; videos are kept and a backup of the manifest is saved
first). Every destructive action asks for confirmation, and reel/manifest changes are refused while a render
is running.

**Settings page** — GUI-wide defaults (durations/volumes/TTS/colors/copy, plus the default composition and
whether music-ducking is on by default) that every render starts from, whether it goes through the CLI flags
above, Batch Render, or Queue Render. A saved template preset still overrides these where it sets a field;
explicit flags on a single run override both. This is also where a Facebook Page gets connected ("Connect with
Facebook").

**Publishing (Facebook, Instagram, YouTube, TikTok)** — connect accounts under Settings → **Connected
accounts**. Every export in Post Creator (the PNG under "Image post", the MP4 under "Reel") and every rendered
reel on Monitor gets the same **Publish** panel:
- Tick the platforms to post to. Only platforms that can take that file are offered; the others say why (for
  example, Instagram feed images must be between 4:5 and 1.91:1, so a 9:16 story PNG is steered to its reel
  export).
- Edit the caption and confirm. A caption is suggested for you, built in and with no AI or internet service
  needed: it hides the quiz answer so viewers watch to the reveal, asks for a comment or save, links the book
  and adds hashtags. Pick a tone (Friendly, Challenge, Teacher), **Shuffle** for another version, or tick
  **Separate caption per platform** to shape one for each (Instagram "link in bio", short TikTok, YouTube
  title).
- **Write with AI** (optional): with `NVIDIA_API_KEY` in `.env` (Kimi K3 through NVIDIA's API), it writes a
  fresh caption. It can take up to a minute. Without a key, or if the key has expired, the button is disabled
  or you get the built-in suggestion with a note saying why.
- Each platform then shows live progress (uploading → processing → published) with a link to the post.

Publishing runs in the background, so you can keep working. Every attempt is recorded per platform, and
Monitor's header badge shows which platforms a reel is live on.

- **Facebook:** PNGs become photo posts, 9:16 videos of 3-90s become Reels, other videos become Page videos.
- **Instagram:** needs an Instagram Professional account linked to the connected Page, plus the
  `instagram_basic` and `instagram_content_publish` permissions on the Meta app (setup steps are in
  Settings). It publishes through the Page's token, so there's no second login. Reels upload straight from
  disk. Images are staged as an *unpublished* Facebook Page photo because Instagram only fetches images from a
  public URL; they never appear on the Page.
- **YouTube:** needs a Google Cloud OAuth client of type "Desktop app" with the YouTube Data API v3 enabled
  (`YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` in `.env`; setup steps are in Settings). Vertical videos up to
  3 minutes become Shorts. Uploads are **Private** by default: release them from YouTube Studio, or pick
  Unlisted/Public when publishing. Until Google audits the project, YouTube forces every upload private
  regardless. While the consent screen is in "Testing", the login expires after 7 days and you reconnect in
  Settings. Videos only; YouTube has no API for image posts.
- **TikTok:** needs a TikTok developer app with Login Kit (platform **Desktop**, redirect
  `http://127.0.0.1:*/api/tiktok/callback/`) and the Content Posting API's **Upload** product
  (`TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` in `.env`; setup steps are in Settings). Reels are sent to
  your **TikTok drafts**: open TikTok → Inbox to finish and post them. TikTok's API doesn't carry a caption for
  drafts, so the Publish panel gives you a **Copy caption** button. Max 5 pending drafts per 24h. Videos only.

The Publish panel labels results honestly: **Published** (live), **Sent to drafts** (TikTok), or **Uploaded
(private/unlisted)** (YouTube, as reported back by YouTube). Monitor's "published" dots count live posts only.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#publishing-distribution) for what each platform's API allows.

**Insights page** (`/insights`) — how your posts are doing on every platform, and what to post next. It reads
**every post on your connected accounts**, including ones you posted directly on Facebook, Instagram, YouTube or
TikTok, not just the ones this app published.
- **Kimi analysis** (needs `NVIDIA_API_KEY`): press **Analyse with Kimi**, optionally with a focus ("why is TikTok
  behind?"). In a few minutes you get a report: a summary, what the data says (with the numbers behind it and a
  confidence level), predictions, ready-to-make next posts built from phrases you haven't posted yet, experiments
  that change one thing at a time, and gaps to fix. Reports are saved. **Ask about your stats** answers a
  question directly.
- **Built-in analysis** (always works, no AI): each post's score (0-100 against your own posts on the same
  platform), what's working by series (posts whose captions open the same way, like "English Phrases 1, 2, 3"),
  post type, caption language and length, hashtags, format, tone, time and length, suggestions, likely best next
  posts, phrase coverage, and a table of every post with its numbers on each platform (sort by newest or top).
- Stats refresh every 6 hours while the app runs, or with **Refresh stats**. The cards at the top say what
  each platform lets the app measure and how to unlock the rest:
  - **Facebook**: views are read without extra setup; for watch time add `read_insights` to your Login for
    Business configuration, then reconnect Facebook.
  - **Instagram**: add `instagram_manage_insights` the same way.
  - **YouTube**: enable "YouTube Analytics API" in Google Cloud, then reconnect YouTube.
  - **TikTok**: add the Display API (`video.list`) to your TikTok app, then **Reconnect TikTok with stats**.
    TikTok uploads are drafts, so each is matched to the video you post from it; fix a wrong match with the
    dropdown in the Posts table.

**Post Creator page** (`/post-creator`) — static 1080×1080 image posts. Pick a post template from the
dropdown (each option has a small live preview), edit its text fields and optional background photo, then set
its colors directly or load them from any reel template on the Templates page (light or dark palette). **Export
PNG** renders the exact same React component through Remotion's `renderStill`, so the PNG matches the preview,
downloads it, and keeps a copy in `output/posts/`. The first export after a code change waits for a Remotion
bundle (~20-30s); later ones take a few seconds. Your in-progress post for each template is remembered in the
browser.

**Reels safe zones:** a Reel's top, bottom and right edge are covered by Facebook's UI (icons, caption, the
like/share column), and tall phones crop its sides. **Keep content inside Reels safe zones** (under the
preview, on by default for 9:16 templates) moves the content clear of those areas in the preview, the PNG and
the reel. **Show safe-zone guides** shades them on the preview. For a square post exported as a 9:16 reel, only
the side margins change.

**Export reel (MP4)** turns the same post into a still-image video: pick a background track from
`assets/music/` (▶ previews it from your chosen start point), set the length (3-90s), start offset and volume,
then export. Square posts are centred on a 9:16 canvas filled with the post's background colour, or kept at
their original size if you prefer. Music loops if it's shorter than the reel and fades in/out. The MP4 is
H.264/AAC at 30fps, downloaded and saved next to the PNG in `output/posts/`. It uses ffmpeg on `PATH`, falling
back to the copy bundled with Remotion.

Exports are published from the same **Publish** panel as Monitor's reels (see Publishing above). It posts
exactly the file that was exported, and warns you if you've edited the post since.

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
| `--ttsEn=true\|false` / `--ttsSi=true\|false` | With narration on, voice only one language, e.g. `--ttsSi=false` keeps the English phrase voice and drops the Sinhala one, whose Azure output isn't always good enough to post. Both default to on; the Settings page sets the GUI's defaults, and Batch Render / Queue Render can override them per run |
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
