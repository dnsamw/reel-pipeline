---
name: plan-week
description: Run StudyPal's weekly social batch session with the owner (Saturday after 02:00 Sri Lanka time) - review last weeks' Facebook stats, run the Grok scout, plan and draft the next 14 days in the Studio Planner, go through what needs the owner, then export the week pack. Use when the owner says "plan the week", "/plan-week", "weekly batch" or "fill the planner".
---

# Weekly batch session (studypal-lms/docs/16-social-content-pipeline.md §2)

Studio must be running (`npm run gui` in studypal-reels → API on http://localhost:4300). Everything goes through
its Planner API with `curl`; never write to `data/gui.db` directly, never post to Facebook (no Graph API posting,
docs/16 §7), never print how long app access lasts, never type prices (the code adds them).

Before any call that uses Claude or Grok, say how many calls it will make and get a yes (docs/16 §5: count calls
before any big batch).

## 1. Where we are

```bash
curl -s localhost:4300/api/planner | jq '{today, stock, mix: [.mix[] | select(.posts > 0 or .targetPct > 0)]}'
curl -s localhost:4300/api/planner/ai
```

Tell the owner: full days of stock (target 14), streak days, posts that need them, last week's AI call count.

## 2. Review (what worked)

Insights refreshes the Page's posts read-only and links them to Planner posts. Read the last 2 weeks:

```bash
curl -s "localhost:4300/api/planner?from=$(date -d '-14 days' +%F)&to=$(date +%F)" \
  | jq '. as $v | [.posts[] | select(.remoteId) | {date, slotId, pillarId, book, hook,
      views: $v.stats[.remoteId].metrics.views, reach: $v.stats[.remoteId].metrics.reach,
      reactions: $v.stats[.remoteId].metrics.likes, shares: $v.stats[.remoteId].metrics.shares}] | sort_by(-(.views // 0))'
```

Summarise in plain words: which pillars, slots and hooks got the most views/reach, which flopped, one thing to do
more of. If the stats look stale, ask the owner to press Refresh on the Insights page (or import the Business Suite
CSV in Planner → Week pack & stats).

## 3. Scout (Grok, 3 calls, a few minutes)

```bash
curl -s -X POST localhost:4300/api/planner/scout -H 'content-type: application/json' -d '{}'
# poll until .running is null, then read the notes
curl -s localhost:4300/api/planner/scout | jq '.running, [.notes[] | {topic, at, text: .text[0:1500]}]'
```

Pick out what is useful for the next 2 weeks (Poya days, exam dates, EPS-TOPIK / JLPT news). Grok's notes are
input, never posts; check any date you lean on against its source link.

## 4. Plan + draft + review (Claude)

```bash
FROM=$(date -d '+1 day' +%F); TO=$(date -d '+14 days' +%F)
curl -s "localhost:4300/api/planner/batch/estimate?from=$FROM&to=$TO&scout=0"
```

Tell the owner the slots and the call count, then start it (scout already ran, so `scout: false`):

```bash
curl -s -X POST localhost:4300/api/planner/batch -H 'content-type: application/json' \
  -d "{\"from\":\"$FROM\",\"to\":\"$TO\",\"scout\":false}"
curl -s localhost:4300/api/planner/batch | jq '{state, created, drafted, approved, needsYou, log: .log[-8:]}'
```

Poll every minute or so until `state` is `done` or `failed`. If some ideas weren't written, `POST
/api/planner/batch/cleanup` with the same range removes them (or run the batch again for the gaps).

## 5. Go through it with the owner

```bash
curl -s "localhost:4300/api/planner?from=$FROM&to=$TO" \
  | jq '[.posts[] | select(.status=="drafted") | {id, date, slotId, title, hook, statusReason, notes: .review.criticNotes}]'
```

For each post that needs the owner: say why (statusReason, the critic's notes), suggest the fix. The owner decides in
the Planner (Weekly batch tab → Need you, or the post editor: edit, **save & review again**, approve, or reject with a
reason). Then ask them to look through **Auto-approved** in the same tab. Rejections always need a reason
(`POST /api/planner/posts/:id/reject {"reason": "..."}`): the writer reads them next week.

If a rejection shows a rule the code doesn't check yet, add it to `BANNED` or `codeChecks()` in
`server/planReview.ts` (docs/16 §10.1: "the gap becomes a new code check").

## 6. Photos, make, export

- `curl -s localhost:4300/api/planner/photos | jq '[.[] | select(.low)]'`: tell the owner which folders to
  download more photos for (Unsplash, rules in `studypal-lms/social-media/stock-images/README.md`).
- Approved posts are rendered in Studio (Post Creator / Remotion). A rendered post gets `status: rendered` and its
  `mediaPath`.
- Planner → **Week pack & stats** → Export. The owner loads it into Meta Business Suite by hand, then presses
  **mark scheduled**.
