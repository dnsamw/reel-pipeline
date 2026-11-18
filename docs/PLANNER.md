# Planner

The Planner page (`/planner` in the GUI, "Plan → Planner" in the sidebar) is the one calendar for every social
post. The plan behind it is `studypal-lms/docs/16-social-content-pipeline.md` in the StudyPal workspace; this
file only covers the code. Status: **P1** (calendar, stock, pillars, slots, reserve) , **P2** (book lines as post source, repeat guard) and **P3** (week pack, stats matching, Facebook posting off); posts are still added by hand.

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

## Code

| File | What |
|---|---|
| `server/planner.ts` | Tables (`planner_slots`, `planner_pillars`, `planner_posts`, `planner_post_events` in `data/gui.db`), default slots + pillars (seeded once into empty tables), post CRUD with validation, reserve, stock level, pillar mix |
| `server/lmsCatalog.ts` | Read-only view of the LMS content export (`../studypal-lms/studypal-lms-api/content`, or `LMS_CONTENT_DIR`): book list, book outline (volumes → sections, or grammar units → lessons, with free flags) and the lines of a unit in one shape (`phrase`; grammar `mistake` / `example` / `hook` / `tip`). Unit ids are only accepted from the outline, never used as raw paths |
| `server/index.ts` | `GET /api/planner?from&to` (everything the page needs), `POST/PUT/DELETE /api/planner/posts[/:id]`, `POST /api/planner/posts/:id/fill` (reserve → slot), `PUT /api/planner/pillars/:id`, `PUT /api/planner/slots/:id`; source: `GET /api/planner/source/:book` (outline), `…/:book/lines?unit&date&post` (lines + who already uses them), `…/:book/suggest?date&count&kind&post` ("pick for me": unused lines, free units first); P3: `GET/POST /api/planner/week-pack` (preview / write), `POST /api/planner/mark-scheduled`, `POST /api/planner/stats/import` (CSV body), `POST /api/planner/stats/match` |
| `gui/src/pages/Planner.tsx`, `gui/src/plannerTypes.ts` | The page: stock card, 14-day grid, mix, reserve, pillar and slot editors, side-panel post editor |
| `server/weekPack.ts` | Week pack: rendered posts of a range in posting order → `studypal-lms/social-media/facebook-page/exports/week-<from>[_n]/` (or `SOCIAL_MEDIA_DIR`): `NN_<date>_<HHMM>_<kind>.<ext>`, `…_caption.txt`, `…_comment.txt` + image, `index.html` checklist with copy buttons, `pack.json`. A new folder each export, nothing overwritten. Time = a fixed 5-minute step inside the slot window taken from the post id (not the same minute every day). First comment from `marketing/first-comment/COMMENTS.md`: image posts only; Working Abroad / Travel → C, grammar → F, other English → A/B/D/E in turn; JP/KO/monk/brand none |
| `server/plannerStats.ts` | Business Suite posts CSV import into `platform_posts` (times are US Pacific; photo captions are in the Title column; reels keyed by video id) and matching Facebook posts to Planner posts (±1 Sri Lanka day, ≥ 60% caption word overlap, best pairs first). Linked posts become `published`, and `measured` 7 days after the post. Runs after every Insights refresh, after a CSV import, or on "Match now" |
| `gui/src/pages/PlannerWeekPack.tsx` | "Week pack & stats" tab: range, preview (order, time, file, comment variant, what's not ready), export, "mark scheduled", CSV import, Match now, posts that went out but weren't found |
| `gui/src/pages/PlannerSource.tsx` | Source lines in the post editor: unit picker (★ = free), tick lines, used lines greyed with the post that uses them, "Pick for me" (grammar: kind filter) |

## Statuses

`idea → drafted → approved → rendered → scheduled → published → measured`, plus `rejected` and `failed`.
**Stock** = `approved` and later. The stock card counts:

- **full days**: consecutive days from today where every active slot has a stock post (target 14; warning
  under 7, red under 3);
- **streak days**: consecutive days from today with at least one stock post;
- **need you**: `drafted` or `failed` posts from today on.

## Next phases (docs/16 §11)

~~P2 content picker + repeat guard~~ · ~~P3 week pack + stats matching~~ (done) · P4 Claude drafting, auto-approval (code checks + Claude critic), Grok scout notes, stock-photo
picker, Insights report on Claude · P5 feedback loop · P6 more platforms.
