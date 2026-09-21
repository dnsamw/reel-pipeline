# Architecture

Technical reference for how the reel pipeline works, how to build a new template, and how to point it at a
different book (e.g. a second volume). Written for whoever maintains this code next — including a future
you.

## Contents

- [Mental model](#mental-model)
- [The one rule that matters most](#the-one-rule-that-matters-most)
- [Directory map](#directory-map)
- [Data flow, end to end](#data-flow-end-to-end)
- [The config system](#the-config-system)
- [Audio system](#audio-system)
- [Sidechain ducking (--sidechain=true)](#sidechain-ducking---sidechaintrue)
- [How a template is put together](#how-a-template-is-put-together)
- [Building a new template](#building-a-new-template)
- [docs/COMPOSITION_DESIGNER.md](COMPOSITION_DESIGNER.md) *(experimental, branch `feature/composition-designer-schema`)*
- [Theming (per-template color overrides)](#theming-per-template-color-overrides)
- [Switching to a new book (e.g. Volume 2)](#switching-to-a-new-book-eg-volume-2)
- [GUI: batch monitor + template library](#gui-batch-monitor--template-library)
- [Known limitations & gotchas](#known-limitations--gotchas)

## Mental model

This is a [Remotion](https://remotion.dev) project: React components that a headless Chrome instance
renders frame-by-frame into a video, muxed with audio via ffmpeg. There is no video-editing UI — the "video"
is just a React component tree whose look changes as `useCurrentFrame()` advances.

Three things sit on top of vanilla Remotion:

1. **Data** — phrases come from StudyPal's real Postgres DB (the same one the Next.js app at
   `C:\DEV\ubuntu-node` uses), via Prisma.
2. **Batching** — phrases are grouped into reels (3 per reel by default) and rendered one `.mp4` per batch.
3. **A resumable batch runner** — `render:batch` tracks what's already been rendered in
   `output/manifest.json`, so re-running the same command only produces what's new.

## The one rule that matters most

**Prisma (`@prisma/client`) must never be imported as a *value* into anything under `src/compositions/`.**

Those files get bundled by `@remotion/bundler` and executed inside a headless Chrome page. Prisma's query
engine is a native binary that only runs in Node — it cannot run inside a browser page, and if you import it
there, the bundle either fails to build or throws at render time.

This is why:

- `src/data/getPhrases.ts` (which does `new PrismaClient()`) is only ever imported from Node-only scripts:
  `src/render/renderBatch.ts` and `src/data/exportSample.ts`, both run via `tsx`, never from
  `Root.tsx`/`reelProps.ts`/anything in `src/compositions/recipe/`/`src/compositions/scenes/`.
- The `Phrase` type/Zod schema lives in its own Prisma-free file, `src/data/phrase.ts`, specifically so
  `reelProps.ts` can import `phraseSchema` as a real runtime value (needed to build the Zod props schema
  Studio uses for its form UI — see [The config system](#the-config-system)) without dragging Prisma into the
  browser bundle. If you ever add a new field that needs both the DB and the composition, extend
  `phrase.ts`, not `getPhrases.ts`.

If you're unsure whether a new module is safe to import from a composition file: ask "does this module, or
anything it imports, touch `@prisma/client`, `fs`, or other Node built-ins at module scope?" If yes, it's
Node-only — keep it out of `src/compositions/`.

## Directory map

```
studypal-reels/
  prisma/schema.prisma        Prisma schema (Book/BookChapter/BookPhrase only) - same DATABASE_URL as ubuntu-node.
                              Mostly read; the Queue Render page's phrase corrections are the one write path (see below)
  src/
    data/
      phrase.ts                Phrase type + Zod schema - Prisma-free, safe to import anywhere
      getPhrases.ts            Prisma query (Node-only)
      batch.ts                 Groups phrases into per-reel batches
      exportSample.ts          Node script: writes real DB batches to sample-data.json for Studio preview
    theme/
      tokens.ts                Brand colors (light + dark) and fonts, hand-ported from ubuntu-node's globals.css
      fonts.ts                 Registers Poppins + Noto Sans Sinhala with Remotion
    config/
      config.ts                configSchema (Zod) + defaultConfig - all tunable durations/volumes/text
    audio/
      listAudioFiles.ts        Lists audio files in a dir (Node-only)
      music.ts / tick.ts / revealSound.ts / voice.ts   Pick-a-file-by-keyword helpers (Node-only)
      tts.ts                   Azure Speech synthesis + content-hash caching (Node-only)
      ffmpeg.ts                isFfmpegAvailable() - PATH check gating --sidechain (Node-only)
    compositions/
      Root.tsx                 Registers every Composition Studio/render can target
      reelProps.ts             Shared ReelProps/reelPropsSchema/reelDefaultProps/sampleBatches
      recipe/
        schema.ts               CompositionRecipe Zod schema - the beat vocabulary a template is built from
        timeline.ts              buildTimelineFromRecipe() - per-template timeline math, single source of truth
        CompositionFromRecipe.tsx  Interprets a recipe into an actual Composition component
        recipes/                 template-1.json / template-2.json / template-3.json + the loader
      scenes/                  Beat-kind scene components (intro/phrase/countdown/reveal/guessReveal/outro)
      sample-data.json         Generated by exportSample.ts - gitignored, regenerate locally
    render/
      renderBatch.ts           The batch runner (Node-only, the only place everything meets)
      manifest.ts              Manifest read/write/resumability types
      caption.ts                Suggested social caption text per batch
      sidechain.ts             --sidechain=true post-process: real ffmpeg sidechaincompress ducking (Node-only)
  assets/
    fonts/  music/  sfx/  voice/  tts/     Served via Remotion's staticFile() - see remotion.config.ts's publicDir
  output/                                   Rendered .mp4s + manifest.json (gitignored)
```

## Data flow, end to end

Running `npm run render:batch -- --chapters=0-0 --template=2 --tts=true` does, in order:

1. **Parse flags** into a `config` object (a full `ReelConfig`, starting from `defaultConfig` and overridden
   by whichever flags were passed).
2. **Query the DB** (`getPhrases`) for phrases in scope (optionally filtered by chapter range and/or book —
   see [Switching books](#switching-to-a-new-book-eg-volume-2)), then **group them into batches**
   (`batchPhrases`, `phrasesPerReel` per batch).
3. **Decide what to actually render this run** — compares each batch against `output/manifest.json` (skip if
   already rendered and `--force` wasn't passed), respects `--limit`.
4. **Synthesize TTS audio** for everything selected, *before* bundling (see the bundling gotcha below), if
   `ttsEnabled`. Every clip is cached by a hash of `(voice, text)` under `assets/tts/` — a phrase's audio is
   only ever generated once, forever, even across unrelated runs.
5. **Bundle the Remotion project** once (`@remotion/bundler`'s `bundle()`).
6. **For each selected batch**: pick a music track + tick/reveal sfx + intro voice file (all by scanning
   `assets/*` for filename keywords — see [Audio system](#audio-system)), call `renderMedia()` to produce the
   `.mp4` (if `--sidechain=true` and a music track was picked, this render omits the music track and a second
   ffmpeg pass ducks it in afterward — see [Sidechain ducking](#sidechain-ducking---sidechaintrue)), then
   write a manifest entry recording exactly what was used (so a rerun is reproducible and the suggested
   caption is generated).

Everything downstream of step 3 is per-batch; steps 1–3 happen once per run.

## The config system

`src/config/config.ts` defines `configSchema` as a **Zod schema**, not a plain TypeScript interface. This
buys two things:

- `ReelConfig` is derived from it (`z.infer<typeof configSchema>`), so the schema is the single source of
  truth — no risk of the type and the runtime shape drifting apart.
- Every `<Composition>` in `Root.tsx` passes `schema={reelPropsSchema}` (which embeds `configSchema`), which
  makes Remotion Studio render a real form for every field in its sidebar: bounded `z.number().min().max()`
  fields become sliders, booleans become checkboxes, strings become text inputs. This is **preview-only** —
  editing a value in Studio does not write back to `config.ts` or affect `render:batch`. To make a change
  permanent, edit `defaultConfig` directly or pass the equivalent CLI flag.

All three templates share the exact same `configSchema`/`ReelConfig` — durations, volumes, `ctaUrl`,
`introText`, etc. all apply uniformly. There's no per-template config; template differences live entirely in
the composition/scene code.

## Audio system

Every audio slot is resolved by **scanning a folder and matching filenames against keywords**, not by a
config list you have to maintain:

| Slot | Folder | Picked by |
|---|---|---|
| Background music | `assets/music/` | `pickMusicTrack()` — round-robins every file found, `pickMusicStartFrame()` offsets the start point so 650 reels reusing 5 tracks don't all open identically |
| Countdown ambience | `assets/sfx/` | `findTickFile()` — filename contains "tick"/"clock"/"countdown" |
| Reveal stinger | `assets/sfx/` | `findRevealSound()` — filename contains "reveal" |
| Intro voice-over | `assets/voice/` | `pickIntroVoice(dir, batchIndex, keyword)` — filename must contain `keyword` ("sinhala" or "english") **and** alternates female/male by filename |

Two design choices worth preserving if you touch this code:

- **Graceful absence, not a crash.** Every one of these returns `null` when nothing matches, and every scene
  component treats `null` as "render silently" (`{file && <Html5Audio .../>}`). Adding audio assets is always
  optional; the pipeline should never hard-fail because a folder is empty.
- **No wrong-language fallback.** `pickIntroVoice` does *not* fall back to a different keyword's file if the
  requested one is missing — it returns `null` instead. (Early on this fell back to "any file in the
  folder," which meant Template 3's English-meaning intro could silently play the Sinhala-meaning audio once
  both sets existed in the same folder. Silence is the safe default; a wrong-language voice-over is not.)

TTS (`src/audio/tts.ts`) is the one slot that calls an external API (Azure Speech) instead of scanning a
folder. It's cached by `sha256(voice + ":" + text)` under `assets/tts/`, which is also the folder Remotion
serves via `staticFile()` — the cache dir and the servable dir are deliberately the same folder, so nothing
needs copying between them.

## Sidechain ducking (--sidechain=true)

By default, `config.musicVolume` is a flat multiplier — the background track plays at one volume for the
whole reel, which can bury quiet TTS/sfx under a loud music bed. `--sidechain=true` fixes this with **real**
sidechain compression (ffmpeg's `sidechaincompress` filter reacting to actual dialogue/sfx loudness), not a
scripted volume keyframe — the composition timeline is deterministic, but TTS clip length within a scene
isn't (a short clip in a long scene shouldn't keep the music ducked for the whole scene), so a real trigger
signal handles that correctly without needing to know exact clip durations.

This is a **post-process**, not a Remotion-native feature — Remotion composites a component tree into a
video, it isn't a live audio mixer with real-time effects. `renderBatch.ts` implements it as two passes per
batch (only when a music track was actually picked - `applyMusicSidechain` in `render/sidechain.ts`):

1. **Render with `musicFile: null`.** Same video, but Remotion's own audio mix now contains only
   dialogue/sfx (voice-over + countdown tick + reveal stinger) - no music. This becomes both the final
   video track and the sidechain *trigger* signal.
2. **Build a raw music stem with ffmpeg**, replicating the exact `[trimBefore, loop]` window
   `CompositionFromRecipe.tsx`'s `<Html5Audio loop trimBefore={musicStartFrame}>` would have played: seek past the trimmed
   head first, then loop *only the remainder* (looping from frame 0 instead would replay the trimmed-off
   intro on every wrap - audibly different from what Remotion actually renders), then cut to the exact
   composition duration (`durationInFrames / fps`, taken from `selectComposition()`'s return value, not
   ffprobe - it's already exact).
3. **`sidechaincompress` the music stem against the dialogue/sfx track**, mix the ducked music back in with
   the (untouched) dialogue/sfx, and remux with `-c:v copy` (video stream untouched - this pass only ever
   re-encodes audio) onto the real output path.

`isFfmpegAvailable()` (`audio/ffmpeg.ts`) is checked once per `renderBatch.ts` run, not per batch - a missing
`ffmpeg` prints a warning and disables sidechain for the whole run rather than failing mid-batch. Ducking is
skipped per-batch (falls back to Remotion's normal single-pass mix) whenever no music track was picked at
all, since there'd be nothing to duck.

**Cost**: measured on this project at ~1.1-1.2x a normal render (a 4-batch run went from 399.6s to 446.3s) -
notably less than the naive "two full Chromium passes = ~2x" estimate, because this composition's
frame-painting cost isn't the dominant part of `renderMedia()`'s total time. Re-measure if you significantly
change scene complexity or reel length; the ratio isn't guaranteed to hold.

**Keep in sync**: the ffmpeg filter graph in `sidechain.ts` hand-replicates `CompositionFromRecipe.tsx`'s
music `<Html5Audio loop trimBefore={...}>` semantics (the one music-mounting call site every recipe-driven
composition shares). If that loop/trim behavior ever changes (e.g. a `trimAfter` is added, or looping is
removed), `sidechain.ts`'s `aloop`/`atrim` filter chain must be updated to match, or the ducked music stem
will audibly drift from what Remotion would have rendered directly. Sidechain ducking itself is
recipe-agnostic (it only touches the rendered `.mp4` + the raw source music file, never composition code),
so no per-recipe wiring is needed when adding a new template.

## How a template is put together

A template is a Remotion **Composition**: a component + a timeline + a Zod props schema, registered in
`Root.tsx`. All three current templates share the same props shape (`ReelProps` / `reelPropsSchema`,
`src/compositions/reelProps.ts`) — a template only decides *how* to lay out and sequence that data, never
what data exists. As of `feature/composition-designer-schema`, all three are **generated from a
`CompositionRecipe`** (`src/compositions/recipe/schema.ts`) by one generic component,
`makeCompositionFromRecipe` (`src/compositions/recipe/CompositionFromRecipe.tsx`) — there is no longer a
hand-written `.tsx` file per template. The old one-file-per-template approach (`Reel.tsx`/`ReelTemplate2.tsx`/
`ReelTemplate3.tsx`/`GuessRevealSceneT2.tsx`/`GuessRevealSceneT3.tsx`) is preserved on the
`backup/legacy-composition-renderer` branch for reference/rollback, not deleted outright. See
[docs/COMPOSITION_DESIGNER.md](COMPOSITION_DESIGNER.md) for the full design writeup and how this was
verified (byte-identical output, including a full production render, before it became the default).

**A recipe is a sequence of *beats***, each one of six kinds the interpreter already knows how to mount:
`intro`, `phrase`, `countdown`, `reveal`, `guessReveal`, `outro` (`src/compositions/scenes/`). Template 1's
recipe (`recipe/recipes/template-1.json`) sequences `intro` → (`phrase`, `countdown`, `reveal`) × N → `outro`
as discrete cut `<TransitionSeries.Sequence>`s (`timeline.ts`'s `buildTimelineFromRecipe()` computes each
beat's `durationInFrames` from `config`). Templates 2/3 (`template-2.json`/`template-3.json`) instead use one
`guessReveal` beat per phrase — the prompt/countdown/reveal collapse into a single continuously-mounted
`GuessRevealScene` component, because the prompt text has to visually persist and reposition (pin up,
shrink) as the countdown starts, which only works if it's the same mounted element throughout, not a fresh
one per cut. `guessReveal`'s phase math (`when does the prompt pin up`, `when does the ring fade out and the
answer fade in`) is factored into `src/compositions/scenes/guessRevealPhases.ts` - a pure function of
`(frame, fps, promptFrames, countdownFrames)`. Every recipe crossfades exactly once, from the last
per-phrase beat into the outro (`fade()`, `@remotion/transitions/fade`) — see `recipe.transition` /
`lastPerPhraseIndex` in `CompositionFromRecipe.tsx`.

**`guessReveal` is parameterized, not duplicated.** `GuessRevealScene.tsx` takes `promptField`/
`answerField: "phrase" | "translationSi"` instead of there being a separate file per direction - Template
2's recipe sets `prompt: "phrase"` (English first), Template 3's sets `prompt: "translationSi"` (Sinhala
first, dark theme). See that file's own comment for exactly which visual properties (font, color, size,
optional pronunciation line, answer-card spacing) are derived from which field.

**Shared chrome, not shared content.** `SceneFrame`, `OutroScene`, and `IntroScene` all take an optional
`theme: "light" | "dark"` prop (default `"light"` for `SceneFrame`/`IntroScene`, `"dark"` for `OutroScene`).
This is why there's one `OutroScene.tsx` serving a purple outro after light main scenes (Templates 1/2) *and*
a light outro after Template 3's dark main scenes, rather than two near-duplicate files - a recipe's
`outro.theme` just picks which.

## Building a new template

Two different things can mean "a new template," with very different amounts of work:

**Recombining existing beats into a new sequence or override** (e.g. Template 1's pacing with Template 3's
theme, or dropping the countdown) needs **no new code at all**:

1. Add `src/compositions/recipe/recipes/<name>.json`, matching `CompositionRecipe`'s shape
   (`recipe/schema.ts`) - copy the closest existing recipe and adjust `perPhraseBeats`/`intro`/`outro`.
2. Add it to `builtInRecipes` (`recipe/recipes/index.ts`) and register a `<Composition>` for it in `Root.tsx`
   (copy the pattern the `COMPOSITION_ID` map + loop already use), so it's previewable in Studio immediately.
3. **Wire it into the batch runner**: in `renderBatch.ts`, add the new template numeral to the `Template`
   union, `COMPOSITION_IDS`, and `INTRO_VOICE_KEYWORDS`. Filenames/manifest keys are already template-aware
   (`outputFilename`/`manifestKey` suffix everything except `"1"`), so a new numeral is safe by construction.
4. **Preview, then verify a real render** - `npm run studio`, check a couple of sample batches (long phrases
   especially), then a real `render:batch` run and inspect the actual `.mp4` before trusting it at scale.
   See [docs/COMPOSITION_DESIGNER.md](COMPOSITION_DESIGNER.md#full-production-pipeline-verification) for the
   exact technique (isolated `--presetFile` output dirs, `ffprobe`, byte comparison) used to verify this
   became the default in the first place.

**A genuinely new visual layout** (different fonts/positions/colors/animation curves, a new kind of progress
indicator, a split-screen composition) still means writing real scene code, since the recipe format
recombines existing beat *kinds* and doesn't describe pixel layout:

1. **Scene component**: build in `src/compositions/scenes/`. Reuse `SceneFrame` for the background/blob
   chrome + progress dots, reuse `guessRevealPhases.ts` if you're doing another persistent-canvas layout,
   reuse `theme/tokens.ts`'s `colors`/`darkColors` (via `usePalette`) rather than inventing new hex values.
2. **New beat kind**: add it to `BeatKind`/`beatSchema` in `recipe/schema.ts`, a duration case in
   `timeline.ts`'s `beatDurationFrames()`, and a dispatch arm in `CompositionFromRecipe.tsx`.
3. Then follow the "recombining" steps above - write a recipe that uses your new beat kind, register it,
   wire it into `renderBatch.ts`, preview and verify a real render.

## Theming (per-template color overrides)

Every scene component (`SceneFrame`, `IntroScene`, `OutroScene`, `PhraseScene`, `CountdownScene`, `RevealScene`,
`GuessRevealScene`) reads its palette via `usePalette(variant)` (`src/theme/ThemeContext.tsx`) instead
of importing `colors`/`darkColors` from `theme/tokens.ts` directly. `CompositionFromRecipe.tsx` wraps its
render tree in `<ThemeProvider theme={config.theme}>` — when `config.theme` is `null` (the default),
`usePalette` falls back to the built-in brand palette (`theme/tokens.ts`'s `colors`/`darkColors`), so
nothing changes for existing renders.

This is what lets a **template library preset** (see [GUI](#gui-batch-monitor--template-library) below) ship
its own full light+dark palette (`configSchema`'s `theme` field — a `{ light: Palette, dark: Palette }` object,
`Palette` being the same 8-key shape as `colors`/`darkColors`) without touching scene code — a preset is just
a `ReelConfig` with `theme` set, passed through `--presetFile` at render time.

**If you add a new scene component**, read colors via `usePalette("light" | "dark")`, never by importing
`colors`/`darkColors` directly — otherwise that component silently ignores template color overrides, which is
exactly the bug this refactor exists to prevent. `OutroScene` is the one component that reads *both*
`usePalette("light")` and `usePalette("dark")` at once (its contrast effect deliberately borrows the other
palette's primary color as an accent) — copy that pattern if a new scene needs the same cross-palette trick.

## Switching to a new book (e.g. Volume 2)

The DB schema (`Book` → `BookChapter` → `BookPhrase`) already supports multiple books; as of this change,
so does this pipeline. What you actually need to do once a second `Book` row exists in Postgres:

1. **Always pass `--book=`** once more than one book exists. `BookChapter.order` is only unique *within* a
   book — without a book filter, `--chapters=0-0` would match "chapter 0" of *every* book, and a run with no
   `--chapters` at all would pull every phrase from every book into one giant batch list.
   `--book=` accepts either the book's UUID or a case-insensitive substring of its title, e.g.
   `--book="Volume 2"` or `--book=volume-2`. Same flag works on `data:export-sample`.
2. **Filenames stay collision-free automatically.** Passing `--book=` prefixes every output filename with a
   sanitized version of what you typed (`volume-2-ch000-000-002.mp4`), so two books' overlapping
   chapter/phrase numbers never overwrite each other. Manifest keys never collide either way, since they're
   derived from phrase UUIDs, which are globally unique regardless of book.
3. **Branding/theme**: if the new book has different brand colors, either update `theme/tokens.ts`'s `colors`/
   `darkColors` (changes the default for every render that doesn't specify a template preset) or save a GUI
   template preset with its own `theme` override scoped to just that book's renders — see
   [Theming](#theming-per-template-color-overrides). If it's the *same* StudyPal brand (likely, for a second
   phrasebook volume), no theme change is needed at all.
4. **Outro copy**: `OutroScene.tsx`'s "Get the full phrasebook" / "200+ everyday English phrases..." text is
   currently hardcoded, not book-aware. If Volume 2 needs different outro copy (a different phrase count,
   different tagline), either parameterize `OutroScene` with a `headline`/`subhead` prop sourced from
   `config`, or accept that both volumes share the same outro text if that's fine messaging-wise.
5. **New audio assets, if the format changes**: if Volume 2's intro concept is different (not "guess the
   Sinhala/English meaning"), you'll want new voice-over files with their own keyword (following the
   `assets/voice/` naming convention: description + `_Female`/`_Male.mp3`) and to pass that keyword through
   wherever `pickIntroVoice` is called.
6. **TTS voices, music, sfx**: these are all book-agnostic already (scanned by keyword/rotation, not tied to
   a specific book), so nothing to change there.

In short: **for a same-brand second volume with the same reel format, the only required change is adding
`--book=` to your commands.** Everything else in this list is "only if Volume 2 actually needs to look or
sound different."

## GUI (batch monitor + template library)

`server/` (Express) + `gui/` (React/Vite) is a control panel wrapped *around* the CLI in this document, not a
second render path — every render it triggers still runs as an ordinary `npm run render:batch -- ...`
subprocess (`server/renderRunner.ts` spawns it with `child_process.spawn`, no shell interpretation, and
streams stdout/stderr back to the browser via polling). If something here seems to behave differently from
the CLI, the bug is almost certainly in how the GUI is invoking `render:batch`, not in `render:batch` itself.

**Storage split, and why**: book/chapter/phrase data stays in the shared Postgres DB via Prisma exactly as
described above. The GUI's `server/` mostly only reads it (`listBooks`/`listChapters` in
`src/data/getPhrases.ts`, added for the GUI's chapter picker) — the one deliberate exception is Queue
Render's phrase corrections, see below. Everything GUI-specific (saved template presets, global settings, the
connected Facebook Page's token, publish history) lives in **SQLite** (`server/db.ts`, file at `data/gui.db`,
gitignored) instead — that Postgres schema is shared with the separate `ubuntu-node` app, so it was
deliberately not extended for tool-local state like this.

**Template library = saved `ReelConfig` overrides, not a second config system**. A "template" record
(`server/templates.ts`) is `{ name, description, templateNumber, config }`, where `config` is a
`Partial<ReelConfig>` — the exact same shape `defaultConfig` is. Applying a template at render time
(`POST /api/render/start` with a `templateId`) writes that `config` to a temp JSON file and passes
`--presetFile=<path>` to `render:batch` (see [Usage](../README.md#usage) and the `--presetFile` doc comment
in `renderBatch.ts`) — `main()` merges it onto `defaultConfig` *before* applying `--chapters`/`--tts`/`--book`
etc., so a template sets the baseline and any explicit flag on the same run still wins. This is also what
makes per-template TTS speed (`config.ttsRate`, plumbed into `src/audio/tts.ts` as an SSML `<prosody rate>`
when non-default) and per-template colors (`config.theme`, see [Theming](#theming-per-template-color-overrides))
actually take effect, rather than being GUI-only cosmetic fields that don't affect the rendered video.

**Git as the templates' version history, SQLite as the query store**: every template save
(`saveTemplate` in `server/templates.ts`) writes the SQLite row *and* re-exports `templates/<id>.json` in the
same call, so they can't drift apart. Committing/pushing that JSON (`POST /api/templates/:id/push`, wired to
the GUI's "Push to GitHub" button) is a **separate, explicit action** — saving a template never commits or
pushes on its own, same as any other git client. JSON (one file per template) was chosen over committing the
`.db` file directly because SQLite's binary format doesn't diff or merge in git; `data/gui.db` itself is
gitignored for exactly this reason.

**Queue Render: review/correct phrase text, hand-pick reels, then batch-render them.** `render:batch`'s bulk
mode (**Batch Render** in the GUI) is fire-and-forget — it never shows you a phrase's text before baking it
into a video. The Queue Render page (`gui/src/pages/ReviewQueue.tsx` — file name predates the page's rename)
is a second, deliberately different workflow for the same underlying pipeline, laid out in two columns:

- **Left column — Scope + Queue.** `GET /api/queue` returns *every* batch in a scope (not just unrendered
  ones — see "rendered" below), with its phrases' actual text, tabbed "Not yet" (default) / "Rendered" so a
  reviewer can catch a DB typo/mistranslation before it ever reaches a rendered video, or after (if it's
  spotted once a video's already out). Each reel is an accordion: expand it, correct its text, "Save
  corrections". A reel can also be added to the Render Queue from here — it stays visible in the Queue either
  way (just badged "In Render Queue"), so adding it doesn't lose your place in the list.
- **Right column — Style + Render Queue, floats alongside the left column** (same sticky treatment as the
  Template Editor's live preview, see [above](#gui-batch-monitor--template-library)). "Style for renders from
  this queue" is one shared template/composition/TTS/sidechain choice applied to every reel currently in the
  Render Queue — there's no per-reel style override. The Render Queue itself is empty until reels are sent to
  it from the left; each entry can still be expanded and edited one last time before rendering, then rendered
  either individually ("Save & render this one") or all together ("Render batch").
- **Corrections write directly to Postgres** (`updatePhrase()` in `src/data/getPhrases.ts`, called via
  `PUT /api/phrases/:id`) — a deliberate exception to the "GUI mostly only reads the DB" rule above, chosen so
  a fix benefits the main StudyPal app too, not just this pipeline's renders. It's narrow on purpose: only the
  five content fields (`phrase`/`translationSi`/`pronunciationSi`/`explanation`/`explanationSi`) are writable,
  never `chapterId`/`order`/etc, so a correction can't accidentally move a phrase between chapters or corrupt
  ordering. This only ever runs from an explicit "Save corrections" click on the left, or right before a render
  fires from the Render Queue on the right — never automatically.
- **The Render Queue renders sequentially, not in parallel**, even for "Render batch" — each render shells out
  to ffmpeg, and concurrent renders would fight over the same machine's CPU/GPU rather than finish faster.
- **Rendering one specific reel** (new or a re-render after a correction) uses `renderBatch.ts`'s
  `--phraseIds=id1,id2,id3` flag instead of `--chapters`/`--limit`. This bypasses the normal chapter-range
  scan and manifest-skip logic entirely — it always renders exactly those phrases, in that order, regardless
  of whether a manifest entry already exists for them (equivalent to an implicit `--force`, scoped to just
  that one batch). This is what makes "I found a typo in an already-rendered reel, fix it and redo just that
  one" work without disturbing anything else in the chapter.
- **"Rendered" is per-composition, not global** — the same phrase batch can be done under Composition 1 but
  not Composition 3, since manifest keys are template-suffixed (see `manifestKey`/`outputFilename` in
  `renderBatch.ts`). `/api/queue`'s `template` query param must match whatever composition you're about to
  render with, or the rendered/not badges won't reflect the composition you're actually targeting.
- **Music/voice rotation for a `--phraseIds` render** can't use "position in this run" as its rotation seed
  the way bulk mode does (there's only ever one synthetic batch, so that position is always `0`) — it uses the
  first phrase's own DB `order` field instead, so repeated single-reel renders from the Render Queue still get
  some variety instead of always picking the same track/voice pair. This is a deliberate simplification, not
  an attempt to reproduce exactly what a hypothetical full bulk run over the same chapter would have picked.

**Settings page: one global-defaults baseline, same merge mechanism as a template.** `server/settings.ts`
stores a single SQLite row (`id = 'global'`) shaped like `{ config: Partial<ReelConfig>, defaultSidechain,
defaultTemplateNumber }` - `config` is the exact same shape a template's `config` is. Two things read it:

- `GET /api/config/defaults` merges it onto `defaultConfig` (`resolveDefaultConfig`) before returning - this
  is what the GUI calls "defaults" everywhere (Batch Render/Queue Render's baseline, the Template Editor's own
  merge, live-preview fallbacks), so a Settings change is visible immediately without touching any other page.
- `POST /api/render/start` merges Settings' `config` with the chosen template's `config` (template wins where
  both set the same field) into **one** `--presetFile`, since `render:batch` only accepts a single one - see
  the precedence chain in [Template library](#gui-batch-monitor--template-library) above: Settings sets the
  floor, a template overrides it, an explicit flag on that one run overrides both.

`defaultSidechain`/`defaultTemplateNumber` aren't `ReelConfig` fields (sidechain is a `render:batch`-only CLI
flag, not a config field) - they only ever set the *initial* value of Batch Render's and Queue Render's own
form controls (fetched once on mount), same as any other GUI default; they don't get merged into a preset file.

**Publishing a rendered reel to Facebook.** `server/facebook.ts` implements the OAuth "Login for Business"
flow to get a Page Access Token without ever asking the admin to paste one by hand:

1. Settings' "Connect with Facebook" button does a full-page navigation to `GET /api/facebook/connect`, which
   redirects to Facebook's OAuth dialog (`buildAuthUrl`) requesting `pages_show_list`, `pages_read_engagement`,
   `pages_manage_posts` - all three work for an app in *Development Mode* (no App Review needed) as long as the
   logged-in Facebook account is an admin of both the app and the target Page, which holds for this tool's
   intended single-admin use. **Those three can't be passed as a plain `scope` list on a newer app** - Meta
   rejects them with an "Invalid Scopes" error unless they come from a **Facebook Login for Business
   Configuration** instead (App Dashboard -> Facebook Login for Business -> Configurations -> New, asset type
   "Pages", with those permissions checked) - `buildAuthUrl` passes that Configuration's id as `config_id`
   when `FACEBOOK_CONFIG_ID` is set in `.env`, and only falls back to the plain `scope` param without it.
2. Facebook redirects the browser to `GET /api/facebook/callback` with a `code`. The server exchanges it for a
   short-lived user token, then that for a **long-lived** (~60 day) user token (`exchangeCodeForLongLivedUserToken`).
3. `fetchManagedPages` calls `/me/accounts` with that long-lived user token, which returns a **Page** Access
   Token per Page the account admins - a Page token minted this way doesn't itself expire on the ~60-day timer.
   Single-page scope: if the account admins more than one Page, the list is held in memory
   (`setPendingPages`/`getPendingPages`) and the Settings page shows a picker (`POST /api/facebook/select-page`)
   rather than guessing which one to keep; connecting a new Page always replaces whichever one was saved before.
4. The Page's id/name/token are saved to the `facebook_page` SQLite table. **The token never reaches the GUI
   frontend** - `getConnectedPage()` (used by every status-returning endpoint) deliberately selects only
   `id`/`name`/`connected_at`; only the server-internal `publishVideoToConnectedPage` reads the token column.

**Publishing itself** (`POST /api/publish`, called from the Monitor page's "Publish to Facebook" button) looks
up the rendered file via the existing manifest (`loadManifest` + the same `manifestKey` scheme Queue Render
uses), uploads it with a multipart `POST` to `graph-video.facebook.com/{page-id}/videos` (Node's built-in
`fetch`/`FormData`/`Blob` - no extra HTTP client dependency), and records the attempt in the `publications`
SQLite table (`server/publications.ts`) before and after the upload (`status`: `uploading` → `published` or
`error`) - this is the "what's generated vs. what's published" record. Monitor's manifest table gets a
`mediaUrl` per entry (added server-side by `/api/manifest`, mapping `output/<file>` to the `/media/<file>`
static route also mounted in `server/index.ts`) for inline `<video>` playback, and matches each entry to its
latest publish attempt by `(batchId, template)` to show a live/failed/not-yet-published badge next to it.

**Intro/outro video clips are spec'd, not implemented.** `IntroScene`/`OutroScene` are still plain
React+CSS+`Html5Audio` (see [How a template is put together](#how-a-template-is-put-together)) — there is no
`OffthreadVideo`/clip-embedding code anywhere in `src/compositions/`. The GUI's Video Spec page
(`gui/src/pages/VideoSpecPage.tsx`, data from `GET /api/video-spec` / `server/videoSpec.ts`) exists so the
standard to produce clips against (container/codec, exact 1080×1920 @ 30fps, the baked-in-audio-vs-silent
decision, fixed-vs-variable duration, `assets/intro-videos/`/`assets/outro-videos/` naming) is written down
*before* anyone shoots footage, even though the pipeline can't play those clips back yet. Building that
playback is a separate, larger change — see the trade-offs it involves in that section of the spec doc.

## Known limitations & gotchas

- **`bundle()`/`renderMedia()` don't read `remotion.config.ts`.** Unlike the `remotion` CLI, the programmatic
  API (`renderBatch.ts`'s only rendering path) does not auto-load `remotion.config.ts` — `publicDir` must be
  passed explicitly to `bundle()`. This bit us once already (fonts/audio 404'd silently). If you add a new
  `Config.set*()` call to `remotion.config.ts` expecting it to apply during batch renders, it won't — mirror
  it as an explicit option to `bundle()`/`renderMedia()` in `renderBatch.ts` instead.
- **`bundle()` snapshots `assets/` once.** Any file `render:batch` needs (most importantly, freshly
  synthesized TTS audio) must exist *before* `bundle()` runs. This is why TTS synthesis happens in a
  dedicated pre-pass over every selected batch, strictly before the `bundle()` call — see the comment in
  `renderBatch.ts` if you're tempted to move audio-picking logic inline into the render loop.
- **Azure's Free (F0) Speech tier is one-per-subscription**, across all Cognitive Services types, not just
  Speech. If TTS setup ever needs to move to a new Azure subscription, this will surface as a quota error at
  resource-creation time, not at render time.
- **Facebook Audio Library tracks' licensing** (the current `assets/music/*.wav` files) covers Meta
  placements; cross-platform commercial use elsewhere hasn't been separately verified.
- **The `bookId` field lives on `config`, not as a top-level batch-runner concept** — it flows through
  `ReelConfig` like every other setting, which also means it shows up in Studio's props panel (harmless,
  since Studio previews use static `sample-data.json` regardless of `bookId`).
- **`output/` is gitignored, so there's no version history for rendered `.mp4`s or `manifest.json`.**
  `--force`-rerunning a batch overwrites its existing file in place with no way to recover the previous
  bytes. The pipeline is deterministic (same DB content + config ⇒ same audio/voice picks), so a plain
  `--force` rerun reproduces an equivalent video, but not a byte-identical one (Chromium encode timing isn't
  perfectly reproducible) — be deliberate about which batches a `--force`/`--limit` combination will actually
  touch before running it, especially with a broad `--chapters` range.
- **The GUI's render-run tracking is in-memory only** (`server/renderRunner.ts`) — restarting the API server
  loses the log/status of any run that was in flight (the render subprocess itself keeps running independently
  and still writes to `manifest.json` normally; only the GUI's live-log view for that run is lost). The
  Monitor page's manifest table is unaffected since it reads `output/manifest.json` fresh each poll.
- **`better-sqlite3` is a native module.** `npm install` needs to either download a prebuilt binary for your
  platform or compile it locally; if that ever fails on a new machine, it's almost always a missing build
  toolchain (Python + a C++ compiler), not a bug in `server/db.ts`.
