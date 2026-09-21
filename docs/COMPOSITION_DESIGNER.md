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

**Done**: the GUI's "Composition" dropdown across Batch Render, Queue Render, Settings, and the
Template Editor is now a `RecipePicker` (`gui/src/components/RecipePicker.tsx`) - it replaces the
old raw `1|2|3` select everywhere, picking from the 3 built-ins plus any custom recipe. A **Recipes**
page (`gui/src/pages/Recipes.tsx` + `RecipeEditor.tsx`) manages custom ones the same way template
color presets already work (`server/recipes.ts`'s SQLite + git-export `recipes/*.json` pattern,
mirroring `server/templates.ts`) - a form (beat list: kind, theme, direction; reorder/add/remove),
not a canvas, with a live preview reusing `ReelPreview.tsx` (generalized to take a full `recipe`
object instead of just a built-in number, so it can preview an in-progress unsaved edit too). A
custom recipe is **actually renderable**, not just editable - `POST /api/render/start` resolves a
`recipeId` to either a built-in (behaves exactly like the old `template` field) or a custom recipe
(writes a temp file, uses `renderBatch.ts`'s `--recipeFile` flag - see the "Full production-pipeline
verification" section above for how that flag itself was proven safe). Verified end-to-end for real:
created a custom recipe through the actual GUI form, saved it, triggered a real render with it via
the API (bypassing only the click-through, which was separately screenshot-verified), got a correct
`.mp4` back, then cleaned up the test artifacts (deleted recipe, output file, manifest entry).

Still not built:

1. ~~A new beat kind... requires writing a new scene component in code~~ **Mostly resolved** on
   `feature/layer-designer`: the `custom` beat kind (a stack of positioned text/shape/image layers,
   interpreted generically by `LayerRenderer.tsx`, authored via a drag/resize/rotate canvas in the
   GUI) covers many new visual layouts as pure data now - see
   [A concrete design for the true visual designer](#a-concrete-design-for-the-true-visual-designer).
   What's still missing is a genuinely new *primitive* beyond text/image/shape (e.g. video-clip
   support).
2. The beat editor's "Direction" control only covers `guessReveal` beats (the only kind with a
   field choice today); `phrase`/`countdown`/`reveal` beats have nothing to configure yet since
   nothing about them varies - see [Coverage](#coverage-does-it-actually-cover-the-3-existing-templates).

**Resolved**: Template 3's intro text staying a fixed literal (`template-3.json`'s
`text: {source: "literal", ...}`) rather than reading `config.introText` was flagged above as
needing a deliberate decision rather than inertia. Decided: **keep it fixed, by design, not a gap.**
Template 3 asks the *reverse* question ("how do you say this in English?") from what
`config.introText` means for Templates 1/2 ("what does this mean?") - sharing the field would put
wrong-direction copy on screen by default, since the two questions aren't interchangeable text, they
ask for different things. The GUI's Template Editor "Intro text" field now shows a hint when
Composition 3 is selected, explaining it doesn't apply there, instead of silently doing nothing.

## A concrete design for the true visual designer

