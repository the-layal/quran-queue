import { getQfOAuthConfig } from "./qfOAuthConfig";

export interface TokenExchangeResult {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface ExchangeAuthorizationCodeOptions {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  isConfidential?: boolean;
}

/**
 * Exchanges an authorization code for tokens at the QF token endpoint.
 *
 * - Confidential clients (default when clientSecret is present): includes
 *   client_secret in the POST body. Throws if client_secret is absent.
 * - Public clients (isConfidential=false or no clientSecret): omits
 *   client_secret; sends only client_id and code_verifier.
 *
 * Security: client_secret, code, code_verifier, and returned token values
 * are never logged at any level.
 *
 * @throws {"Failed to exchange authorization code for tokens"} on any
 *   non-2xx response, network failure, or missing client_secret for
 *   confidential clients.
 */
export async function exchangeAuthorizationCode(
  options: ExchangeAuthorizationCodeOptions,
): Promise<TokenExchangeResult> {
  const { code, redirectUri, codeVerifier, isConfidential } = options;
  const { clientId, clientSecret, authBaseUrl } = getQfOAuthConfig();

  const useConfidential = isConfidential ?? clientSecret !== undefined;

  if (useConfidential && !clientSecret) {
    throw new Error("Failed to exchange authorization code for tokens");
  }

  const tokenUrl = `${authBaseUrl}/oauth2/token`;

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  if (useConfidential && clientSecret) {
    params.set("client_secret", clientSecret);
  }

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      throw new Error("Failed to exchange authorization code for tokens");
    }

    return (await res.json()) as TokenExchangeResult;
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === "Failed to exchange authorization code for tokens"
    ) {
      throw err;
    }
    throw new Error("Failed to exchange authorization code for tokens");
  }
}
