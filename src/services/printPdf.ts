import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

/**
 * Renders HTML to a PDF inside ArtCloset's own cache so Sharing can read it.
 * The PDF bytes come back as base64 and are written by us: reading expo-print's output file
 * fails in Expo Go (its Print cache sits outside the project's file scope) and Sharing can
 * reject the raw Print URI on Android.
 */
export async function printHtmlToCachePdf(
  html: string,
  page: { width: number; height: number },
  fileName: string,
): Promise<string> {
  const cache = FileSystem.cacheDirectory;
  if (!cache) {
    throw new Error('Could not write the PDF on this device.');
  }
  const { uri: printedUri, base64 } = await Print.printToFileAsync({
    html,
    width: page.width,
    height: page.height,
    base64: true,
  });
  const shareUri = `${cache}${fileName}`;
  if (base64) {
    await FileSystem.writeAsStringAsync(shareUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  } else {
    await FileSystem.copyAsync({ from: printedUri, to: shareUri });
  }
  return shareUri;
}
