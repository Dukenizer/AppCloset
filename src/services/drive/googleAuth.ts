import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = 'artcloset_google_drive_tokens_v1';
const ACCOUNT_KEY = 'artcloset_google_drive_account_v1';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  idToken?: string;
}

export function getGoogleClientId(): string {
  const extra = Constants.expoConfig?.extra as {
    googleAndroidClientId?: string;
    googleIosClientId?: string;
  } | undefined;
  if (Platform.OS === 'ios') {
    return (extra?.googleIosClientId || extra?.googleAndroidClientId || '').trim();
  }
  return (extra?.googleAndroidClientId || '').trim();
}

export function isGoogleDriveConfigured(): boolean {
  return getGoogleClientId().length > 0;
}

export async function loadGoogleTokens(): Promise<GoogleTokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GoogleTokens;
  } catch {
    return null;
  }
}

export async function saveGoogleTokens(tokens: GoogleTokens): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
}

export async function clearGoogleTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(ACCOUNT_KEY);
}

export async function loadGoogleAccountEmail(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(ACCOUNT_KEY)) || null;
  } catch {
    return null;
  }
}

export async function saveGoogleAccountEmail(email: string): Promise<void> {
  await SecureStore.setItemAsync(ACCOUNT_KEY, email);
}

export function createGoogleAuthRequest(): AuthSession.AuthRequest | null {
  const clientId = getGoogleClientId();
  if (!clientId) return null;
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'artcloset',
    path: 'oauth',
  });
  return new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: [DRIVE_SCOPE, 'openid', 'email', 'profile'],
    responseType: AuthSession.ResponseType.Token,
    usePKCE: false,
    extraParams: {
      include_granted_scopes: 'true',
    },
  });
}

export async function promptGoogleSignIn(
  request: AuthSession.AuthRequest,
): Promise<{ tokens: GoogleTokens; email: string | null } | null> {
  const clientId = getGoogleClientId();
  if (!clientId) return null;

  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  };

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') return null;

  const accessToken =
    result.authentication?.accessToken ||
    (result.params.access_token as string | undefined);
  if (!accessToken) return null;

  const expiresIn = result.authentication?.expiresIn ?? Number(result.params.expires_in || 0);
  const tokens: GoogleTokens = {
    accessToken,
  };
  const refreshToken = result.authentication?.refreshToken;
  if (refreshToken) tokens.refreshToken = refreshToken;
  if (expiresIn) tokens.expiresAt = Date.now() + expiresIn * 1000;
  const idToken = result.authentication?.idToken;
  if (idToken) tokens.idToken = idToken;

  let email: string | null = null;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const profile = (await res.json()) as { email?: string };
      email = profile.email ?? null;
    }
  } catch {
    // optional
  }

  await saveGoogleTokens(tokens);
  if (email) await saveGoogleAccountEmail(email);
  return { tokens, email };
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await loadGoogleTokens();
  if (!tokens?.accessToken) return null;
  if (tokens.expiresAt && tokens.expiresAt < Date.now() + 60_000) {
    // Implicit flow tokens can't refresh without refresh_token + client secret.
    // Force reconnect when expired.
    return null;
  }
  return tokens.accessToken;
}
