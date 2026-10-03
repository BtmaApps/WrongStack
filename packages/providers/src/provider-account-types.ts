/** Rotated-token payload handed to the OAuth persister after a refresh. */
export interface OAuthRefreshedTokens {
  accessToken: string;
  /** Refresh token — not present for all OAuth families (e.g. GitHub Copilot). Callers who need it already hold it. */
  refreshToken?: string | undefined;
  expiresAt: number;
  /** ChatGPT account id (codex only); undefined for other OAuth families. */
  accountId?: string | undefined;
  scope?: string | undefined;
  idToken?: string | undefined;
  oauthClientId?: string | undefined;
  oauthSubject?: string | undefined;
}

/** One picker-visible model as a provider's live catalog describes it. */
export interface ProviderLiveModel {
  id: string;
  name: string;
  description?: string | undefined;
  maxContext?: number | undefined;
}
