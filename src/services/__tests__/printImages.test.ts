const mockFiles = new Set<string>();

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async (uri: string) =>
    mockFiles.has(uri) || uri.endsWith('/')
      ? { exists: mockFiles.has(uri) || uri === 'file:///cache/artcloset-print-images/', isDirectory: uri.endsWith('/'), size: 2_000_000, modificationTime: 42 }
      : { exists: false, isDirectory: false },
  ),
  readDirectoryAsync: jest.fn(async () => []),
  makeDirectoryAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  moveAsync: jest.fn(async ({ to }: { to: string }) => {
    mockFiles.add(to);
  }),
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(async () => ({ uri: 'file:///cache/ImageManipulator/out.jpg', width: 1600, height: 1200 })),
}));

import { manipulateAsync } from 'expo-image-manipulator';
import { Image } from 'react-native';

Image.getSize = jest.fn();

import {
  PRINT_IMAGE_MAX_EDGE,
  preparePrintImage,
  printCacheKey,
  printResizeAction,
} from '@/services/printImages';

const PHOTO = 'file:///docs/artcloset/images/a.jpg';
const setSize = (width: number, height: number) =>
  (Image.getSize as jest.Mock).mockImplementation((_uri: string, ok: (w: number, h: number) => void) => ok(width, height));

describe('printResizeAction', () => {
  it('limits the long edge for landscape and portrait photos', () => {
    expect(printResizeAction(2400, 1800)).toEqual({ resize: { width: PRINT_IMAGE_MAX_EDGE } });
    expect(printResizeAction(2400, 3200)).toEqual({ resize: { height: PRINT_IMAGE_MAX_EDGE } });
  });

  it('never enlarges a photo that is already small enough', () => {
    expect(printResizeAction(1200, 900)).toBeNull();
    expect(printResizeAction(1600, 1600)).toBeNull();
  });
});

describe('printCacheKey', () => {
  it('changes when the source file changes', () => {
    const base = printCacheKey(PHOTO, 100, 1);
    expect(printCacheKey(PHOTO, 100, 1)).toBe(base);
    expect(printCacheKey(PHOTO, 101, 1)).not.toBe(base);
    expect(printCacheKey(PHOTO, 100, 2)).not.toBe(base);
    expect(printCacheKey(`${PHOTO}x`, 100, 1)).not.toBe(base);
  });
});

describe('preparePrintImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
    mockFiles.add(PHOTO);
  });

  it('makes a print-sized JPEG once and reuses it on the next export', async () => {
    setSize(2400, 1800);

    const first = await preparePrintImage(PHOTO);
    const second = await preparePrintImage(PHOTO);

    expect(first).toMatch(/^file:\/\/\/cache\/artcloset-print-images\/[0-9a-f]{8}\.jpg$/);
    expect(second).toBe(first);
    expect(manipulateAsync).toHaveBeenCalledTimes(1);
    expect(manipulateAsync).toHaveBeenCalledWith(PHOTO, [{ resize: { width: 1600 } }], {
      compress: 0.82,
      format: 'jpeg',
    });
  });

  it('uses the original when it is already print-sized', async () => {
    setSize(1200, 900);
    expect(await preparePrintImage(PHOTO)).toBe(PHOTO);
    expect(manipulateAsync).not.toHaveBeenCalled();
  });

  it('falls back to the original when the photo cannot be measured or resized', async () => {
    (Image.getSize as jest.Mock).mockImplementation((_uri: string, _ok: unknown, fail: (e: Error) => void) =>
      fail(new Error('decode failed')),
    );
    expect(await preparePrintImage(PHOTO)).toBe(PHOTO);

    setSize(2400, 1800);
    (manipulateAsync as jest.Mock).mockRejectedValueOnce(new Error('out of memory'));
    expect(await preparePrintImage(PHOTO)).toBe(PHOTO);
  });
});
