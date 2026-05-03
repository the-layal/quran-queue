import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ILinkedProvider } from "./linkedProvider";

const QF_TOKEN_URL = "https://oauth.quran.foundation/oauth2/token";

async function refreshQFToken(userId: string, refreshToken: string): Promise<string | null> {
  const clientId = process.env.QF_CLIENT_ID;
  const clientSecret = process.env.QF_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(QF_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const expiry = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : null;

  await db
    .update(usersTable)
    .set({
      qfAccessToken: data.access_token,
      qfRefreshToken: data.refresh_token ?? refreshToken,
      qfTokenExpiry: expiry,
    })
    .where(eq(usersTable.id, userId));

  return data.access_token;
}

/**
 * Reads the stored QF tokens for a user, refreshes automatically if expired,
 * and returns a valid access token (or null if not connected / refresh failed).
 *
 * Downstream tasks (Bookmarks, Goals) call this — they never touch the raw token columns.
 */
async function getToken(userId: string): Promise<string | null> {
  const [user] = await db
    .select({
      qfAccessToken: usersTable.qfAccessToken,
      qfRefreshToken: usersTable.qfRefreshToken,
      qfTokenExpiry: usersTable.qfTokenExpiry,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user?.qfAccessToken) return null;

  const now = new Date();
  const expiry = user.qfTokenExpiry;

  if (expiry && expiry <= now) {
    if (!user.qfRefreshToken) return null;
    return refreshQFToken(userId, user.qfRefreshToken);
  }

  return user.qfAccessToken;
}

async function revokeToken(userId: string): Promise<void> {
  await db
    .update(usersTable)
    .set({
      qfAccessToken: null,
      qfRefreshToken: null,
      qfTokenExpiry: null,
      qfDisplayName: null,
      qfEmail: null,
    })
    .where(eq(usersTable.id, userId));
}

async function isConnected(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ qfAccessToken: usersTable.qfAccessToken })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return !!user?.qfAccessToken;
}

export const qfTokenService: ILinkedProvider = {
  getToken,
  revokeToken,
  isConnected,
};
