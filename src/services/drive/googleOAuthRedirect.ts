/** Google iOS URL scheme derived from a client ID (config plugin / Info.plist). */
export function googleOAuthRedirectUri(clientId: string): string {
  const trimmed = clientId.trim();
  if (!/\.apps\.googleusercontent\.com$/i.test(trimmed)) {
    return '';
  }
  const prefix = trimmed.replace(/\.apps\.googleusercontent\.com$/i, '');
  return `com.googleusercontent.apps.${prefix}:/oauth2redirect/google`;
}

/** URL scheme for Android intent filter / iOS URL type (no path). */
export function googleOAuthRedirectScheme(clientId: string): string {
  const trimmed = clientId.trim();
  if (!/\.apps\.googleusercontent\.com$/i.test(trimmed)) {
    return '';
  }
  const prefix = trimmed.replace(/\.apps\.googleusercontent\.com$/i, '');
  return `com.googleusercontent.apps.${prefix}`;
}
