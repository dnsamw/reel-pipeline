# Toward a composition designer

Today, adding a new visual composition means writing a new `Reel*.tsx` (its own `if/else` over a
hand-rolled timeline, its own `<Composition>` registration in `Root.tsx`, its own copy of the
prop-passing boilerplate) even when it would reuse scenes that already exist. This is a first step
toward not needing that: a schema for describing a composition as **data**, checked against all
three existing templates to see how much of them it actually covers.

**Status: schema + validated recipes only, on `feature/composition-designer-schema`.** Nothing here
is wired into rendering yet - `Reel.tsx`/`ReelTemplate2.tsx`/`ReelTemplate3.tsx` are unchanged and
still what actually renders. See [What this doesn't do yet](#what-this-doesnt-do-yet) for the real
next step.

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

### What this already buys you, even before Phase 1.5 is built

Because the recipe can freely recombine the *existing* six beat kinds, some compositions that
don't exist today become a JSON edit away once a generic renderer exists (see below) - no new
`.tsx`, no new `<Composition>` registration:

- Drop the countdown entirely: `perPhraseBeats: [phrase, reveal]` - straight phrase→answer, no
  guessing beat.
- Two guess-reveal beats back to back per phrase (prompt in English, then again in Sinhala) instead
  of one.
- A "Template 1 pacing but Template 3's dark theme and reversed prompt/answer" hybrid - today that
  would need a fourth hand-written file; with the recipe it's `perPhraseBeats: [guessReveal]` with
  `theme: "dark"`, `prompt: "translationSi"`.

### What this doesn't cover, and won't without a much bigger project

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

## What this doesn't do yet

This branch stops at "schema + validated recipes for the 3 existing templates" - on purpose, to
check the idea holds up before investing further. Not yet built, and the natural next step:

1. **A generic renderer** - one `CompositionFromRecipe.tsx` + a `buildTimelineFromRecipe()` (parallel
   to today's `buildTimeline`/`buildTimelineT2`) that reads a `CompositionRecipe` and dispatches to
   the right existing scene component per beat, replacing the hand-written `if/else` chains in all
   three `Reel*.tsx` files with one interpreter. `Root.tsx` would register recipes (built-in and,
   eventually, GUI-authored) instead of three hardcoded `<Composition>` blocks.
2. Once that exists, the GUI's "Composition" dropdown (currently a hardcoded `1|2|3`) becomes "pick
   a recipe," and a recipe becomes editable the same way template color presets already are
   (`server/templates.ts`'s SQLite + git-export pattern) - a form, not a canvas, with a live preview
   reusing `ReelPreview.tsx`.
3. **Known real gap surfaced by this exercise, independent of the designer work**: Template 3's
   intro text is a hardcoded constant that ignores `config.introText`/a saved template's override -
   the recipe models this correctly (`text: {source: "literal", ...}` vs `{source: "config.introText"}`),
   but until Phase 1.5 lands, the actual `ReelTemplate3.tsx` still has this inconsistency.
