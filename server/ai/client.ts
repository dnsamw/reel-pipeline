/**
 * Optional AI helper (NVIDIA's hosted API, OpenAI-compatible chat
 * completions - Kimi K3 by default). Everything that uses it must have a
 * non-AI path: the key may be missing, expired or rate-limited, so callers
 * treat any throw from here as "fall back to the built-in way".
 *
 * Read at call time, not import time: .env is loaded as a side effect of the
 * Prisma client import (see getPhrases.ts), and a key added later should work
 * after a server restart without code changes.
 */

const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "moonshotai/kimi-k3";

export interface AiStatus {
  available: boolean;
  model: string | null;
}

export function aiStatus(): AiStatus {
  const available = !!process.env.NVIDIA_API_KEY?.trim();
  return { available, model: available ? aiModel() : null };
}

function aiModel(): string {
  return process.env.NVIDIA_MODEL?.trim() || DEFAULT_MODEL;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  /** Off skips the model's thinking phase - fine for short writing tasks. Default on. */
  thinking?: boolean;
  /** How hard it thinks when thinking is on; higher is much slower. */
  reasoningEffort?: "low" | "medium" | "high" | "max";
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) throw new Error("No AI key configured (NVIDIA_API_KEY in .env)");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model: aiModel(),
      messages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.8,
      ...(options.thinking === false ? { chat_template_kwargs: { thinking: false } } : { reasoning_effort: options.reasoningEffort ?? "low" }),
      stream: false,
    }),
    // NVIDIA's free tier queues requests - even a tiny answer can take 20-60s.
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  }).catch((err: unknown) => {
    if (err instanceof Error && err.name === "TimeoutError") throw new Error("AI took too long to answer - try again later");
    throw err;
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new Error(`AI key was rejected (HTTP ${res.status}) - it may have expired`);
    if (res.status === 429) throw new Error("AI rate limit reached - try again in a minute");
    throw new Error(`AI request failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI returned an empty answer");
  return content;
}

/** Parses a JSON object out of a model answer, tolerating ```json fences or text around it. */
export function parseJsonObject<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI answer wasn't JSON");
  // Models sometimes add a stray closing brace - drop trailing ones until it parses.
  let json = candidate.slice(start, end + 1);
  for (;;) {
    try {
      return JSON.parse(json) as T;
    } catch {
      if (!json.endsWith("}}")) throw new Error("AI answer wasn't valid JSON");
      json = json.slice(0, -1);
    }
  }
}
