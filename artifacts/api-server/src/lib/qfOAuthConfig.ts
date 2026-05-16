/**
 * Central configuration module for Quran Foundation OAuth2.
 *
 * NOTE: This is a confidential client — a backend client_secret is required.
 * Do not use this config on the frontend or in any public-client context
 * unless QF explicitly confirms public-client status for a given client_id.
 */

export type QfEnv = "prelive" | "production";

const ENV_URLS: Record<QfEnv, { authBaseUrl: string; apiBaseUrl: string }> = {
  prelive: {
    authBaseUrl: "https://prelive-oauth2.quran.foundation",
    apiBaseUrl: "https://apis-prelive.quran.foundation",
  },
  production: {
    authBaseUrl: "https://oauth2.quran.foundation",
    apiBaseUrl: "https://apis.quran.foundation",
  },
};

export interface QfOAuthConfig {
  env: QfEnv;
  clientId: string;
  clientSecret: string | undefined;
  authBaseUrl: string;
  apiBaseUrl: string;
}

/**
 * Returns the active QF OAuth2 configuration derived from environment variables.
 *
 * Required env vars:
 *   QF_CLIENT_ID     — OAuth2 client identifier (throws if missing)
 *
 * Optional env vars:
 *   QF_CLIENT_SECRET — OAuth2 client secret (undefined if not set)
 *   QF_ENV           — "production" | "prelive" (defaults to "prelive")
 *
 * QF_CLIENT_SECRET is intentionally never included in log output or error messages.
 */
export function getQfOAuthConfig(): QfOAuthConfig {
  const clientId = process.env.QF_CLIENT_ID;

  if (!clientId) {
    throw new Error(
      "Missing Quran Foundation API credentials. Request access: https://api-docs.quran.foundation/request-access",
    );
  }

  const rawEnv = process.env.QF_ENV;
  const env: QfEnv = rawEnv === "production" ? "production" : "prelive";

  const { authBaseUrl, apiBaseUrl } = ENV_URLS[env];

  return {
    env,
    clientId,
    clientSecret: process.env.QF_CLIENT_SECRET,
    authBaseUrl,
    apiBaseUrl,
  };
}
