import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BACKUP_FILENAME,
} from '@/services/backupArchive';
import { isGoogleDriveConfigured, getGoogleClientId } from '@/services/drive/googleAuth';

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
  });
});
