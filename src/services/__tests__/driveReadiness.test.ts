import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BACKUP_FILENAME,
  toReadableFileUri,
  getSqliteDatabaseUri,
} from '@/services/backupArchive';
import {
  getGoogleClientId,
  getGoogleDriveUnavailableReason,
  isGoogleDriveConfigured,
  isGoogleSignInNativeAvailable,
} from '@/services/drive/googleAuth';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    hasPreviousSignIn: jest.fn(() => false),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getTokens: jest.fn(),
    getCurrentUser: jest.fn(() => null),
    clearCachedAccessToken: jest.fn(),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
  isErrorWithCode: () => false,
  isSuccessResponse: (response: { type?: string }) => response?.type === 'success',
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      googleAndroidClientId: '',
      googleIosClientId: '',
      vipSalt: '',
    },
  },
}));

describe('Drive / backup readiness', () => {
  it('exports stable backup format constants', () => {
    expect(BACKUP_FORMAT).toBe('artcloset.backup');
    expect(BACKUP_VERSION).toBe(1);
    expect(BACKUP_FILENAME).toBe('artcloset-backup.zip');
  });

  it('reports Drive unconfigured when client id empty', () => {
    expect(getGoogleClientId()).toBe('');
    expect(isGoogleDriveConfigured()).toBe(false);
    const reason = getGoogleDriveUnavailableReason() ?? '';
    if (isGoogleSignInNativeAvailable()) {
      expect(reason).toMatch(/GOOGLE_ANDROID_CLIENT_ID|OAuth/i);
    } else {
      expect(reason).toMatch(/development or preview build|Expo Go/i);
    }
  });

  it('turns native sqlite paths into file:// URIs', () => {
    expect(toReadableFileUri('/data/user/0/com.dukenizer.artcloset/files/SQLite/artcloset.db')).toBe(
      'file:///data/user/0/com.dukenizer.artcloset/files/SQLite/artcloset.db',
    );
    expect(toReadableFileUri('file:///tmp/artcloset.db')).toBe('file:///tmp/artcloset.db');
  });

  it('prefers the open database path for backup/restore', () => {
    expect(
      getSqliteDatabaseUri({
        databasePath: '/data/user/0/com.dukenizer.artcloset/files/SQLite/artcloset.db',
      } as never),
    ).toBe('file:///data/user/0/com.dukenizer.artcloset/files/SQLite/artcloset.db');
  });
});