**Status: built, on `feature/layer-designer` (not yet merged).** [What this doesn't cover](#what-this-doesnt-cover-and-wont-without-more-work)
called a real drag/resize designer "a much more elaborate data model... a separate, considerably
larger project." Not *impossible* - the pattern is well-trodden (After Effects/Lottie-style layer
graphs, Figma's scene model) - just a genuinely different system from the beat-recipe schema above,
which only recombines existing *components*. A true designer needs each beat's *contents* to become
data too.

**Schema**: `src/compositions/recipe/layers/schema.ts`. Sketch (now real, wired in - see
"What's actually built" below):

- A `custom` beat kind (`layers: Layer[]`), sitting alongside the existing 6 in `beatSchema`'s union
  rather than replacing them - existing compositions keep the hand-written, already-proven-
  byte-identical scene components; `custom` is what a canvas editor would produce for a layout none
  of the 6 cover.
- Three layer kinds - `text`, `image`, `shape` - since every existing scene's visible content is one
  of these three. Each has a `box` (position/anchor/size in *percent of canvas*, matching how every
  scene already centers/offsets content, plus rotation/z-index), not pixel coordinates.
- **Data binding is a closed union, not a free expression language**: a text layer's `text` is
  `{source: "literal", value}` or `{source: "phraseField", field: "phrase"|"translationSi"|...}` or
  `{source: "config", path: "introText"}` - a simple switch in the renderer, no `eval()`/template
  parsing, every possible value stays grep-able. Same pattern for `color` (`literal` hex, or
  `{source: "theme", token: "primary"|...}` mirroring `theme/tokens.ts`'s `Palette` keys exactly).
- **Animation is a closed set of shapes** (`fade`/`slide`/`scaleSpring`/`none`, each with the same
  frame-timing knobs every scene's `interpolate()`/`spring()` calls already use), not arbitrary
  keyframes - a real curve editor is a separate problem this sketch doesn't attempt to solve.
- Two things that are currently *hardcoded logic*, not data, get explicit escape hatches instead of
  being silently unavailable to a custom beat: `SceneFrame`'s background-blob chrome becomes an
  opt-in `{source: "sceneFrameChrome"}` image layer (today it's unconditional on every themed beat);
  `OutroScene.tsx`'s cross-palette contrast rule (light mode borrows the dark palette's accent, and
  vice versa) becomes a `{source: "oppositeThemeToken", token: "primary"|"gold"}` color ref.
- `CountdownScene`'s ring fill is frame-driven, not a static prop - represented as a shape layer's
  optional `progress: {source: "countdownProgress"}` binding rather than a new layer kind.

**The build-out plan, in phases:**

1. ~~**Generic renderer, Studio-only.**~~ **Done.** `LayerRenderer.tsx` walks a `Layer[]` and maps
   each one to `interpolate()`/`spring()`-driven styles, the same way the 6 existing scenes already
   do by hand. Proven with a hand-written `custom` beat (`recipe/layers/poc.ts`) as a standalone
   Studio composition (`LayerDesignerPOC`) - frame-by-frame still checks at 6 points across its
   timeline confirmed the progress binding, fade/slide/scaleSpring animations, and rotation all
   behave correctly.
2. ~~**Migrate the chrome/contrast escape hatches for real.**~~ **Done**, as part of step 1 -
   `sceneFrameChrome` and `oppositeThemeToken` are real, working bindings in `LayerRenderer.tsx`
   itself (not just schema shapes), exercised by the same POC beat.
3. ~~**The canvas editor.**~~ **Done.** `LayerCanvas.tsx` renders a scaled-down 1080x1920 box where
   each layer is a draggable div - a corner handle resizes, a top handle rotates - sharing the same
   `Layer[]` state as `LayerEditor.tsx`'s form (below it, for the fields a mouse isn't a better
   input for: text source, font, color, animation curves), so dragging and typing stay in sync. No
   snapping/alignment guides yet - plain free-form drag.
4. ~~**Wire `custom` into the real union.**~~ **Done.** `custom` is a real member of
   `beatSchema`/`perPhraseBeatSchema` in `../schema.ts`, with matching support in `timeline.ts`
   (duration comes from the beat's own `durationInFrames`, not `config`, unlike every other
   per-phrase beat kind) and `CompositionFromRecipe.tsx`'s dispatch. Verified through the real
   production path: a recipe mixing a `phrase` beat and a `custom` beat, rendered via the actual
   `Reel-Custom` composition (not a side-channel), correct output. The 3 built-in compositions are
   unaffected - `remotion compositions` lists identical ids/durations before and after.

**What's actually built, end to end:** a recipe's `perPhraseBeats` can include a `custom` beat today,
saved/loaded/rendered through the exact same paths as any other beat kind (`server/recipes.ts`'s
real `compositionRecipeSchema.parse`, `renderBatch.ts`, `ReelPreview.tsx`). `RecipeEditor.tsx`'s beat
kind picker has a "Custom (layers)" option; picking it shows `LayerCanvas.tsx` (drag/resize/rotate)
plus `LayerEditor.tsx`'s form below it for everything else the schema supports (text source including
phrase-field binding, color including theme/opposite-theme tokens, shape/fill/stroke/corner-radius,
enter/exit animation) - clicking a layer on the canvas or in the form selects it in both. Verified via
Playwright against the real dev server: dragging/resizing/rotating a layer and reading the values back
from the form confirmed each interaction updates real state, and saving a custom-beat recipe through
the actual `POST /api/recipes` (real Zod validation) worked with zero console/page errors.

**UX polish, based on hands-on feedback after the above landed:** shape layers gained `triangle`,
`star`, and `line` (on top of `rect`/`circle`/`ring`); image layers can be populated by uploading a
file (`POST /api/assets/images`, saved to `assets/images/` - gitignored like `assets/music/` - and
served via `staticFile()` the same way at edit time and render time) instead of typing an asset path
by hand; a multi-layer beat's field form collapses every layer but the selected one to a one-line
summary instead of stacking full forms (the vertical-scroll complaint); the canvas caps at 280px wide
instead of filling the column; Intro/Outro are collapsed by default (a "Show" toggle) since editing a
custom beat rarely touches them; and each per-phrase beat has a "Preview this beat" button that seeks
the live preview `Player` to that beat's own frame range (`inFrame`/`outFrame`) and loops just that,
instead of scrubbing the whole recipe to find it.

**What's still missing:** snapping/alignment guides on the canvas, and (unrelated to the canvas) a
genuinely new visual *primitive* beyond text/image/shape - e.g. video-clip support, still requires
code. The original 4-phase plan (renderer, chrome/contrast bindings, canvas, real schema wiring) is
otherwise complete, on `feature/layer-designer`.
