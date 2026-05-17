import crypto from "crypto";
import { getQfOAuthConfig } from "./qfOAuthConfig";

/**
 * Public return type for buildAuthorizationUrl.
 * Does NOT include codeVerifier — that is kept server-side only.
 */
export interface AuthorizationUrlResult {
  url: string;
  state: string;
  nonce: string;
}

/**
 * Full PKCE session data persisted server-side (httpOnly cookie) before the
 * redirect. codeVerifier must never be sent to the client or logged.
 */
export interface PkceSessionData {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  userId: string;
}

/**
 * Backend-only session type returned by buildPkceAuthSession.
 * Extends AuthorizationUrlResult with the fields required for cookie storage.
 * Never send this to the client; use only within the connect route to populate
 * the httpOnly PKCE cookie.
 */
export interface PkceAuthSession extends AuthorizationUrlResult, PkceSessionData {}

export interface BuildAuthorizationUrlOptions {
  redirectUri: string;
  scopes?: string[];
}

function generateCodeVerifier(): string {
  return crypto
    .randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function deriveCodeChallenge(verifier: string): string {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * @internal Route-layer helper — do not use outside of auth route files.
 * Generates all PKCE/state/nonce values and returns the full session including
 * `codeVerifier`. The caller must store this in a server-side httpOnly cookie
 * before redirecting, and must never send `codeVerifier` to the client or log it.
 *
 * External callers (e.g. tests, utilities) should use `buildAuthorizationUrl`
 * which exposes only `{ url, state, nonce }`.
 */
export function buildPkceAuthSession(
  options: BuildAuthorizationUrlOptions,
): PkceAuthSession {
  const config = getQfOAuthConfig();
  const { redirectUri, scopes } = options;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(32).toString("hex");
  const nonce = crypto.randomBytes(32).toString("hex");

  const scopeStr = scopes
    ? scopes.join(" ")
    : "openid email profile offline_access";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: scopeStr,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const url = `${config.authBaseUrl}/oauth2/auth?${params.toString()}`;

  return { url, state, nonce, codeVerifier, redirectUri };
}

/**
 * Builds an Authorization Code + PKCE authorization URL.
 * Returns `{ url, state, nonce }` only — `codeVerifier` is not in the return
 * type and is not exposed to callers of this function.
 *
 * For the connect route (which must also persist codeVerifier server-side),
 * use `buildPkceAuthSession` instead.
 */
export function buildAuthorizationUrl(
  options: BuildAuthorizationUrlOptions,
): AuthorizationUrlResult {
  const { url, state, nonce } = buildPkceAuthSession(options);
  return { url, state, nonce };
}
