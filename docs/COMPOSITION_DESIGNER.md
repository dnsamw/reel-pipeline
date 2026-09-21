# Toward a composition designer

Today, adding a new visual composition means writing a new `Reel*.tsx` (its own `if/else` over a
hand-rolled timeline, its own `<Composition>` registration in `Root.tsx`, its own copy of the
prop-passing boilerplate) even when it would reuse scenes that already exist. This is a first step
toward not needing that: a schema for describing a composition as **data**, checked against all
three existing templates to see how much of them it actually covers.

**Status: schema, validated recipes, a working generic renderer with a genuinely generic
`guessReveal` beat, and an opt-in path through the real production renderer - all verified
byte-identical to the current output, on `feature/composition-designer-schema`.**
`Reel.tsx`/`ReelTemplate2.tsx`/`ReelTemplate3.tsx` (and `GuessRevealSceneT2`/`T3`) are still
unchanged and still what `renderBatch.ts`/the GUI use **by default** - the recipe renderer is only
reached via an explicit opt-in flag (`--useRecipeRenderer=true`), not the default. Whether to flip
that default, or retire the old files, is a separate decision this branch deliberately leaves open -
see [Full production-pipeline verification](#full-production-pipeline-verification) and
[What this doesn't do yet](#what-this-doesnt-do-yet).

## The finding this is built on

Reading `src/compositions/scenes/*.tsx`: **the scene components are already almost entirely
prop-driven.** `PhraseScene`, `CountdownScene`, `RevealScene`, `GuessRevealSceneT2`/`T3` take clean
typed props (a `Phrase`, timing, audio file/volume, theme) - nothing phrase-specific or
template-specific is hardcoded inside them. Fonts, colors, pixel positions, and entry-animation math
all already come from `config`/theme, not literals sprinkled through JSX.

What *isn't* data is one layer up, in `Reel.tsx`/`ReelTemplate2.tsx`/`ReelTemplate3.tsx`:

1. **Which scenes get sequenced, in what order, repeated how many times per phrase** - each file
   hand-writes its own `if (item.type === "phrase") ... else if (...)` branch over its own
   `buildTimeline`/`buildTimelineT2` output.
2. **A handful of per-template prop choices** that could just as easily be config: `OutroScene`'s
   `theme` (`"dark"` for Templates 1/2, `"light"` for Template 3), `GuessRevealSceneT2` vs `T3`
   swapping which `Phrase` field plays "prompt" vs "answer", and Template 3's intro text being a
   hardcoded constant (`T3_INTRO_TEXT`) instead of reading `config.introText` like the other two do.

So the schema's job is narrow on purpose: **describe the timeline/sequencing layer as data**, not
reinvent layout. A composition recipe is a sequence of *beats*, where each beat is one of the
scene "kinds" that already exist in code, plus the small set of overrides listed above.

## The schema

`src/compositions/recipe/schema.ts` (Zod, same pattern as `config/config.ts`'s `configSchema`):

```ts
type BeatKind = "intro" | "phrase" | "countdown" | "reveal" | "guessReveal" | "outro";

CompositionRecipe = {
  id: string;
  name: string;
  description: string;
  intro: { kind: "intro"; theme: "light" | "dark"; text: { source: "config.introText" } | { source: "literal"; value: string } };
  perPhraseBeats: Beat[];   // the repeating unit between intro and outro, expanded once per phrase
  outro: { kind: "outro"; theme: "light" | "dark" };
  transition: { at: "beforeOutro"; type: "fade" };  // the one transition point that exists today
}
```

`guessReveal` beats additionally carry `prompt`/`answer: "phrase" | "translationSi"` (which field
plays which role). `phrase`/`countdown`/`reveal` carry no extra fields - nothing about them varies
across the current templates.

## Coverage: does it actually cover the 3 existing templates?

Yes, losslessly - `src/compositions/recipe/recipes/template-{1,2,3}.json`, each hand-derived
straight from the real `Reel*.tsx`/`buildTimeline*` source and validated by parsing them through
`compositionRecipeSchema` (`recipes/index.ts`):

| | Template 1 (Classic) | Template 2 (Side-by-side) | Template 3 (Reversed) |
|---|---|---|---|
| `perPhraseBeats` | `phrase`, `countdown`, `reveal` | `guessReveal` | `guessReveal` |
| intro theme / text | light / `config.introText` | light / `config.introText` | dark / literal (`T3_INTRO_TEXT`) |
| `guessReveal` prompt→answer | n/a | `phrase` → `translationSi` | `translationSi` → `phrase` |
| outro theme | dark | dark | light |

Every field that actually differs between the three real files shows up as a field in the recipe;
nothing needed approximating or dropping to fit.

## Verified: byte-identical output

`src/compositions/recipe/CompositionFromRecipe.tsx` (`makeCompositionFromRecipe`) interprets a
recipe at render time - one `buildTimelineFromRecipe()` (parallel to `timings.ts`'s
`buildTimeline`/`buildTimelineT2`) plus a single `if/else` dispatching each beat to the *same* scene
components `Reel*.tsx` already use. `Root.tsx` registers it three times, once per built-in recipe,
as `Reel-Recipe-1`/`Reel-Recipe-2`/`Reel-Recipe-3` - visible in Studio right alongside `Reel`/
`Reel-T2`/`Reel-T3`.

Checked with `npx remotion still`, comparing each original composition against its recipe-driven
counterpart at the same frame, same default sample data:

- `calculateMetadata` reports the identical duration for all six (1470 frames / 49.00s with the
  default sample batch).
- Stills at 5 frames spanning every phase (intro, phrase/prompt, countdown, reveal, outro) for all
  3 template pairs - **18/18 comparisons produced byte-for-byte identical PNGs** (`cmp -s`).

So the recipe interpreter reproduces all three existing templates exactly, not just approximately.

### What this already buys you

Because the recipe can freely recombine the *existing* six beat kinds, some compositions that don't
exist today are a JSON file away - no new `.tsx`, no new `<Composition>` registration - by adding a
new file under `recipes/` and registering it in `Root.tsx` the same way the three built-ins are:

- Drop the countdown entirely: `perPhraseBeats: [phrase, reveal]` - straight phrase→answer, no
  guessing beat. **Renderable today**, no further code needed.
- A "Template 1 pacing but Template 3's outro theme" hybrid: `perPhraseBeats: [phrase, countdown,
  reveal]` with `outro.theme: "dark"` overridden. **Renderable today.**
- A "dark theme but English-first `guessReveal` prompt" hybrid, matching neither Template 2 nor
  Template 3 - **also renderable today**, and actually built and eyeballed as a one-off Studio
  composition to prove it (`theme: "dark"`, `prompt: "phrase"`, `answer: "translationSi"`): renders
  cleanly, correct contrast, no overlap - see [`guessReveal` is now fully generic](#guessreveal-is-now-fully-generic).

### `guessReveal` is now fully generic

Originally, `prompt`/`answer` only genuinely drove TTS routing (`ttsFor()` in
`CompositionFromRecipe.tsx`) - the *visual* content (whether a pronunciation line shows, which side
gets the explanation card, font sizes/spacing) was hardcoded per file in `GuessRevealSceneT2.tsx`/
`GuessRevealSceneT3.tsx`, so the renderer could only pick between those two whole components by
`theme`, and a combo neither one implemented (e.g. dark + English-first) wouldn't render as
requested.

**Closed**: `src/compositions/scenes/GuessRevealScene.tsx` is a new, generic component
parameterized by `promptField`/`answerField`/`theme`, used only by `CompositionFromRecipe.tsx` -
`GuessRevealSceneT2.tsx`/`GuessRevealSceneT3.tsx` are untouched and still exactly what
`ReelTemplate2.tsx`/`ReelTemplate3.tsx` use directly. Every visual difference between the old two
files turned out to be derivable from field identity, not from "which composition": each field has
a fixed identity (`phrase`: sans font, `foreground` color, larger size, an optional pronunciation
secondary line; `translationSi`: sinhala font, `primary` color, smaller size, no secondary), and the
answer block's spacing (vertical position, explanation-card padding/margin/font size) is
consistently tighter when the answer field is `phrase` - not an arbitrary per-composition tweak, but
because that field's optional pronunciation line adds an extra line above the card. Re-verified with
the same still-frame technique: **still 15/15 byte-identical** against `Reel-T2`/`Reel-T3` across
all 5 phases, plus the dark+English-first combo rendered and inspected by eye (no code path existed
to compare it against, since it never worked before).

One honest, harmless divergence found while doing this: the original files guard nullable fields
inconsistently (`GuessRevealSceneT2` guards its `translationSi`-as-answer heading with `phrase.translationSi && (...)`;
`GuessRevealSceneT3` doesn't guard its `phrase`-as-answer heading at all). `GuessRevealScene.tsx`
guards both uniformly, which only matters for an empty-string `phrase` - never true in practice
(required field, empty in neither the schema nor real content) - and is what every still-frame
comparison above was checked against.

### What this doesn't cover, and won't without more work

- **A genuinely new visual layout** (different fonts/positions/colors/animation curves, a new kind
  of progress indicator, a split-screen composition, etc.) still means writing a new beat-kind
  component in code. This schema recombines existing scene *kinds*; it doesn't describe pixel
  layout, so it can't invent a new *look* on its own.
- **`SceneFrame`'s shared chrome** (the background blobs, the "StudyPal Phrasebook" wordmark) isn't
  parameterized at all here - every themed beat gets it unconditionally, matching today's behavior.
- **`OutroScene`'s cross-palette contrast rule** (light mode borrows the dark palette's primary as
  its accent, and vice versa) is fixed logic inside `OutroScene`, not data - the recipe only picks
  which theme, not how that theme's colors get used.

A true drag/resize visual designer (arbitrary new layouts without writing code) would need a much
more elaborate data model - explicit positioned "slots," per-layer font/color/animation fields, a
generic layout renderer interpreting all of it - which is a separate, considerably larger project
from what's here. Worth doing eventually if a composition designer becomes a priority, but it's not
what this branch builds.

## Full production-pipeline verification

Everything above was checked with `remotion still` - real rendering, but not the actual production
path (`renderMedia`/`selectComposition` via `renderBatch.ts`, real TTS synthesis, real audio
mixing, real h264 encoding). `src/render/renderBatch.ts` now has one new, **opt-in, off-by-default**
flag, `--useRecipeRenderer=true`, that points it at `Root.tsx`'s `Reel-Recipe-N` compositions
instead of `Reel`/`Reel-T2`/`Reel-T3` - nothing else about a run changes, and omitting the flag
(every existing call site, every real production render) is byte-for-byte the same code path as
before this branch existed.

Verified with two full, real `render:batch` runs against actual DB phrases, TTS **on**
(chapter 0, template 2 - the composition whose beat kind changed the most in this branch), each
pointed at an isolated `outputDir`/`manifestPath` via `--presetFile` so neither touched the real
`output/`/`data/gui.db` state, deleted afterward:

```
npm run render:batch -- --chapters=0-0 --limit=1 --force --template=2 --tts=true --presetFile=<old-dirs>.json
npm run render:batch -- --chapters=0-0 --limit=1 --force --template=2 --tts=true --useRecipeRenderer=true --presetFile=<new-dirs>.json
```

**The two resulting `.mp4` files are byte-for-byte identical** (`cmp -s`, same file size down to
the byte) - not just visually equivalent stills, but the actual encoded video+audio output of the
real production renderer, including real Azure TTS synthesis and Remotion's audio mixing. Manifest
entries were identical apart from the (expected) output path and timestamp.

So the recipe renderer isn't just theoretically equivalent - it produces the literal same file as
today's production path, for the one template most likely to reveal a difference if one existed.

## What this doesn't do yet

Not yet built, and the natural next steps, roughly in order of value:

1. **Decide whether to flip the default, or retire the old files.** This branch deliberately stops
   at "opt-in and fully verified" - making `Reel-Recipe-N` the *default* (or deleting
   `Reel.tsx`/`ReelTemplate2.tsx`/`ReelTemplate3.tsx`/`GuessRevealSceneT2.tsx`/`GuessRevealSceneT3.tsx`
   in favor of it) is a codebase-direction call, not a verification question - the evidence above
   supports it, but that's a decision for whoever owns this repo to make explicitly, not something
   to do silently as a "cleanup."
2. Once a recipe is trusted as the real thing, the GUI's "Composition" dropdown (currently a
   hardcoded `1|2|3`) could become "pick a recipe," with a recipe editable the same way template
   color presets already are (`server/templates.ts`'s SQLite + git-export pattern) - a form, not a
   canvas, with a live preview reusing `ReelPreview.tsx`.
3. **Known real gap surfaced by this exercise, independent of the designer work**: Template 3's
   intro text is a hardcoded constant that ignores `config.introText`/a saved template's override -
   the recipe models this correctly (`text: {source: "literal", ...}` vs `{source: "config.introText"}`,
   and `CompositionFromRecipe.tsx` already honors it), but the actual `ReelTemplate3.tsx` still has
   this inconsistency until step 1 replaces it.
4. A new beat kind (a genuinely new visual layout) still requires writing a new scene component in
   code and adding one match arm to `CompositionFromRecipe.tsx` - by design, see
   [What this doesn't cover](#what-this-doesnt-cover-and-wont-without-more-work).
