import { getQfOAuthConfig } from "./qfOAuthConfig";
import { qfTokenService, forceRefresh } from "./qfTokenService";
import { logger } from "./logger";

/**
 * Authenticated fetch wrapper for Quran Foundation User API calls.
 *
 * - Automatically attaches `x-auth-token` (access token) and `x-client-id`
 *   headers to every request targeting `{apiBaseUrl}{path}`.
 * - If the server responds with 401, triggers exactly one reactive token
 *   refresh via `forceRefresh` and retries the request once.
 * - If the retry is also 401, throws a descriptive error without exposing
 *   any token values.
 * - Returns the raw `Response` on success so callers can parse the body.
 *
 * Security: access tokens, refresh tokens, id tokens, and client secrets
 * are never included in any log output or thrown error message.
 *
 * @param userId  - The authenticated user's ID (used to look up stored tokens).
 * @param path    - Path relative to `apiBaseUrl`, e.g. `/auth/v1/bookmarks`.
 * @param init    - Optional `RequestInit` options (method, body, headers, …).
 *                  Caller-supplied headers are merged; `x-auth-token` and
 *                  `x-client-id` always take precedence.
 */
export async function qfFetch(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { apiBaseUrl, clientId } = getQfOAuthConfig();

  const accessToken = await qfTokenService.getToken(userId);
  if (!accessToken) {
    throw new Error("QF API request failed: no valid access token for user");
  }

  logger.debug({ "x-client-id": clientId }, "qfFetch: outgoing request");

  function buildHeaders(token: string): Record<string, string> {
    const callerHeaders = init?.headers
      ? (init.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : (init.headers as Record<string, string>))
      : {};
    return {
      ...callerHeaders,
      // x-auth-token value must never be logged
      "x-auth-token": token,
      "x-client-id": clientId,
    };
  }

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: buildHeaders(accessToken),
  });

  if (res.status !== 401) {
    return res;
  }

  // 401 received — attempt exactly one reactive refresh then retry once.
  // No further retries occur regardless of the outcome.
  const newToken = await forceRefresh(userId);
  if (!newToken) {
    throw new Error("QF API request failed: authentication error (401)");
  }

  const retryRes = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: buildHeaders(newToken),
  });

  if (retryRes.status === 401) {
    throw new Error(
      "QF API request failed: authentication error (401) after token refresh",
    );
  }

  return retryRes;
}
