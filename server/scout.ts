import { randomUUID } from "node:crypto";
import { grok } from "./ai/cli";
import { db } from "./db";
import { todaySriLanka } from "./planner";

/**
 * Grok scout notes (studypal-lms docs/16 §2 step 2, §5): trends, hooks and
 * dates coming up, from Grok's web and X search. Notes are input for
 * Claude's drafts, never posts. Untargeted X queries return non-Sri-Lankan
 * accounts (tested 2026-11-18), so every prompt names Sri Lanka / Sinhala
 * and the exact topic.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS planner_scout_notes (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    at TEXT NOT NULL,
    text TEXT NOT NULL
  );
`);

export interface ScoutNote {
  id: string;
  topic: string;
  at: string;
  text: string;
}

const COMMON = [
  "Reply with the list only: no plan, no preamble, no notes about how you searched.",
  "Answer in English, as a short list (at most 8 items). Each item: what it is, the date if any, a source link, and why it matters to a Sinhala-speaking learner in Sri Lanka.",
  "Only items about Sri Lanka or Sri Lankans (or official news from Korea/Japan/Israel/the Middle East that affects Sri Lankan workers). Skip anything you can't link to a source. Don't invent numbers.",
  "End with 3 hook ideas for a Facebook post, written in natural Sinhala, each under 12 words.",
].join("\n");

export const SCOUT_TOPICS: Record<string, { label: string; prompt: (today: string) => string }> = {
  "jobs-abroad": {
    label: "Jobs abroad",
    prompt: (t) =>
      `Today is ${t}. Search X and the web for what Sri Lankans have been talking about in the last 7 days about going abroad for work: Korea EPS-TOPIK (exam dates, quotas, HRD Korea / SLBFE notices), Japan (SSW / Tokutei Ginou, JLPT, TITP), Israel (caregiver, agriculture), the Middle East, Europe. Include SLBFE announcements and scams people are warned about.\n${COMMON}`,
  },
  dates: {
    label: "Dates coming up",
    prompt: (t) =>
      `Today is ${t}. List dates and events in the next 21 days that matter to Sri Lankan learners and job seekers: Poya days and public holidays in Sri Lanka, G.C.E. O/L and A/L exam dates or results, school terms, EPS-TOPIK and JLPT test or registration dates for Sri Lanka, Japan/Korea intake deadlines, big Sri Lankan festivals or events.\n${COMMON}`,
  },
  "english-trends": {
    label: "English learning trends",
    prompt: (t) =>
      `Today is ${t}. What English-learning content is popular this week with Sinhala-speaking Sri Lankans on Facebook, TikTok, YouTube and X? Viral phrases, common mistakes people joke about, interview or job English, spoken-English pages that are growing (name them with links), and post formats that get shares.\n${COMMON}`,
  },
};

/** Runs the scout (one Grok call per topic) and stores a note per topic. */
export async function runScout(topics = Object.keys(SCOUT_TOPICS), log: (l: string) => void = () => {}): Promise<ScoutNote[]> {
  const today = todaySriLanka();
  const out: ScoutNote[] = [];
  for (const topic of topics) {
    const t = SCOUT_TOPICS[topic];
    if (!t) throw new Error(`Unknown scout topic "${topic}"`);
    log(`Grok: ${t.label}…`);
    try {
      const r = await grok(t.prompt(today), { label: `scout: ${topic}` });
      const note: ScoutNote = { id: randomUUID(), topic, at: new Date().toISOString(), text: r.text };
      db.prepare("INSERT INTO planner_scout_notes (id, topic, at, text) VALUES (@id, @topic, @at, @text)").run(note);
      out.push(note);
      log(`Grok: ${t.label} done (${Math.round(r.ms / 1000)} s)`);
    } catch (err) {
      log(`Grok: ${t.label} failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`);
    }
  }
  return out;
}

/** A scout run in the background (a topic can take a few minutes: Grok searches first). */
let running: { startedAt: string; log: string[] } | null = null;

export const scoutRunning = () => running;

export function startScout(topics?: string[]): void {
  if (running) throw new Error("The scout is already running");
  for (const t of topics ?? []) if (!SCOUT_TOPICS[t]) throw new Error(`Unknown scout topic "${t}"`);
  const run = { startedAt: new Date().toISOString(), log: [] as string[] };
  running = run;
  void runScout(topics, (l) => run.log.push(l)).finally(() => {
    running = null;
  });
}

/** The newest note per topic, newer than `maxAgeDays`. */
export function latestScoutNotes(maxAgeDays = 10): ScoutNote[] {
  const since = new Date(Date.now() - maxAgeDays * 864e5).toISOString();
  const rows = db.prepare("SELECT * FROM planner_scout_notes WHERE at >= ? ORDER BY at DESC").all(since) as ScoutNote[];
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.topic) ? false : (seen.add(r.topic), true)));
}
