import { db } from "../db";
import type { PublishPlatform } from "../publications";

/** A connected non-Facebook platform account (social_accounts table, see db.ts). Tokens never leave the server. */
export interface SocialAccount {
  platform: PublishPlatform;
  accountId: string;
  accountName: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  extra: Record<string, unknown>;
  connectedAt: string;
}

interface AccountRow {
  platform: string;
  account_id: string;
  account_name: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  extra_json: string;
  connected_at: string;
}

export function getAccount(platform: PublishPlatform): SocialAccount | null {
  const row = db.prepare("SELECT * FROM social_accounts WHERE platform = ?").get(platform) as AccountRow | undefined;
  if (!row) return null;
  return {
    platform,
    accountId: row.account_id,
    accountName: row.account_name,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    extra: JSON.parse(row.extra_json || "{}"),
    connectedAt: row.connected_at,
  };
}

/** One account per platform - saving replaces whatever was connected before. */
export function saveAccount(account: Omit<SocialAccount, "connectedAt"> & { connectedAt?: string }): void {
  db.prepare(
    `INSERT INTO social_accounts (platform, account_id, account_name, access_token, refresh_token, expires_at, extra_json, connected_at)
     VALUES (@platform, @accountId, @accountName, @accessToken, @refreshToken, @expiresAt, @extraJson, @connectedAt)
     ON CONFLICT(platform) DO UPDATE SET
       account_id = @accountId, account_name = @accountName, access_token = @accessToken,
       refresh_token = @refreshToken, expires_at = @expiresAt, extra_json = @extraJson, connected_at = @connectedAt`,
  ).run({
    platform: account.platform,
    accountId: account.accountId,
    accountName: account.accountName,
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    expiresAt: account.expiresAt,
    extraJson: JSON.stringify(account.extra ?? {}),
    connectedAt: account.connectedAt ?? new Date().toISOString(),
  });
}

export function deleteAccount(platform: PublishPlatform): void {
  db.prepare("DELETE FROM social_accounts WHERE platform = ?").run(platform);
}
