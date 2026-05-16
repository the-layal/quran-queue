/**
 * Provider-agnostic interface for linked OAuth providers.
 *
 * Any OAuth provider that stores tokens per-user satisfies this interface.
 * The current implementation is QF (Quran Foundation) via qfTokenService.
 *
 * Note: Clerk's OAuth connections API satisfies the same interface —
 * swapping to Clerk in the future is a drop-in replacement:
 *   getToken(userId) → clerk.users.getUserOauthAccessToken(userId, 'oauth_qf')
 *   revokeToken(userId) → clerk.users.deleteUserOauthAccessToken(userId, 'oauth_qf')
 */
export interface ILinkedProvider {
  getToken(userId: string): Promise<string | null>;
  revokeToken(userId: string): Promise<void>;
  isConnected(userId: string): Promise<boolean>;
}
