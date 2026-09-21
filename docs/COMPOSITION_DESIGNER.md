# Toward a composition designer

Before this branch, adding a new visual composition meant writing a new `Reel*.tsx` (its own
`if/else` over a hand-rolled timeline, its own `<Composition>` registration in `Root.tsx`, its own
copy of the prop-passing boilerplate) even when it would reuse scenes that already exist. This
started as a check on whether that could become data instead - a schema for describing a
composition as a sequence of *beats*, checked against all three existing templates to see how much
of them it actually covers - and ended up replacing the old approach outright.

**Status: this is now the production default, on `feature/composition-designer-schema`.** All three
templates render through the recipe interpreter (`src/compositions/recipe/CompositionFromRecipe.tsx`)
unconditionally - no opt-in flag anymore. The old hand-written approach
(`Reel.tsx`/`ReelTemplate2.tsx`/`ReelTemplate3.tsx`/`GuessRevealSceneT2.tsx`/`GuessRevealSceneT3.tsx`/
`timings.ts`) has been deleted from this branch and **preserved on the `backup/legacy-composition-renderer`
branch** (a snapshot taken right before the flip, with the old files present and still the default
there, reachable behind the since-removed `--useRecipeRenderer=true` flag) - not lost, just retired.
See [Full production-pipeline verification](#full-production-pipeline-verification) for how this was
proven safe *before* flipping, and [What this doesn't do yet](#what-this-doesnt-do-yet) for what's
still open.

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
recipe at render time - one `buildTimelineFromRecipe()` plus a single `if/else` dispatching each
beat to a scene component. This section describes how it was checked **before** it replaced the old
files - at the time, `Root.tsx` registered it alongside the (then still-present) hand-written
compositions under temporary `Reel-Recipe-1/2/3` ids for side-by-side comparison; today `Root.tsx`
only has the recipe-driven ones, under the original `Reel`/`Reel-T2`/`Reel-T3` ids (the old files
are on `backup/legacy-composition-renderer` if you want to reproduce this comparison yourself).

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
parameterized by `promptField`/`answerField`/`theme`, used by `CompositionFromRecipe.tsx` - at the
time this was built, `GuessRevealSceneT2.tsx`/`GuessRevealSceneT3.tsx` were left untouched
(verification target, not modified), since deleted along with the rest of the old approach (see
`backup/legacy-composition-renderer`). Every visual difference between the old two files turned out
to be derivable from field identity, not from "which composition": each field has
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

Frame stills prove visual equivalence, but not the actual production path (`renderMedia`/
`selectComposition` via `renderBatch.ts`, real TTS synthesis, real audio mixing, real h264
encoding). Before flipping the default, `renderBatch.ts` temporarily had an opt-in
`--useRecipeRenderer=true` flag (since removed - the recipe path is unconditional now) pointing it
at the (then side-by-side) `Reel-Recipe-N` compositions.

Verified with two full, real `render:batch` runs against actual DB phrases, TTS **on**
(chapter 0, template 2 - the composition whose beat kind changed the most in this branch), each
pointed at an isolated `outputDir`/`manifestPath` via `--presetFile` so neither touched the real
`output/`/`data/gui.db` state, deleted afterward - one via the (then still-present) old path, one
via the opt-in flag:

```
npm run render:batch -- --chapters=0-0 --limit=1 --force --template=2 --tts=true --presetFile=<old-dirs>.json
npm run render:batch -- --chapters=0-0 --limit=1 --force --template=2 --tts=true --useRecipeRenderer=true --presetFile=<new-dirs>.json
```

**The two resulting `.mp4` files were byte-for-byte identical** (`cmp -s`, same file size down to
the byte) - not just visually equivalent stills, but the actual encoded video+audio output of the
real production renderer, including real Azure TTS synthesis and Remotion's audio mixing. Manifest
entries were identical apart from the (expected) output path and timestamp.

So the recipe renderer wasn't just theoretically equivalent before it replaced the old files - it
produced the literal same file as the then-current production path, for the one template most
likely to reveal a difference if one existed. This evidence is what the decision to flip the
default (below) was based on.

## What this doesn't do yet

The default has been flipped and the old files retired to `backup/legacy-composition-renderer`.
Not yet built, roughly in order of value:

1. The GUI's "Composition" dropdown (currently a hardcoded `1|2|3`) could become "pick a recipe,"
   with a recipe editable the same way template color presets already are (`server/templates.ts`'s
   SQLite + git-export pattern) - a form, not a canvas, with a live preview reusing `ReelPreview.tsx`.
2. **Known real gap surfaced by this exercise, independent of the designer work**: Template 3's
   old intro text was a hardcoded constant that ignored `config.introText`/a saved template's
   override - the recipe models this correctly (`text: {source: "literal", ...}`), and this is now
   actually what runs, but that constant's original value (`T3_INTRO_TEXT`) simply got copied into
   `template-3.json` verbatim rather than the underlying "should this respect `config.introText`
   like the other two do" question being revisited - worth deciding deliberately, not by inertia.
3. A new beat kind (a genuinely new visual layout) still requires writing a new scene component in
   code and adding one match arm to `CompositionFromRecipe.tsx` - by design, see
   [What this doesn't cover](#what-this-doesnt-cover-and-wont-without-more-work).
