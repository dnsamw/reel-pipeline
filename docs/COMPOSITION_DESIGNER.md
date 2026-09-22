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
custom beat rarely touches them - and that Hide/Show state now drives `ReelPreview.tsx` too (its
`showIntro`/`showOutro` props), so a hidden Intro/Outro is skipped in the preview's playable range
(`inFrame`/`outFrame`) as well, not just hidden from the form while still looping in the player; and
each per-phrase beat has a "Preview this beat" button that seeks the live preview `Player` to that
beat's own frame range and loops just that, instead of scrubbing the whole recipe to find it.

**What's still missing:** snapping/alignment guides on the canvas, and (unrelated to the canvas) a
genuinely new visual *primitive* beyond text/image/shape - e.g. video-clip support, still requires
code. The original 4-phase plan (renderer, chrome/contrast bindings, canvas, real schema wiring) is
otherwise complete, on `feature/layer-designer`.

## Data binding: a future-proof registry + a structured graph editor

Real testers tried the branch and called it "too confusing, not user friendly" - specifically:
picking a phrase field from a plain dropdown wasn't visual enough, and the whole editor needed a
more drag-and-drop feel. They also flagged that more data models beyond `BookPhrase` are coming and
asked for the binding system to not need a rewrite when that happens.

**Registry, not a hardcoded enum**: `src/data/dataSources.ts` is a small, Prisma-free registry
(same isolation discipline as `src/data/phrase.ts`) of `DataSourceDescriptor`s - today just
`BookPhrase`'s 5 text fields. `compositionRecipeSchema` gained `dataSourceId` (defaults to
`"BookPhrase"`), and `layers/schema.ts`'s `textRefSchema` renamed its `phraseField` variant to
`dataField`, widening `field` from a closed 5-value enum to an open `string` - validated against the
active recipe's registry entry in the GUI, resolved as a plain property lookup by
`LayerRenderer.tsx` (functionally identical to before; `Phrase` is still the only shape ever passed
in). `GET /api/data-sources` exposes the registry to the GUI. Adding a real second source later
means one more registry entry plus that model's own Prisma-isolated fetch file - the recipe schema,
`LayerRenderer.tsx`, and every GUI component that reads the registry stay unchanged.
**Deliberately not built**: a generic multi-model fetch/batch/manifest pipeline - no second source
exists yet, so there's nothing real to design that against. `renderBatch.ts`, `manifest.ts`,
`batch.ts`, `getPhrases.ts` are untouched by this whole change (confirmed via an empty `git diff`)
- rendering and rendered/not-rendered tracking work exactly as before.

**`DataGraph.tsx`**: a *structured* node graph, not a free-form ComfyUI clone - beats stay in their
existing fixed left-to-right array order (reordering is still the move-left/move-right buttons, not
a wire, so render order can never be accidentally rewired by dragging the wrong connection). Only
data bindings are free wires: drag a dot from the Data Source node's field list onto a text layer's
input socket anywhere in the sequence to bind it; drag onto empty space inside a `custom` beat's
column to create a new bound text layer there. Intro/Outro nodes get no input socket at all -
`IntroScene`/`OutroScene` render once per whole reel, not once per phrase, so there's no single
`phrase` in scope for them to bind to (already true before this: `introTextSchema` never offered a
phrase-field option). Clicking any node selects/scrolls to the matching card in the existing
per-beat form below and focuses the live preview on it (reusing "Preview this beat"); clicking
Intro/Outro toggles their existing Show/Hide state. Sits above `LayerEditor.tsx`'s form and
`LayerCanvas.tsx`'s spatial drag/resize/rotate surface - both untouched, since they answer a
different question ("what data feeds this" vs. "what does this say" vs. "where is this on screen")
and deliberately stay separate rather than merging drag-to-wire and drag-to-move into one crowded
canvas.

