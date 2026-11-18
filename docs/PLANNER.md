# Planner

The Planner page (`/planner` in the GUI, "Plan → Planner" in the sidebar) is the one calendar for every social
post. The plan behind it is `studypal-lms/docs/16-social-content-pipeline.md` in the StudyPal workspace; this
file only covers the code. Status: **P1** (calendar, stock, pillars, slots, reserve; posts added by hand).

## Rules it enforces

- **No posting through the Facebook Graph API.** The owner schedules posts by hand in Meta Business Suite;
  `scheduled` and `published` are ticked in the Planner. Reading stats through the API (Insights) is allowed.
- Days are **Sri Lanka** days (`Asia/Colombo`), slot times are Sri Lanka local time.
- `rendered` / `scheduled` / `published` / `measured` posts must have a media file.
- Rejecting keeps the reason (`planner_post_events`), for next week's drafts. Deleting forgets the post.

## Code

| File | What |
|---|---|
| `server/planner.ts` | Tables (`planner_slots`, `planner_pillars`, `planner_posts`, `planner_post_events` in `data/gui.db`), default slots + pillars (seeded once into empty tables), post CRUD with validation, reserve, stock level, pillar mix |
| `server/lmsCatalog.ts` | Read-only book list from the LMS content export (`../studypal-lms/studypal-lms-api/content`, or `LMS_CONTENT_DIR`), so every book and every future language can be picked |
| `server/index.ts` | `GET /api/planner?from&to` (everything the page needs), `POST/PUT/DELETE /api/planner/posts[/:id]`, `POST /api/planner/posts/:id/fill` (reserve → slot), `PUT /api/planner/pillars/:id`, `PUT /api/planner/slots/:id` |
| `gui/src/pages/Planner.tsx`, `gui/src/plannerTypes.ts` | The page: stock card, 14-day grid, mix, reserve, pillar and slot editors, side-panel post editor |

## Statuses

`idea → drafted → approved → rendered → scheduled → published → measured`, plus `rejected` and `failed`.
**Stock** = `approved` and later. The stock card counts:

- **full days**: consecutive days from today where every active slot has a stock post (target 14; warning
  under 7, red under 3);
- **streak days**: consecutive days from today with at least one stock post;
- **need you**: `drafted` or `failed` posts from today on.

## Next phases (docs/16 §11)

P2 content picker from the LMS export + repeat guard · P3 week-pack export for Meta Business Suite + stats
matching · P4 Claude drafting, auto-approval (code checks + Claude critic), Grok scout notes, stock-photo
picker, Insights report on Claude · P5 feedback loop · P6 more platforms.
