import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ILinkedProvider } from "./linkedProvider";
import { getQfOAuthConfig } from "./qfOAuthConfig";

/**
 * Per-user in-flight refresh deduplication.
 * If a refresh is already in flight for a userId, subsequent callers await the
 * same promise instead of firing independent requests to QF.
 * The entry is always removed in `finally` so a completed/failed refresh never
 * blocks future attempts.
 */
const inflightRefreshes = new Map<string, Promise<string | null>>();

/**
 * @throws {Error} "Failed to refresh access token" when the token endpoint
 *   returns a non-2xx response.
 * Token values are never logged.
 */
async function refreshQFToken(
  userId: string,
  refreshToken: string,
): Promise<string | null> {
  const existing = inflightRefreshes.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    const { clientId, clientSecret, authBaseUrl } = getQfOAuthConfig();

    if (!clientSecret) return null;

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(`${authBaseUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      throw new Error("Failed to refresh access token");
    }

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
  })();

  inflightRefreshes.set(userId, promise);

  try {
    return await promise;
  } finally {
    // Always clean up so a failed refresh doesn't block subsequent attempts.
    inflightRefreshes.delete(userId);
  }
}

/**
 * Reads the stored QF tokens for a user, refreshes automatically if expired,
 * and returns a valid access token (or null if not connected).
 *
 * Throws if the token endpoint returns a non-2xx response during refresh.
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
    // Throws "Failed to refresh access token" on non-2xx — let callers handle it.
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

/**
 * @internal Sibling-lib use only — do not re-export from any public barrel.
 *
 * Reads the stored refresh token for a user and triggers a reactive token
 * refresh, updating the database with the new credentials.
 * Returns the new access token, or null if no refresh token is stored or
 * clientSecret is absent.
 *
 * Throws "Failed to refresh access token" if the token endpoint returns non-2xx.
 * Concurrent calls for the same userId share a single in-flight request.
 * Token values are never logged.
 */
export async function forceRefresh(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ qfRefreshToken: usersTable.qfRefreshToken })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user?.qfRefreshToken) return null;
  // Throws "Failed to refresh access token" on non-2xx — propagate to caller.
  return refreshQFToken(userId, user.qfRefreshToken);
}
