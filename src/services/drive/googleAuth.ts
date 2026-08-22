import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform, TurboModuleRegistry } from 'react-native';

import {
  activateBackupRestoreLogging,
  diagnosticErrorFields,
  logDiagnostic,
} from '@/services/debugLog';

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

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

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

/** Short non-secret fingerprint of an OAuth client id for diagnostics. */
function clientIdFingerprint(clientId: string): string | null {
  const id = clientId.trim();
  if (!id) return null;
  const match = id.match(/^(\d+)-([a-z0-9]{4})[a-z0-9]*\.apps\.googleusercontent\.com$/i);
  if (match) return `${match[1]}-${match[2]}…`;
  return id.length > 12 ? `${id.slice(0, 8)}…` : 'set';
}

function googleConnectContext(): Record<string, unknown> {
  const extra = extraGoogle();
  const androidId = (extra?.googleAndroidClientId || '').trim();
  const iosId = (extra?.googleIosClientId || '').trim();
  const packageName =
    Platform.OS === 'ios'
      ? (Constants.expoConfig?.ios?.bundleIdentifier ?? null)
      : (Constants.expoConfig?.android?.package ?? null);
  return {
    platform: Platform.OS,
    packageName,
    appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null,
    nativeBuild: Constants.nativeBuildVersion ?? null,
    nativeModule: isGoogleSignInNativeAvailable(),
    hasAndroidClientId: Boolean(androidId),
    hasIosClientId: Boolean(iosId),
    androidClientIdFp: clientIdFingerprint(androidId),
    iosClientIdFp: clientIdFingerprint(iosId),
    driveScope: DRIVE_SCOPE,
    signInConfigured,
  };
}

/** True when the native Google Sign-In module is linked (dev client / EAS build — not Expo Go). */
export function isGoogleSignInNativeAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return TurboModuleRegistry.get('RNGoogleSignin') != null;
  } catch {
    return false;
  }
}

let cachedModule: GoogleSigninModule | null | undefined;

function getGoogleSigninModule(): GoogleSigninModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (!isGoogleSignInNativeAvailable()) {
    cachedModule = null;
    return null;
  }
  try {
    // Lazy require so Expo Go can open Settings without crashing on import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
    return cachedModule;
  } catch {
    cachedModule = null;
    return null;
  }
}

export function getGoogleDriveUnavailableReason(): string | null {
  if (Platform.OS === 'web') {
    return 'Google Drive backup is available in the Android and iOS apps.';
  }
  if (!isGoogleSignInNativeAvailable()) {
    return 'Google Drive needs a development or preview build — not Expo Go. Use npx expo run:android or install an EAS build that includes Google Sign-In.';
  }
  if (!getGoogleClientId()) {
    return 'Google OAuth is not configured on this build. Add GOOGLE_ANDROID_CLIENT_ID (and rebuild) to enable Connect.';
  }
  return null;
}

export function isGoogleDriveConfigured(): boolean {
  return getGoogleDriveUnavailableReason() === null;
}

let signInConfigured = false;

function requireGoogleSignin(): GoogleSigninModule {
  const mod = getGoogleSigninModule();
  if (!mod) {
    throw new Error(
      getGoogleDriveUnavailableReason() ??
        'Google Sign-In is not available in this build.',
    );
  }
  return mod;
}

