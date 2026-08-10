import { FontAwesome5, FontAwesome6, MaterialIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export type CallingCardContactKind =
  | 'email'
  | 'facebook'
  | 'instagram'
  | 'threads'
  | 'phone'
  | 'website'
  | 'tiktok'
  | 'youtube';

/** Official brand marks in true brand colors — not gold-tinted. */
export function CallingCardBrandIcon({
  kind,
  size = 16,
}: {
  kind: CallingCardContactKind;
  size?: number;
}): React.JSX.Element {
  switch (kind) {
    case 'facebook':
      return (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: '#1877F2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FontAwesome5 name="facebook-f" size={Math.round(size * 0.55)} color="#FFFFFF" brand />
        </View>
      );
    case 'instagram':
      return <InstagramGlyph size={size} />;
    case 'threads':
      return <FontAwesome6 name="threads" size={size - 2} color="#000000" brand />;
    case 'tiktok':
      return <FontAwesome5 name="tiktok" size={size - 2} color="#000000" brand />;
    case 'youtube':
      return <FontAwesome5 name="youtube" size={size - 2} color="#FF0000" brand />;
    case 'website':
      return <MaterialIcons name="language" size={size} color="#2A2118" />;
    case 'email':
      return <MaterialIcons name="email" size={size} color="#2A2118" />;
    case 'phone':
      return <MaterialIcons name="phone" size={size} color="#2A2118" />;
    default:
      return <MaterialIcons name="link" size={size} color="#2A2118" />;
  }
}

function InstagramGlyph({ size }: { size: number }): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#F58529" />
          <Stop offset="45%" stopColor="#DD2A7B" />
          <Stop offset="100%" stopColor="#515BD4" />
        </LinearGradient>
      </Defs>
      <Rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#igGrad)" />
      <Circle cx="12" cy="12" r="4.2" fill="none" stroke="#FFFFFF" strokeWidth="1.7" />
      <Circle cx="17.2" cy="6.8" r="1.15" fill="#FFFFFF" />
    </Svg>
  );
}