Verified via Playwright against the real dev server: dragged a field's socket onto an existing text
layer (confirmed the form's text source updated to the binding), dragged a field onto empty
custom-beat space (confirmed a new bound layer appeared), clicked a beat node (confirmed the
"Preview this beat" state followed), clicked the Intro node (confirmed its Show/Hide button
flipped), saved through the real `POST /api/recipes` - zero console errors. A real `remotion still`
render via `Reel-Custom` with two `dataField`-bound layers (`explanation`, `pronunciationSi`)
confirmed the renamed binding still resolves correctly in the actual production renderer, not just
the browser preview.

## The canvas-style rebuild: multi-track timeline + a real node-graph library

The vertical stacked-card editor and the hand-rolled data-binding graph above were both real, working
features - and both still got real user feedback that they were confusing, and that the graph
specifically didn't read as "node-graph" at all. Rather than iterate blind a third time, two throwaway
evaluation spikes were built and shown to the user before committing to a rebuild: one on
`@xyflow/react` (React Flow - MIT, actively maintained; the library ComfyUI-style tools are actually
built on) for the graph feel, one on plain pointer events (the same technique already proven in
`LayerCanvas.tsx`) for a real timeline feel. Both were approved, and only then was the full page
rebuilt around them - see the two "AskUserQuestion" decisions in the project history: **structured**
graph/timeline (beats stay in their existing array order; only data bindings are free wires) over a
true free-form ComfyUI clone, and **stay in this Vite+Express project** over a Next.js rewrite (the
render pipeline/data layer were never the problem - library choice inside the editor was).

**Per-layer timing, the data-model change that makes "multi-track" real:** `layers/schema.ts`'s three
layer kinds gained an optional `timing: { startFrame, durationFrames }` - omitted means "spans the
whole beat" (the only behavior that existed before), so nothing stored anywhere needed to change.
`LayerRenderer.tsx`'s `LayerView` computes a layer-local frame/duration from this and returns `null`
outside the window, feeding the local values into the existing enter/exit animation math. Verified
with a real production still render at two frames: a layer trimmed to frames 45-89 of a 90-frame beat
is absent before frame 45 and present after, in the actual `Reel-Custom` output.

**`Timeline.tsx`** (new) - the primary navigation surface, replacing the old vertical beat-card list:
- **Beats track**: one block per `perPhraseBeats[i]` plus fixed Intro/Outro end-caps, widths from the
  real `buildTimelineFromRecipe` (the same function the actual renderer uses) with `batchSize=1`, so
  the timeline never drifts from what actually renders. Drag to reorder (a real array splice, not
  adjacent-swap), drag the right edge to resize - only `custom` beats have their own
  `durationInFrames` to resize (others derive duration from shared config, the same constraint that
  already existed).
- **Layers track**: appears only under the selected `custom` beat, one row per layer, driven by its
  new `timing` field - drag moves `startFrame`, drag the edge resizes `durationFrames`. A layer with
  no room to move (its trim already spans the whole beat) correctly can't be dragged until it's been
  shrunk first - not a bug, the same constraint a real video editor's full-width clip has.

**`DataGraph.tsx`** rebuilt on real React Flow nodes/handles/edges instead of hand-rolled pointer/SVG
math, and re-scoped to *only the selected beat's layers* (not the whole recipe at once, which
`Timeline.tsx` already shows) - real pan/zoom/minimap, real connectable handles. Dragging a field's
handle onto a text layer's handle binds it (`onConnect`); dropping on empty canvas creates a new bound
layer there (`onConnectEnd`, checking `connectionState.isValid`).