function ensureGoogleSignInConfigured(): void {
  if (signInConfigured) return;
  const { GoogleSignin } = requireGoogleSignin();
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
    if (getGoogleSigninModule()) {
      ensureGoogleSignInConfigured();
      await requireGoogleSignin().GoogleSignin.signOut();
    }
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
    return requireGoogleSignin().GoogleSignin.getCurrentUser()?.user?.email ?? null;
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
  await activateBackupRestoreLogging('connect');

  const unavailable = getGoogleDriveUnavailableReason();
  if (unavailable) {
    await logDiagnostic('google.connect', {
      ok: false,
      stage: 'precheck',
      unavailable,
      ...googleConnectContext(),
    });
    return null;
  }

  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = requireGoogleSignin();
  ensureGoogleSignInConfigured();

  let previousSignIn = false;
  try {
    previousSignIn = GoogleSignin.hasPreviousSignIn();
  } catch {
    previousSignIn = false;
  }

  await logDiagnostic('google.connect.start', {
    ...googleConnectContext(),
    previousSignIn,
    statusCodes: {
      PLAY_SERVICES_NOT_AVAILABLE: statusCodes.PLAY_SERVICES_NOT_AVAILABLE ?? null,
      SIGN_IN_CANCELLED: statusCodes.SIGN_IN_CANCELLED ?? null,
      IN_PROGRESS: statusCodes.IN_PROGRESS ?? null,
      SIGN_IN_REQUIRED: statusCodes.SIGN_IN_REQUIRED ?? null,
    },
  });

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await logDiagnostic('google.playServices', { ok: true });
  } catch (error) {
    await logDiagnostic('google.playServices', {
      ok: false,
      ...diagnosticErrorFields(error),
    });
    throw error;
  }

  try {
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      await logDiagnostic('google.connect', {
        ok: false,
        stage: 'signIn',
        reason: 'not_success',
        type: (response as { type?: string }).type ?? null,
        ...googleConnectContext(),
      });
      return null;
    }

    const nativeTokens = await GoogleSignin.getTokens();
    if (!nativeTokens.accessToken) {
      throw new Error('Google sign-in did not return an access token.');
    }

    const tokens = tokensFromNative(nativeTokens.accessToken, nativeTokens.idToken);
    const email = response.data.user.email ?? null;

    await saveGoogleTokens(tokens);
    if (email) await saveGoogleAccountEmail(email);
    await logDiagnostic('google.connect', {
      ok: true,
      stage: 'done',
      hasEmail: Boolean(email),
      hasIdToken: Boolean(nativeTokens.idToken),
      ...googleConnectContext(),
    });
    return { tokens, email };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      await logDiagnostic('google.connect', {
        ok: false,
        stage: 'signIn',
        cancelled: true,
        code: String(error.code),
      });
      return null;
    }
    const code = isErrorWithCode(error) ? String(error.code) : null;
    const message = error instanceof Error ? error.message : String(error);
    await logDiagnostic('google.connect', {
      ok: false,
      stage: 'signIn',
      ...diagnosticErrorFields(error),
      code,
      isDeveloperError: code === '10' || /DEVELOPER_ERROR/i.test(message),
      ...googleConnectContext(),
    });
    throw error;
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  if (!isGoogleDriveConfigured()) {
    await logDiagnostic('google.token', {
      ok: false,
      reason: getGoogleDriveUnavailableReason(),
    });
    return null;
  }

  const { GoogleSignin } = requireGoogleSignin();
  ensureGoogleSignInConfigured();
  if (!GoogleSignin.hasPreviousSignIn()) {
    const stored = await loadGoogleTokens();
    if (!stored?.accessToken) {
      await logDiagnostic('google.token', {
        ok: false,
        source: 'secureStore',
        previousSignIn: false,
      });
    }
    return stored?.accessToken ?? null;
  }

  try {
    const { accessToken, idToken } = await GoogleSignin.getTokens();
    if (!accessToken) {
      await logDiagnostic('google.token', { ok: false, source: 'native', previousSignIn: true });
      return null;
    }
    await saveGoogleTokens(tokensFromNative(accessToken, idToken));
    return accessToken;
  } catch (firstError) {
    try {
      const stored = await loadGoogleTokens();
      if (stored?.accessToken) {
        await GoogleSignin.clearCachedAccessToken(stored.accessToken);
      }
      const { accessToken, idToken } = await GoogleSignin.getTokens();
      if (!accessToken) {
        await logDiagnostic('google.token', {
          ok: false,
          source: 'native_retry',
          ...diagnosticErrorFields(firstError),
        });
        return null;
      }
      await saveGoogleTokens(tokensFromNative(accessToken, idToken));
      await logDiagnostic('google.token', { ok: true, source: 'native_retry', previousSignIn: true });
      return accessToken;
    } catch (retryError) {
      await logDiagnostic('google.token', {
        ok: false,
        source: 'native_retry',
        ...diagnosticErrorFields(retryError),
      });
      return null;
    }
  }
}
