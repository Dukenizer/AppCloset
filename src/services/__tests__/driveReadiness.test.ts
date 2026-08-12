import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BACKUP_FILENAME,
} from '@/services/backupArchive';
import { isGoogleDriveConfigured, getGoogleClientId } from '@/services/drive/googleAuth';

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
