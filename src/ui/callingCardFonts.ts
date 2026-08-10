import {
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
  CormorantGaramond_500Medium_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import {
  SourceSans3_400Regular,
  SourceSans3_600SemiBold,
} from '@expo-google-fonts/source-sans-3';
import { useFonts } from 'expo-font';

export const CALLING_CARD_FONTS = {
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
  CormorantGaramond_500Medium_Italic,
  SourceSans3_400Regular,
  SourceSans3_600SemiBold,
  GreatVibes_400Regular,
};

export function useCallingCardFonts(): boolean {
  const [loaded] = useFonts(CALLING_CARD_FONTS);
  return loaded;
}

export const callingCardType = {
  display: 'CormorantGaramond_700Bold',
  displayMedium: 'CormorantGaramond_600SemiBold',
  displayItalic: 'CormorantGaramond_500Medium_Italic',
  body: 'SourceSans3_400Regular',
  bodyStrong: 'SourceSans3_600SemiBold',
  script: 'GreatVibes_400Regular',
} as const;