**`Inspector.tsx`** (new, absorbing `LayerEditor.tsx`'s retired form) - fields for exactly whatever the
shared `selection` (`{ beatIndex: number | "intro" | "outro" | null, layerId }`) points at: one beat's
kind-specific options, one layer's full field set, or Intro/Outro's own theme/voice/text fields (a real
gap caught during the rebuild - the first draft dropped Intro/Outro editing entirely by only reusing
the old per-phrase-beat card content). Exactly one thing's fields show at a time - no more scrolling
past a growing stack of cards. `LayerCanvas.tsx` (spatial drag/resize/rotate, internals untouched)
lives inside this panel, scoped to the selected beat.

**Sidebar**: collapsible to an icon-only rail (`lucide-react`, ISC-licensed), state in `localStorage`
(a per-viewer convenience, never authoritative - same discipline as every other browser-storage use in
this GUI).

**What this deliberately doesn't build yet** (flagged by the user as upcoming, not immediate): a
richer animation-curve editor beyond the current fade/slide/scaleSpring set, sound FX bound to a
transition, transition types beyond the current single fixed crossfade-before-outro. Nothing here
blocks adding them later.

Verified end-to-end via Playwright against the real dev server: sidebar collapse persists across a
reload; adding and selecting a beat, switching its kind to Custom, shows the Layers track and scopes
the Graph panel; resizing a beat block and (after first shrinking a layer to make room) moving a layer
block both update real `durationInFrames`/`timing` state; a real React Flow drag-connect binds a field
to a layer (confirmed via `Playwright`'s `dragTo`, after raw synthesized coordinates twice missed the
handle's exact hit-area by a few pixels - a test-precision artifact, not a product bug, the same
pattern hit twice earlier in this project's Playwright verifications); selecting Intro shows its real
editable fields and the Show/Hide-in-preview toggle; saving through the real `POST /api/recipes`
succeeds with zero console errors. `renderBatch.ts`/`manifest.ts`/`batch.ts`/`getPhrases.ts` are
untouched (empty `git diff`) - rendering and rendered/not-rendered tracking work exactly as before.

## Graph-centric editing: DAW/video-editor conventions instead of a web form

Still more feedback after the Timeline/Graph/Inspector rebuild landed ("now that's more like it, but
not exactly what I want"): reclaim horizontal space for the data-binding graph (clarified: "canvas" in
this round of feedback means the graph - "the one that looks like ComfyUI" - not the spatial
`LayerCanvas.tsx`, which wasn't part of this feedback and stayed untouched), replace labeled
input-field rows with compact icon/knob controls, add layers from a toolbar instead of a button
buried in a form, edit/delete a layer right where it lives instead of in a separate column, and float
the live preview so it doesn't force scrolling to check it.

**`Knob.tsx`** (new) - a DJ-console-style control: drag vertically to change a numeric value, an
indicator line sweeps -135deg to +135deg across the value's range, a tooltip/drag-bubble shows the
exact number. Plain pointer events, same technique as every other drag interaction in this project
(`LayerCanvas.tsx`, `Timeline.tsx`, `DataGraph.tsx`'s wires) - no new dependency for something this
simple. **`IconToggleGroup.tsx`** (new) - a row of icon buttons (one active, each with a tooltip),
the compact replacement for a labeled `<select>` on enum fields (align, font, shape, color/text
source, animation type). Both are generic/reusable, not specific to layers.

**`DataGraph.tsx`** absorbed everything `Inspector.tsx` used to show for a `custom` beat's layers:
- A toolbar (Text/Shape/Image icon buttons) at the top adds a new layer node directly, auto-selected.
- The beat's own theme (icon-toggle Sun/Moon) and duration (a Knob, in seconds) sit next to the
  toolbar - the whole "editing this custom beat" experience lives in one card now.
- Clicking a layer node opens `LayerPropertyPanel.tsx` beside the canvas (docked to the graph card's
  side, not trying to track the node's exact pan/zoom screen position - fragile, and not what was
  asked for) - Knobs for `fontSizePx`/`fontWeight`/`strokeWidthPx`/`cornerRadiusPx`/animation
  duration-delay-fromScale, `IconToggleGroup`s for `align`/`font`/shape/`text source`/`color
  source`/animation type. A few fields genuinely can't be a knob or icon (literal text content, a hex
  color, an uploaded file) and stay as a plain, unlabeled input with a tooltip - matching the "icons
  and tooltips, not labeled rows" spirit without forcing a bad fit.
- Deleting a layer happens in the graph itself - Delete/Backspace on a selected node (React Flow's
  native `onNodesDelete`) or a trash icon in the property panel.

**`Inspector.tsx`** shrank to only what has no layer/node metaphor: Intro/Outro (theme, voice,
literal-text toggle - unchanged content) and non-`custom` beat kinds (`guessReveal`'s theme/
direction, or nothing to configure). `RecipeEditor.tsx` doesn't even mount it when a `custom` beat is
selected - instead it shows `DataGraph` and `LayerCanvas` side by side, full width, since both are
now genuinely interactive canvases with nothing left for a form column to add. That's what actually
reclaims the horizontal space - not the sidebar collapse alone.

**Live preview** is now `position: fixed`, top-right, still toggled by the existing show/hide button
- verified to hold its screen position through a 600px scroll rather than being pushed down the page.

Verified via Playwright against the real dev server (with deliberately slow, multi-step pointer
moves this round - single fast `mouse.move` jumps produced two false-negative "didn't move" readings
earlier in this project, not real bugs): adding a Shape layer via the toolbar creates a second graph
node and opens its property panel; dragging the beat-duration Knob changes the Timeline block's real
width; dragging a Knob in the property panel doesn't crash; clicking a shape-type icon-toggle updates
the field; the trash icon removes a layer node; selecting Intro shows Inspector (with the Graph
toolbar correctly absent) instead of the Graph+LayerCanvas pair; saving through the real
`POST /api/recipes` succeeds with zero console errors. `git diff --stat` on
`src/render`/`LayerRenderer.tsx` is empty - this round touched only the GUI layout/interaction layer.

## Full-bleed workspace: floating/draggable panels instead of a laid-out page

"This is way better, but we need more refinements" - the graph-centric round still left a lot of
unused horizontal space (the page was capped at `.app-main`'s standard 1400px max-width, centered,
like every other GUI page), the live preview was small, and Timeline/Position permanently consumed
layout space even when not the current focus. The ask: make this one page behave like a real
DAW/NLE workspace - one large canvas, everything else floats over it and can be dragged out of the
way or hidden.

**`FloatingPanel.tsx`** (new, generic, reusable) - a draggable, closeable panel: a titlebar (plain
pointer-drag, same technique as everywhere else in this project) repositions it, an optional `onClose`
adds an X. Not tied to any one panel's content.

**`RecipeEditor.tsx`'s root is now `position: fixed`**, offset by a `--sidebar-width` CSS custom
property (set by `App.tsx` on the `.app` root, toggled alongside the sidebar's own collapse state) -
this is what lets the page ignore `.app-main`'s max-width/padding entirely without a special case
there: fixed-position elements are placed relative to the *viewport*, not their parent, so an ancestor's
`max-width`/`padding` simply doesn't apply. Verified this actually reaches full-bleed: a real
`getBoundingClientRect()` check showed the graph's own box filling exactly `(viewport - sidebar) x
(viewport - topbar)` - not close, exact.

- **`DataGraph.tsx`** is now the workspace's base layer - `position: absolute; inset: 0` filling
  the whole area, `<ReactFlow>` itself sized to match. Its former toolbar (add-layer buttons, beat
  theme/duration) and the `LayerPropertyPanel` both moved into `FloatingPanel`s laid over the canvas
  instead of pushing it into a smaller box.
- **Timeline, Live preview, and Position (`LayerCanvas`)** are now `FloatingPanel`s inside the
  workspace instead of stacked/side-by-side cards. Live preview is bigger by default (340px vs. the
  previous 220px) and, being just a normal floating panel now, fully draggable. Position only
  renders when a layer is actually selected ("needed only when an element is selected") and
  re-opens itself on a newly-selected layer even if it was closed for a previous one. Small toggle
  buttons in the topbar reopen a closed Timeline/Preview; Position's own close (X) plus re-selecting
  a layer is how it comes back.
- Everything not part of the floating-panel workspace (the top name/data-source/Save/Push bar) stays
  a normal, always-visible strip - not everything needed to float, just the tool palettes.

Verified via Playwright against the real dev server: the page has no vertical scroll at all
(`document.documentElement.scrollHeight` equals the viewport height exactly) - confirming the fixed,
full-viewport model actually took effect, not just visually; the graph's bounding box measured
exactly `(1800-220) x (1000-60)` px against an 1800x1000 viewport with the sidebar expanded; dragging
the Timeline panel by its titlebar moved its real screen position; closing and reopening the Live
preview panel via the topbar toggle worked; the Position and Layer-property panels both appeared on
selecting a layer. Zero console errors throughout.

## Fixed a real bug (nodes "disappearing"), docked Timeline/beat-tools, per-node summon buttons

Reported: dragging a Knob in the layer property panel made every graph node - including the
Data Source node - visually vanish; recovering required deselecting and reselecting the custom beat
(which fully unmounts/remounts `DataGraph`).

**Root cause**, confirmed with an instrumented Playwright repro (polling `.react-flow__node` count
and reading `.react-flow__viewport`'s transform on every step of a slow, paced knob drag): node
count never changed - nodes were never removed. `<ReactFlow>`'s `fitView` boolean prop was
recalculating the pan/zoom transform on every rapid `setNodes`/`setEdges` call (the node-rebuilding
`useEffect` re-running on every knob-drag tick), eventually panning/zooming the nodes out of the
visible area even though they stayed in the DOM.

**Fix**: removed the reactive `fitView` prop; replaced it with `onInit={(instance) =>
instance.fitView({ padding: 0.3 })}` so the view auto-fits exactly once, when `<ReactFlow>` first
mounts (switching between a non-custom and a custom beat unmounts/remounts it; `<Controls
showInteractive={false}>` already has a manual fit-view button for the remaining case of switching
directly between two different custom beats). Also switched the node-rebuilding effect to the
functional `setNodes((current) => ...)` form, looking up each node's existing position before
falling back to a computed default, so edits no longer reset every node's position on every change -
one less source of churn. Re-ran the same repro after the fix: the viewport transform is now
provably stable (identical, unchanging) at every single step of the drag, and a screenshot confirmed
both nodes stayed rendered and visible throughout.

**Per-node summon buttons** replace the old "select a node → its Position and Layer-properties
panels force themselves open, often far from the node" behavior. `LayerNodeComponent` now renders
two small circular icon buttons in its top-right corner: a purple crosshair (Position) and a gold
gear (Layer properties) - colored via `--primary`/`--gold` so they read as distinct, meaningful
toggles, each lighting up solid when its panel is open for that node. Clicking a node's body only
selects/highlights it; clicking either icon button selects the node *and* opens that specific panel,
anchored near the button's actual screen position (`getBoundingClientRect()` on the button, made
relative to the graph's own wrapper `ref`, then clamped so the panel can't land partly off-screen).
Closing a panel (its own X) just closes that panel - it no longer deselects the node. The Layer
Properties panel lives in `DataGraph.tsx` (`propertiesFor` state); Position lives up in
`RecipeEditor.tsx` since it renders `LayerCanvas` there, reached via a new `onRequestPosition`
callback prop carrying the already-clamped anchor down from `DataGraph`.

**Timeline is now docked to the bottom, full width** (`.timeline-dock` - `position: absolute; left:
0; right: 0; bottom: 0`) instead of a freely-draggable `FloatingPanel`, with its own header/close
button styled like a `FloatingPanel`'s but without the drag handle.

**The "Custom beat" toolbar is now a docked vertical strip** (`.beat-tools-dock`, 60px wide) pinned
to the graph's left edge - since the workspace itself already starts immediately right of the
collapsible global sidebar, this strip lands exactly "next to the sidebar" as asked. Add
Text/Shape/Image buttons, the theme `IconToggleGroup` (now supports a `direction="column"` prop),
and the duration `Knob` all stack vertically; the previous descriptive hint paragraph became a
single info-icon button carrying the same text as its tooltip, to keep the strip narrow.

Verified via Playwright against the real dev server (slow, multi-step pointer moves throughout, per
this project's established lesson about false-negative fast-jump readings): Timeline's box spans the
full workspace width flush to the bottom; the beat-tools strip sits flush to the workspace's left
edge; a plain click on a node opens neither panel; clicking the gear/crosshair icons opens Layer
properties/Position near that node and clamped fully on-screen; dragging the delay Knob afterward
keeps both nodes visible with a provably stable viewport transform throughout the drag; closing the
properties panel leaves the node selected. `git diff --stat` on `src/render`/`LayerRenderer.tsx` is
empty - this round touched only the GUI layout/interaction layer.

## Finding the real cause of the disappearing nodes (the fitView fix wasn't the whole story)

The user reported the "nodes disappear while dragging a Knob" bug again after the fitView fix above,
this time from the beat-duration Knob specifically, screenshotted mid-drag with the graph canvas
completely blank. The earlier fix (one-time `onInit` fitView) was real and necessary, but insufficient
- it addressed one mechanism (the viewport panning/zooming itself out of the nodes) while a second,
independent one was still live.

Reproducing it needed a sharper instrument than before: node count and `.react-flow__viewport`'s
transform (what the earlier repro checked) stayed perfectly normal throughout - the actual defect
was each node's `visibility: hidden`, which doesn't zero out `getBoundingClientRect()` or change node
count, so the earlier checks were blind to it. Caught it with an in-page `requestAnimationFrame` loop
recording any frame where a `.react-flow__node` was zero-size, `display: none`, or `visibility:
hidden` - polling *inside the page* every frame, not just at the points a Playwright script happens
to sample between synthetic mouse moves. Against the pre-fix code this immediately caught **200
consecutive frames of `visibility: hidden` on every node** during a single fast drag of the
beat-duration Knob; the same instrumented drag against the three Layer-properties Knobs (size,
weight, delay) showed none - isolating the bug to the specific case of a beat-level edit (duration,
also theme) rather than a layer edit.

**Root cause**: `DataGraph.tsx`'s node-rebuilding `useEffect` was keyed on the whole `customBeat`
object, and on every edit it built entirely new node objects from scratch, copying over only
`.position` from the previous ones. A beat-duration or theme edit replaces the beat object (so the
effect re-ran) without touching `customBeat.layers` at all - work the effect didn't actually need to
do. Worse, discarding each node's previous object wholesale - rather than updating it in place - also
threw away React Flow's own internal bookkeeping on it (its measured width/height, set via
`ResizeObserver` after first render). A node React Flow considers unmeasured renders with `visibility:
hidden` until it's re-measured; rebuilding fresh, unmeasured-looking node objects many times a second
during a fast Knob drag reproduced exactly that hidden state for a sustained run of frames.

**Fix**, two parts in `DataGraph.tsx`:
1. The effect is now keyed on `customBeat?.layers` instead of `customBeat` itself - a duration or
   theme edit leaves the `layers` array reference untouched, so the rebuild simply doesn't run for
   those edits anymore.
2. When it does run (an actual layer add/remove/edit), each node is now built by spreading the
   *existing* node object first (`{ ...existing, position, data }`) instead of constructing a bare
   new one - preserving whatever internal fields React Flow had already attached to it, not just its
   position.

Verified with the same instrumented rAF monitor: 0 flicker frames across 8 rounds of a fast,
unpaced beat-duration-Knob drag (previously 200), and 0 across the three Layer-properties Knobs.
Confirmed the monitor itself wasn't just insensitive by re-running it against the pre-fix code via
`git stash` - it reliably reproduced the 200-frame failure there, then 0 after `git stash pop`
restored the fix. `git diff --stat` on `src/render`/`LayerRenderer.tsx` is empty.
