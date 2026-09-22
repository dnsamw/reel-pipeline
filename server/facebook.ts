import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "./db";

const GRAPH = "https://graph.facebook.com/v21.0";
const GRAPH_VIDEO = "https://graph-video.facebook.com/v21.0";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set - add it to .env (see .env.example) and restart the server`);
  return value;
}

// OAuth CSRF state, and the page list from a just-completed round-trip
// awaiting the admin's pick (when the Facebook account manages more than
// one Page) - both ephemeral and in-memory. This is a single-local-admin
// tool with a short-lived interactive flow, so there's no multi-user or
// server-restart durability concern that would justify persisting these.
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;
let pendingPages: ManagedPage[] | null = null;

export function createOAuthState(): string {
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

export function consumeOAuthState(state: string): boolean {
  const expiry = pendingStates.get(state);
  pendingStates.delete(state);
  return expiry != null && expiry > Date.now();
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("FACEBOOK_APP_ID"),
    redirect_uri: requireEnv("FACEBOOK_REDIRECT_URI"),
    state,
    response_type: "code",
  });

  // Meta now rejects Page permissions (pages_show_list/pages_read_engagement/
  // pages_manage_posts) passed as a plain `scope` list on newer apps - they
  // have to come from a "Facebook Login for Business" Configuration instead
  // (App Dashboard -> Facebook Login for Business -> Configurations -> New,
  // asset type "Pages", with those three permissions checked), referenced
  // here by its config_id. See .env.example / docs/ARCHITECTURE.md. Falls
  // back to the classic scope param so older/simpler apps still work.
  const configId = process.env.FACEBOOK_CONFIG_ID;
  if (configId) {
    params.set("config_id", configId);
  } else {
    params.set("scope", "pages_show_list,pages_read_engagement,pages_manage_posts");
  }

  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

async function graphGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Facebook API error (${res.status})`);
  return body as T;
}

/** Exchanges an OAuth `code` for a long-lived (~60 day) user token - Page tokens minted from that (see fetchManagedPages) don't themselves expire on that timer. */
export async function exchangeCodeForLongLivedUserToken(code: string): Promise<string> {
  const clientId = requireEnv("FACEBOOK_APP_ID");
  const clientSecret = requireEnv("FACEBOOK_APP_SECRET");
  const redirectUri = requireEnv("FACEBOOK_REDIRECT_URI");

  const shortLived = await graphGet<{ access_token: string }>(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }).toString()}`,
  );
  const longLived = await graphGet<{ access_token: string }>(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: shortLived.access_token,
    }).toString()}`,
  );
  return longLived.access_token;
}

export interface ManagedPage {
  id: string;
  name: string;
  accessToken: string;
}

export async function fetchManagedPages(userToken: string): Promise<ManagedPage[]> {
  const result = await graphGet<{ data: { id: string; name: string; access_token: string }[] }>(
    `${GRAPH}/me/accounts?${new URLSearchParams({ access_token: userToken, fields: "id,name,access_token" }).toString()}`,
  );
  return result.data.map((p) => ({ id: p.id, name: p.name, accessToken: p.access_token }));
}

export function setPendingPages(pages: ManagedPage[]): void {
  pendingPages = pages;
}

export function getPendingPages(): { id: string; name: string }[] | null {
  return pendingPages?.map((p) => ({ id: p.id, name: p.name })) ?? null;
}

export function selectPendingPage(pageId: string): { id: string; name: string } {
  const page = pendingPages?.find((p) => p.id === pageId);
  if (!page) throw new Error("Unknown page id - reconnect and try again");
  saveConnectedPage(page);
  pendingPages = null;
  return { id: page.id, name: page.name };
}

interface PageRow {
  id: string;
  name: string;
  access_token: string;
  connected_at: string;
}

/** Single-page scope: connecting a new Page replaces whichever one was connected before. */
export function saveConnectedPage(page: ManagedPage): void {
  db.prepare("DELETE FROM facebook_page").run();
  db.prepare("INSERT INTO facebook_page (id, name, access_token, connected_at) VALUES (?, ?, ?, ?)").run(
    page.id,
    page.name,
    page.accessToken,
    new Date().toISOString(),
  );
}

/** Status for the Settings page - deliberately never includes access_token, see server/db.ts's note on this table. */
export function getConnectedPage(): { id: string; name: string; connectedAt: string } | null {
  const row = db.prepare("SELECT id, name, connected_at as connectedAt FROM facebook_page LIMIT 1").get() as
    | { id: string; name: string; connectedAt: string }
    | undefined;
  return row ?? null;
}

function getConnectedPageWithToken(): PageRow | null {
  return (db.prepare("SELECT * FROM facebook_page LIMIT 1").get() as PageRow | undefined) ?? null;
}

export function disconnectPage(): void {
  db.prepare("DELETE FROM facebook_page").run();
}

export async function publishVideoToConnectedPage(
  filePath: string,
  caption: string,
): Promise<{ pageId: string; pageName: string; videoId: string; permalink: string }> {
  const page = getConnectedPageWithToken();
  if (!page) throw new Error("No Facebook Page connected - connect one in Settings first");

  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  form.set("access_token", page.access_token);
  form.set("description", caption);
  form.set("source", new Blob([fileBuffer], { type: "video/mp4" }), "reel.mp4");

  const res = await fetch(`${GRAPH_VIDEO}/${page.id}/videos`, { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok || !body.id) throw new Error(body?.error?.message ?? `Facebook upload failed (${res.status})`);

  return {
    pageId: page.id,
    pageName: page.name,
    videoId: body.id as string,
    permalink: `https://www.facebook.com/${page.id}/videos/${body.id}/`,
  };
}
