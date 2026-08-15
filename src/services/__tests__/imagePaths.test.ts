import { resolveStoredImageUri, toStoredImageRef } from '@/services/imageStorage';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/com.dukenizer.artcloset/files/',
}));

jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {
    exists = false;
  },
  Paths: { document: {} },
}));

describe('image path portability', () => {
  it('extracts relative artcloset refs from absolute URIs', () => {
    expect(
      toStoredImageRef(
        'file:///data/user/0/com.dukenizer.artcloset/files/artcloset/images/abc-123.jpg',
      ),
    ).toBe('artcloset/images/abc-123.jpg');
    expect(toStoredImageRef('artcloset/branding/studio-logo.jpg')).toBe(
      'artcloset/branding/studio-logo.jpg',
    );
  });

  it('resolves relative refs against current documentDirectory', () => {
    expect(resolveStoredImageUri('artcloset/images/abc-123.jpg')).toBe(
      'file:///data/user/0/com.dukenizer.artcloset/files/artcloset/images/abc-123.jpg',
    );
  });

  it('remaps stale absolute paths by filename', () => {
    expect(
      resolveStoredImageUri(
        'file:///data/user/0/com.dukenizer.artcloset/files/artcloset/images/old.jpg',
      ),
    ).toBe('file:///data/user/0/com.dukenizer.artcloset/files/artcloset/images/old.jpg');
    expect(
      resolveStoredImageUri(
        'file:///old/install/path/artcloset/images/uuid.jpg',
      ),
    ).toBe('file:///data/user/0/com.dukenizer.artcloset/files/artcloset/images/uuid.jpg');
  });

  it('resolves branding refs against current documentDirectory', () => {
    expect(resolveStoredImageUri('artcloset/branding/studio-logo.jpg')).toBe(
      'file:///data/user/0/com.dukenizer.artcloset/files/artcloset/branding/studio-logo.jpg',
    );
  });
});
