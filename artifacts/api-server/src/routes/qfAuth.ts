import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { qfTokenService } from "../lib/qfTokenService";
import { getQfOAuthConfig } from "../lib/qfOAuthConfig";
import { buildPkceAuthSession, type PkceSessionData } from "../lib/qfPkce";
import { exchangeAuthorizationCode } from "../lib/qfTokenExchange";

const router: IRouter = Router();

function getQFUserinfoUrl(): string {
  return `${getQfOAuthConfig().apiBaseUrl}/api/v4/auth/userinfo`;
}

const QF_PKCE_COOKIE = "qf_pkce_state";
const QF_PKCE_COOKIE_TTL = 10 * 60 * 1000;

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

function setQFPkceCookie(res: Response, data: PkceSessionData) {
  res.cookie(QF_PKCE_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: QF_PKCE_COOKIE_TTL,
  });
}

function clearQFPkceCookie(res: Response) {
  res.clearCookie(QF_PKCE_COOKIE, { path: "/" });
}

function readQFPkceCookie(req: Request): PkceSessionData | null {
  const raw = req.cookies?.[QF_PKCE_COOKIE];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PkceSessionData>;
    if (
      typeof parsed.state === "string" &&
      typeof parsed.nonce === "string" &&
      typeof parsed.codeVerifier === "string" &&
      typeof parsed.redirectUri === "string"
    ) {
      return parsed as PkceSessionData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/auth/qf/connect
 * Generates PKCE parameters and a cryptographically random state + nonce,
 * stores them in a short-lived httpOnly cookie, then redirects to the QF OAuth
 * consent screen with code_challenge (S256).
 * Requires the user to be signed in with Replit Auth.
 */
router.get("/auth/qf/connect", (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  const redirectUri = process.env.QF_REDIRECT_URI || getQFRedirectUri(req);

  let session: ReturnType<typeof buildPkceAuthSession>;
  try {
    session = buildPkceAuthSession({ redirectUri });
  } catch {
    res.status(503).json({ error: "Quran Foundation integration is not configured on this server" });
    return;
  }

  // Persist the full PKCE session server-side before the redirect.
  // codeVerifier is never sent to the client — stored only in an httpOnly cookie.
  setQFPkceCookie(res, {
    state: session.state,
    nonce: session.nonce,
    codeVerifier: session.codeVerifier,
    redirectUri: session.redirectUri,
  });

  res.redirect(session.url);
});

/**
 * GET /api/auth/qf/callback
 * Verifies state and nonce against the PKCE cookie, exchanges the authorization
 * code for tokens (including code_verifier), stores them, and redirects back to
 * Settings with a success/error indicator.
 * Requires the user to be signed in with Replit Auth.
 */
router.get("/auth/qf/callback", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  const { code, state, nonce, error } = req.query as Record<string, string>;

  // Read and immediately clear the PKCE cookie to prevent replay attacks.
  const pkceSession = readQFPkceCookie(req);
  clearQFPkceCookie(res);

  if (!pkceSession) {
    res.redirect("/track/settings?qf=error");
    return;
  }

  const {
    state: expectedState,
    nonce: expectedNonce,
    codeVerifier,
    redirectUri: storedRedirectUri,
  } = pkceSession;

  const stateMatches =
    !!state &&
    state.length === expectedState.length &&
    crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState));

  if (!stateMatches) {
    res.redirect("/track/settings?qf=error");
    return;
  }

  // Validate nonce against the persisted value using timing-safe comparison.
  // Reads from the `nonce` query param that some OIDC providers echo in the
  // authorization code redirect. If QF does not include it, move this check
  // to ID-token claim validation in the follow-up task (#206).
  const nonceMatches =
    !!nonce &&
    nonce.length === expectedNonce.length &&
    crypto.timingSafeEqual(Buffer.from(nonce), Buffer.from(expectedNonce));

  if (!nonceMatches) {
    res.redirect("/track/settings?qf=error");
    return;
  }

  if (error || !code) {
    res.redirect("/track/settings?qf=error");
    return;
  }

  const redirectUri = process.env.QF_REDIRECT_URI || storedRedirectUri;

  let tokenData: Awaited<ReturnType<typeof exchangeAuthorizationCode>>;
  try {
    tokenData = await exchangeAuthorizationCode({ code, redirectUri, codeVerifier });
  } catch {
    res.redirect("/track/settings?qf=error");
    return;
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in;

  let qfDisplayName: string | null = null;
  let qfEmail: string | null = null;

  try {
    const userRes = await fetch(getQFUserinfoUrl(), {
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
      qfSyncError: null, // clear any stale sync error on reconnect
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

  // revokeToken already nulls all qf* columns including qfSyncError
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
      qfTokenExpiry: usersTable.qfTokenExpiry,
      qfSyncError: usersTable.qfSyncError,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));

  const isConnected = !!user?.qfAccessToken;

  res.json({
    isConnected,
    displayName: isConnected ? (user.qfDisplayName ?? null) : null,
    email: isConnected ? (user.qfEmail ?? null) : null,
    tokenExpiry: isConnected ? (user.qfTokenExpiry?.toISOString() ?? null) : null,
    syncError: isConnected ? (user.qfSyncError ?? null) : null,
  });
});

export default router;
