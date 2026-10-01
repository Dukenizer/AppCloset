import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

/**
 * Renders HTML to a PDF inside ArtCloset's own cache so Sharing can read it.
 * The printed file is copied natively so a large PDF never passes through JS memory. Expo Go
 * cannot read expo-print's output (its Print cache sits outside the project's file scope), so
 * only when that copy fails is the PDF printed again as base64 and written by us.
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
  const shareUri = `${cache}${fileName}`;
  const { uri: printedUri } = await Print.printToFileAsync({
    html,
    width: page.width,
    height: page.height,
  });
  try {
    await FileSystem.copyAsync({ from: printedUri, to: shareUri });
    await FileSystem.deleteAsync(printedUri, { idempotent: true }).catch(() => undefined);
    return shareUri;
  } catch {
    // Expo Go: fall through to the in-memory path.
  }
  const { base64 } = await Print.printToFileAsync({
    html,
    width: page.width,
    height: page.height,
    base64: true,
  });
  if (!base64) {
    throw new Error('Could not write the PDF on this device.');
  }
  await FileSystem.writeAsStringAsync(shareUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return shareUri;
}
