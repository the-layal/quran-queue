import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { qfTokenService } from "../lib/qfTokenService";
import { getQfOAuthConfig } from "../lib/qfOAuthConfig";

const router: IRouter = Router();

const { clientId, clientSecret, authBaseUrl, apiBaseUrl } = getQfOAuthConfig();

const QF_AUTH_URL = `${authBaseUrl}/oauth2/auth`;
const QF_TOKEN_URL = `${authBaseUrl}/oauth2/token`;
const QF_USERINFO_URL = `${apiBaseUrl}/api/v4/auth/userinfo`;

const QF_STATE_COOKIE = "qf_oauth_state";
const QF_STATE_COOKIE_TTL = 10 * 60 * 1000;

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function getQFRedirectUri(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}/api/auth/qf/callback`;
}

function setQFStateCookie(res: Response, state: string) {
  res.cookie(QF_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: QF_STATE_COOKIE_TTL,
  });
}

function clearQFStateCookie(res: Response) {
  res.clearCookie(QF_STATE_COOKIE, { path: "/" });
}

/**
 * GET /api/auth/qf/connect
 * Generates a cryptographically random state, stores it in a short-lived
 * httpOnly cookie, then redirects to the QF OAuth consent screen.
 * Requires the user to be signed in with Replit Auth.
 */
router.get("/auth/qf/connect", (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  const redirectUri = process.env.QF_REDIRECT_URI || getQFRedirectUri(req);

  const state = crypto.randomBytes(32).toString("hex");
  setQFStateCookie(res, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid email profile offline_access",
    state,
  });

  res.redirect(`${QF_AUTH_URL}?${params.toString()}`);
});

/**
 * GET /api/auth/qf/callback
 * Verifies the returned state against the cookie set during connect,
 * exchanges the authorization code for tokens, stores them, and redirects
 * back to Settings with a success/error indicator.
 * Requires the user to be signed in with Replit Auth.
 */
router.get("/auth/qf/callback", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  const { code, state, error } = req.query as Record<string, string>;

  const expectedState = req.cookies?.[QF_STATE_COOKIE];
  clearQFStateCookie(res);

  const stateMatches =
    !!expectedState &&
    !!state &&
    state.length === expectedState.length &&
    crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState));

  if (!stateMatches) {
    res.redirect("/track/settings?qf=error");
    return;
  }

  if (error || !code) {
    res.redirect("/track/settings?qf=error");
    return;
  }

  if (!clientSecret) {
    res.redirect("/track/settings?qf=error");
    return;
  }

  const redirectUri = process.env.QF_REDIRECT_URI || getQFRedirectUri(req);

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  let accessToken: string;
  let refreshToken: string | undefined;
  let expiresIn: number | undefined;

  try {
    const tokenRes = await fetch(QF_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      res.redirect("/track/settings?qf=error");
      return;
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    accessToken = tokenData.access_token;
    refreshToken = tokenData.refresh_token;
    expiresIn = tokenData.expires_in;
  } catch {
    res.redirect("/track/settings?qf=error");
    return;
  }

  let qfDisplayName: string | null = null;
  let qfEmail: string | null = null;

  try {
    const userRes = await fetch(QF_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userRes.ok) {
      const userInfo = (await userRes.json()) as {
        name?: string;
        email?: string;
        preferred_username?: string;
      };
      qfDisplayName = userInfo.name ?? userInfo.preferred_username ?? null;
      qfEmail = userInfo.email ?? null;
    }
  } catch {
    // Userinfo is best-effort — connection still succeeds without it
  }

  const expiry = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  await db
    .update(usersTable)
    .set({
      qfAccessToken: accessToken,
      qfRefreshToken: refreshToken ?? null,
      qfTokenExpiry: expiry,
      qfDisplayName,
      qfEmail,
    })
    .where(eq(usersTable.id, req.user!.id));

  res.redirect("/track/settings?qf=connected");
});

/**
 * POST /api/auth/qf/disconnect
 * Clears the stored QF tokens, stopping all sync without affecting other data.
 * Requires the user to be signed in with Replit Auth.
 */
router.post("/auth/qf/disconnect", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  await qfTokenService.revokeToken(req.user!.id);

  res.json({ success: true });
});

/**
 * GET /api/auth/qf/status
 * Returns the current QF connection status for the authenticated user.
 */
router.get("/auth/qf/status", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  const [user] = await db
    .select({
      qfAccessToken: usersTable.qfAccessToken,
      qfDisplayName: usersTable.qfDisplayName,
      qfEmail: usersTable.qfEmail,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));

  const isConnected = !!user?.qfAccessToken;

  res.json({
    isConnected,
    displayName: isConnected ? (user.qfDisplayName ?? null) : null,
    email: isConnected ? (user.qfEmail ?? null) : null,
  });
});

export default router;
