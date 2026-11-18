# Planner

The Planner page (`/planner` in the GUI, "Plan → Planner" in the sidebar) is the one calendar for every social
post. The plan behind it is `studypal-lms/docs/16-social-content-pipeline.md` in the StudyPal workspace; this
file only covers the code. Status: **P1** (calendar, stock, pillars, slots, reserve), **P2** (book lines as post source, repeat guard), **P3** (week pack, stats matching, Facebook posting off) and **P4** (Claude drafts the empty slots, auto-approval, Grok scout, stock-photo picker, Insights on Claude). Approved **image** posts are rendered automatically (Hook photo template); reels are still rendered by hand.

## Rules it enforces

- **No posting through the Facebook Graph API.** The owner schedules posts by hand in Meta Business Suite;
  `scheduled` is ticked in the Planner, `published` / `measured` come from the stats match. Reading stats through
  the API (Insights) is allowed. Studio's Facebook publish target is **off** (`server/distribution/index.ts`:
  shown as "Off" in the Publish panel and refused on the server) unless `FACEBOOK_POSTING=on` is set in `.env`.
- Days are **Sri Lanka** days (`Asia/Colombo`), slot times are Sri Lanka local time.
- `rendered` / `scheduled` / `published` / `measured` posts must have a media file.
- Rejecting keeps the reason (`planner_post_events`), for next week's drafts. Deleting forgets the post.
- **Repeat guard:** a book line is not used again within **90 days** (before or after the post's day), a background
  photo not within **30 days**. Lines are compared by their text (case, spacing and punctuation ignored), so the
  same line in two books, or after an export renumbers ords, is still caught. Rejected posts don't count; reserve
  posts always count and are checked as if they went out today. The server refuses a repeat on save; an old post
  can still be edited as long as its lines, photo and day stay the same.
- A post's `source` is `{ book, unit, unitTitle, free, lines: [{ id, text }] }`; the line text is kept in the post.
- **Auto-approval** (docs/16 §10.1): a `drafted` post becomes `approved` (with the auto flag) only when every code
  check passes, the Claude critic scores ≥ 4 on hook, Sinhala, accuracy and rules, and nothing needs the owner.
  Code checks: lines exist in the export and are quoted exactly, the sales block is the code's (≤ 2 lines, prices
  from `products.ts`), no typed prices or links, no banned words / bait / lifetime / access length, hook ≤ 12
  words, no repeat, image posts have a stock photo that exists, the slot fits the pillar and the type. Always need
  the owner: brand and launch pillars, the 18+ book, `ai-grok-` photos, a claim the critic finds that isn't in the
  book. Template: image posts must use a known template, and until the owner has scheduled one post made with
  the Hook photo template, every image post waits for them ("a template's first use").
- **Rendering:** approved image posts are rendered with `studypal-hook-photo` (1080×1350): the post's stock photo
  (loaded through `/api/planner/stock-image`, nothing copied), its hook in the box, the book in the top pill
  (no arrow, `topPillArrow: none`), "N lines below" in the bottom pill. The batch renders what it approves; the
  Weekly batch tab has **Render approved**, the editor **Render**. PNGs go to `output/posts/`, the post becomes
  `rendered` with that `mediaPath`. Reels aren't rendered here (the reel renderer reads the legacy phrase DB and
  spends TTS quota).
- **Captions:** Claude writes hook + body + hashtags only; the code adds the sales block (`server/salesBlock.ts`):
  line 1 the offer with prices read from `studypal-lms-api/src/config/products.ts` (or "details in the first
  comment" for English/grammar image posts), line 2 the link (`app.studypal.store/learn/<book>/<vol>/<n>` for a
  free section, else the landing page).
- **Claude and Grok** run as CLIs on the owner's subscriptions (`server/ai/cli.ts`): Claude with no tools and no MCP,
  in a temp folder; every call is logged in `ai_calls`. The batch asks before it runs and shows the call count.
- Rejecting (Weekly batch tab or the editor) needs a reason and moves a ready reserve post into the slot.

## Code

