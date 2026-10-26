import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  Check,
  Clock,
  Contrast,
  Moon,
  Sparkles,
  Umbrella,
  UmbrellaOff,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { statusTokens, type StatusKey, type TextStyleName } from '@fincrew/ui';
import { t } from '@/lib/i18n';
import { radius, size, space, textStyle, useTheme } from '@/lib/theme';

/** Design-system text: `variant` is a token text style, colour defaults to ink. */
export function Text({
  variant = 'body',
  muted,
  color,
  style,
  children,
  numberOfLines,
}: {
  variant?: TextStyleName;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const { c } = useTheme();
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[textStyle(variant), { color: color ?? (muted ? c['ink-muted'] : c.ink) }, style]}
    >
      {children}
    </RNText>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c, scheme } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius['radius-lg'],
          borderWidth: scheme === 'dark' ? 1 : 0,
          borderColor: c.line,
          shadowColor: '#11171a',
          shadowOpacity: scheme === 'dark' ? 0 : 0.06,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Primary / secondary / quiet button, 48–56 px tall (design system tap sizes). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon: Icon,
  disabled,
  busy,
  block,
  center,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  icon?: LucideIcon;
  disabled?: boolean;
  busy?: boolean;
  block?: boolean;
  /** Sit in the middle of a centred column (otherwise a short button sits at the start). */
  center?: boolean;
}) {
  const { c } = useTheme();
  const fg = variant === 'primary' ? c['on-accent'] : variant === 'quiet' ? c['accent-ink'] : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: variant === 'primary' ? size['tap-primary'] : size['tap-min'],
        paddingHorizontal: space['space-4'],
        borderRadius: radius['radius-md'],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space['space-2'],
        alignSelf: block ? 'stretch' : center ? 'center' : 'flex-start',
        opacity: disabled ? 0.45 : 1,
        backgroundColor:
          variant === 'primary'
            ? pressed
              ? c['accent-strong']
              : c.accent
            : variant === 'secondary'
              ? pressed
                ? c['surface-pressed']
                : c.surface
              : 'transparent',
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: c['line-strong'],
      })}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        Icon && <Icon size={20} color={fg} strokeWidth={2} />
      )}
      <Text variant={variant === 'primary' ? 'label' : 'label-sm'} color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Neutral initials avatar (avatars stay neutral; colour is for meaning). */
export function Avatar({ name, size: s = 40 }: { name: string; size?: number }) {
  const { c } = useTheme();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
  return (
    <View
      accessible={false}
      style={{
        width: s,
        height: s,
        borderRadius: s / 2,
        backgroundColor: c['surface-pressed'],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText
        style={[textStyle('label-sm'), { fontSize: Math.round(s * 0.38), color: c['ink-muted'] }]}
      >
        {initials}
      </RNText>
    </View>
  );
}

export const STATUS_ICONS: Record<string, LucideIcon> = {
  present: Check,
  half_day: Contrast,
  absent: X,
  paid_leave: Umbrella,
  unpaid_leave: UmbrellaOff,
  weekly_off: Moon,
  holiday: Sparkles,
  late: Clock,
};

/** Status colour + icon + word (unmarked: dashed outline, no fill). */
export function StatusPill({ status, label }: { status: StatusKey; label?: string }) {
  const { c } = useTheme();
  const tok = statusTokens(status);
  const Icon = STATUS_ICONS[status];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius['radius-pill'],
        backgroundColor: tok.bg ? c[tok.bg] : 'transparent',
        borderWidth: tok.bg ? 0 : 1.5,
        borderStyle: 'dashed',
        borderColor: c['line-strong'],
      }}
    >
      {Icon && <Icon size={14} color={c[tok.fg]} strokeWidth={2.6} />}
      <Text variant="caption" color={c[tok.fg]}>
        {label ?? t(`status.${status}`)}
      </Text>
    </View>
  );
}

/** Count chip for Today (design system SummaryChip); tap to filter. */
export function SummaryChip({
  status,
  count,
  selected,
  onPress,
}: {
  status: StatusKey;
  count: number;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const tok = statusTokens(status);
  const Icon = STATUS_ICONS[status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={`${count} ${t(`status.${status}`)}`}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 64,
        paddingHorizontal: space['space-2'],
        paddingVertical: space['space-2'],
        borderRadius: radius['radius-md'],
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        backgroundColor: tok.bg ? c[tok.bg] : c.surface,
        borderWidth: selected ? 2 : tok.bg ? 0 : 1.5,
        borderStyle: selected ? 'solid' : 'dashed',
        borderColor: selected ? c[tok.fg] : c['line-strong'],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {Icon && <Icon size={16} color={c[tok.fg]} strokeWidth={2.6} />}
        <Text variant="money-md" color={c[tok.fg]}>
          {count}
        </Text>
      </View>
      <Text variant="micro" color={c[tok.fg]} numberOfLines={1}>
        {t(`status.${status}`)}
      </Text>
    </Pressable>
  );
}

/** Section title with a count, like the design's ListSection. */
export function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <Text variant="label-sm" muted style={{ paddingHorizontal: space['space-1'] }}>
      {count === undefined ? title : `${title} · ${count}`}
    </Text>
  );
}

/** 48 px icon-only button with a spoken label (day / month switchers, back). */
export function IconButton({
  label,
  onPress,
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.38 : 1,
      }}
    >
      {icon}
    </Pressable>
  );
}

/** Design system SegmentedControl: one choice out of a few, as tabs or a filter. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        gap: 4,
        padding: 4,
        borderRadius: radius['radius-md'],
        backgroundColor: c['surface-muted'],
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius['radius-sm'],
              backgroundColor: on ? c.surface : 'transparent',
            }}
          >
            <Text variant="label-sm" muted={!on} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
