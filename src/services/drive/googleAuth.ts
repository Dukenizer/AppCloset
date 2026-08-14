import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const TOKEN_KEY = 'artcloset_google_drive_tokens_v1';
const ACCOUNT_KEY = 'artcloset_google_drive_account_v1';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  idToken?: string;
}

type ExtraGoogle = {
  googleAndroidClientId?: string;
  googleIosClientId?: string;
};

function extraGoogle(): ExtraGoogle | undefined {
  return Constants.expoConfig?.extra as ExtraGoogle | undefined;
}

export function getGoogleClientId(): string {
  const extra = extraGoogle();
  if (Platform.OS === 'ios') {
    return (extra?.googleIosClientId || extra?.googleAndroidClientId || '').trim();
  }
  return (extra?.googleAndroidClientId || '').trim();
}

export function isGoogleDriveConfigured(): boolean {
  if (Platform.OS === 'web') return false;
  return getGoogleClientId().length > 0;
}

let signInConfigured = false;

function ensureGoogleSignInConfigured(): void {
  if (signInConfigured) return;
  const extra = extraGoogle();
  const iosClientId = extra?.googleIosClientId?.trim();
  GoogleSignin.configure({
    scopes: [DRIVE_SCOPE, 'openid', 'email', 'profile'],
    offlineAccess: false,
    ...(iosClientId ? { iosClientId } : {}),
  });
  signInConfigured = true;
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
  try {
    ensureGoogleSignInConfigured();
    await GoogleSignin.signOut();
  } catch {
    // Native session may already be cleared.
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(ACCOUNT_KEY);
}

export async function loadGoogleAccountEmail(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(ACCOUNT_KEY);
    if (stored) return stored;
  } catch {
    // fall through to native session
  }
  try {
    if (!isGoogleDriveConfigured()) return null;
    ensureGoogleSignInConfigured();
    return GoogleSignin.getCurrentUser()?.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function saveGoogleAccountEmail(email: string): Promise<void> {
  await SecureStore.setItemAsync(ACCOUNT_KEY, email);
}

function tokensFromNative(accessToken: string, idToken?: string): GoogleTokens {
  const tokens: GoogleTokens = {
    accessToken,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };
  if (idToken) tokens.idToken = idToken;
  return tokens;
}

export async function promptGoogleSignIn(): Promise<{
  tokens: GoogleTokens;
  email: string | null;
} | null> {
  if (!isGoogleDriveConfigured()) return null;

  ensureGoogleSignInConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  try {
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;

    const nativeTokens = await GoogleSignin.getTokens();
    if (!nativeTokens.accessToken) {
      throw new Error('Google sign-in did not return an access token.');
    }

    const tokens = tokensFromNative(nativeTokens.accessToken, nativeTokens.idToken);
    const email = response.data.user.email ?? null;

    await saveGoogleTokens(tokens);
    if (email) await saveGoogleAccountEmail(email);
    return { tokens, email };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      return null;
    }
    throw error;
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  if (!isGoogleDriveConfigured()) return null;

  ensureGoogleSignInConfigured();
  if (!GoogleSignin.hasPreviousSignIn()) {
    const stored = await loadGoogleTokens();
    return stored?.accessToken ?? null;
  }

  try {
    const { accessToken, idToken } = await GoogleSignin.getTokens();
    if (!accessToken) return null;
    await saveGoogleTokens(tokensFromNative(accessToken, idToken));
    return accessToken;
  } catch {
    try {
      const stored = await loadGoogleTokens();
      if (stored?.accessToken) {
        await GoogleSignin.clearCachedAccessToken(stored.accessToken);
      }
      const { accessToken, idToken } = await GoogleSignin.getTokens();
      if (!accessToken) return null;
      await saveGoogleTokens(tokensFromNative(accessToken, idToken));
      return accessToken;
    } catch {
      return null;
    }
  }
}