| File | What |
|---|---|
| `server/planner.ts` | Tables (`planner_slots`, `planner_pillars`, `planner_posts`, `planner_post_events` in `data/gui.db`), default slots + pillars (seeded once into empty tables), post CRUD with validation, reserve, stock level, pillar mix |
| `server/lmsCatalog.ts` | Read-only view of the LMS content export (`../studypal-lms/studypal-lms-api/content`, or `LMS_CONTENT_DIR`): book list, book outline (volumes → sections, or grammar units → lessons, with free flags) and the lines of a unit in one shape (`phrase`; grammar `mistake` / `example` / `hook` / `tip`). Unit ids are only accepted from the outline, never used as raw paths |
| `server/index.ts` | `GET /api/planner?from&to` (everything the page needs), `POST/PUT/DELETE /api/planner/posts[/:id]`, `POST /api/planner/posts/:id/fill` (reserve → slot), `PUT /api/planner/pillars/:id`, `PUT /api/planner/slots/:id`; source: `GET /api/planner/source/:book` (outline), `…/:book/lines?unit&date&post` (lines + who already uses them), `…/:book/suggest?date&count&kind&post` ("pick for me": unused lines, free units first); P3: `GET/POST /api/planner/week-pack` (preview / write), `POST /api/planner/mark-scheduled`, `POST /api/planner/stats/import` (CSV body), `POST /api/planner/stats/match`; P4: `GET /api/planner/ai`, `GET /api/planner/batch/estimate`, `GET/POST /api/planner/batch`, `POST /api/planner/batch/cleanup`, `GET/POST /api/planner/scout`, `GET /api/planner/photos`, `GET /api/planner/photo-pick`, `GET /api/planner/stock-image?path`, `GET /api/planner/posts/:id/check`, `POST /api/planner/posts/:id/review`, `POST /api/planner/posts/:id/reject` |
| `gui/src/pages/Planner.tsx`, `gui/src/plannerTypes.ts` | The page: stock card, 14-day grid, mix, reserve, pillar and slot editors, side-panel post editor |
| `server/weekPack.ts` | Week pack: rendered posts of a range in posting order → `studypal-lms/social-media/facebook-page/exports/week-<from>[_n]/` (or `SOCIAL_MEDIA_DIR`): `NN_<date>_<HHMM>_<kind>.<ext>`, `…_caption.txt`, `…_comment.txt` + image, `index.html` checklist with copy buttons, `pack.json`. A new folder each export, nothing overwritten. Time = a fixed 5-minute step inside the slot window taken from the post id (not the same minute every day). First comment from `marketing/first-comment/COMMENTS.md`: image posts only; Working Abroad / Travel → C, grammar → F, other English → A/B/D/E in turn; JP/KO/monk/brand none |
| `server/plannerStats.ts` | Business Suite posts CSV import into `platform_posts` (times are US Pacific; photo captions are in the Title column; reels keyed by video id) and matching Facebook posts to Planner posts (±1 Sri Lanka day, ≥ 60% caption word overlap, best pairs first). Linked posts become `published`, and `measured` 7 days after the post. Runs after every Insights refresh, after a CSV import, or on "Match now" |
| `gui/src/pages/PlannerWeekPack.tsx` | "Week pack & stats" tab: range, preview (order, time, file, comment variant, what's not ready), export, "mark scheduled", CSV import, Match now, posts that went out but weren't found |
| `server/ai/cli.ts` | `claude()` (`claude -p --output-format json --tools ""`, optional JSON schema → `structured`) and `grok()` (`grok --prompt-file … --output-format json`), call log `ai_calls`, `cliVersion()`. `CLAUDE_BIN`, `GROK_BIN`, `PLANNER_CLAUDE_MODEL` |
| `server/ai/client.ts` | `chat()` used by Insights and AI captions: **Claude by default**; `AI_PROVIDER=nvidia` goes back to Kimi on NVIDIA |
| `server/planWeek.ts` | The batch: `planSlots()` (empty slots → the pillar furthest behind its share, allowed in that slot, not twice a day), books least used in 30 days (never the 18+ book), lines via `suggestSource()` (grammar: mistakes), photo via the picker, `idea` posts → Claude writes 6 per call → `drafted` → review. `estimateBatch()`, `startBatch()` (one at a time, background), `dropUnwrittenIdeas()` |
| `server/planReview.ts` | Code checks + Claude critic (a separate call, 6 posts per call) → `saveReview()`; `composeCaption()`, `expectedSales()`, `BANNED` (add a rule here when a rejection shows a gap) |
| `server/planRender.ts` | `renderPlannerPost()`, `renderApproved()`, `renderBlocker()`, `templateUsedBefore()`; routes `POST /api/planner/posts/:id/render`, `GET/POST /api/planner/render` (background run over a range) |
| `server/salesBlock.ts` | Prices from `products.ts`, the 2-line sales block per subject, `learnPath()` |
| `server/photoPicker.ts` | `stock-images/<subject>/<book folder>` (book 4 → `english/04-…`, J3 → `japanese/n5-j2-j4`, K4 → `korean/k4-…`) then `_shared`; not used in 30 days, least used first, `ai-grok-` last; `photoStock()` (under 6 free = low); `stockPhotoPath()` for serving |
| `server/scout.ts` | Grok scout: topics `jobs-abroad`, `dates`, `english-trends` (all name Sri Lanka); notes in `planner_scout_notes`; the writer reads the newest per topic (≤ 10 days old). Runs in the background (a topic can take minutes) |
| `gui/src/pages/PlannerBatch.tsx` | "Weekly batch" tab: range, limit, scout toggle, estimate (slots + calls), run + live log, clean up, auto-approved thumbnails with Reject…, need-you list, scout notes, photos running low |
| `.claude/skills/plan-week/SKILL.md` | `/plan-week`: the Saturday session with the owner through the API (stats review, scout, batch, go through what needs the owner, photos, export) |
| `gui/src/pages/PlannerSource.tsx` | Source lines in the post editor: unit picker (★ = free), tick lines, used lines greyed with the post that uses them, "Pick for me" (grammar: kind filter) |

## Statuses

`idea → drafted → approved → rendered → scheduled → published → measured`, plus `rejected` and `failed`.
**Stock** = `approved` and later. The stock card counts:

- **full days**: consecutive days from today where every active slot has a stock post (target 14; warning
  under 7, red under 3);
- **streak days**: consecutive days from today with at least one stock post;
- **need you**: `drafted` or `failed` posts from today on.

## Next phases (docs/16 §11)

~~P2~~ · ~~P3~~ · ~~P4 Claude + Grok batch~~ (done) · ~~image post rendering~~ · **Next:** reels for the Planner (needs a reel template that takes book lines, and TTS quota) · P5 feedback loop · P6 more platforms.
