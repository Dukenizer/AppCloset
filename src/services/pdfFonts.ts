import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

/** CSS family name used by PDF templates; falls back to system serif when embedding fails. */
export const PDF_DISPLAY_FAMILY = '"ArtCloset Display", Georgia, "Times New Roman", serif';

type FontFace = { module: number; weight: number; style: 'normal' | 'italic' };

const DISPLAY_FACES: FontFace[] = [
  {
    module: require('@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf'),
    weight: 600,
    style: 'normal',
  },
  {
    module: require('@expo-google-fonts/cormorant-garamond/500Medium_Italic/CormorantGaramond_500Medium_Italic.ttf'),
    weight: 500,
    style: 'italic',
  },
];

let cached: Promise<string> | null = null;

const loadFace = async (face: FontFace): Promise<string> => {
  const asset = Asset.fromModule(face.module);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) throw new Error('Empty font file');
  return `@font-face {
      font-family: "ArtCloset Display";
      src: url(data:font/ttf;base64,${base64}) format("truetype");
      font-weight: ${face.weight};
      font-style: ${face.style};
    }`;
};

/** `@font-face` rules with the fonts inlined, or '' if they can't be read (PDF still renders). */
export function getPdfDisplayFontCss(): Promise<string> {
  if (!cached) {
    cached = Promise.all(DISPLAY_FACES.map(loadFace))
      .then((rules) => rules.join('\n'))
      .catch((error: unknown) => {
        if (__DEV__) console.warn('[pdfFonts] Falling back to system serif:', error);
        cached = null;
        return '';
      });
  }
  return cached;
}
