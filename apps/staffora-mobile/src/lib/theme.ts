import { useColorScheme } from 'react-native';
import {
  radius,
  size,
  space,
  textStyles,
  themes,
  type ColorName,
  type TextStyleName,
} from '@fincrew/ui';

/** Staffora colours for the phone's light/dark setting (tokens from the design system). */
export function useTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = themes.staffora[scheme];
  return { scheme, c, color: (name: ColorName) => c[name] };
}

/** Anek Latin ships one family per weight on Android. */
const FAMILY: Record<number, string> = {
  400: 'AnekLatin_400Regular',
  500: 'AnekLatin_500Medium',
  600: 'AnekLatin_600SemiBold',
  700: 'AnekLatin_700Bold',
};

/** A design-system text style as a React Native style. */
export function textStyle(name: TextStyleName) {
  const s = textStyles[name];
  return {
    fontFamily: FAMILY[s.fontWeight] ?? FAMILY[400],
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    ...(s.tabularNums ? { fontVariant: ['tabular-nums' as const] } : {}),
  };
}

export { radius, size, space };
