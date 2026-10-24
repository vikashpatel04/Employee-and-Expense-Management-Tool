import type { ReactNode } from 'react';
import { Pressable, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { addDays, formatDisplayDate, formatINR, weekday } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { radius, size, space, textStyle, useTheme } from '@/lib/theme';
import { Card, IconButton, Text } from './ui';

/** Labelled text box (design system input: 48 px, line-strong ring). */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  hint?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c['ink-subtle']}
        keyboardType={keyboardType}
        style={[
          textStyle('body'),
          {
            minHeight: size['tap-min'],
            paddingHorizontal: space['space-3'],
            borderRadius: radius['radius-sm'],
            borderWidth: 1,
            borderColor: c['line-strong'],
            backgroundColor: c.surface,
            color: c.ink,
          },
        ]}
      />
      {hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Amount in rupees (design system AmountInput): big figure, ₹ prefix, quick amounts. */
export function AmountField({
  label,
  value,
  onChange,
  quick = [],
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Quick amounts in paise. */
  quick?: number[];
  hint?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space['space-2'] }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['space-2'],
          minHeight: 64,
          paddingHorizontal: space['space-3'],
          borderRadius: radius['radius-md'],
          borderWidth: 1.5,
          borderColor: c['line-strong'],
          backgroundColor: c.surface,
        }}
      >
        <Text variant="money-lg" muted>
          ₹
        </Text>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={c['ink-subtle']}
          style={[textStyle('money-lg'), { flex: 1, color: c.ink, paddingVertical: 8 }]}
        />
      </View>
      {quick.length > 0 && (
        <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
          {quick.map((q) => (
            <Pressable
              key={q}
              accessibilityRole="button"
              onPress={() => onChange(String(q / 100))}
              style={{
                minHeight: 40,
                paddingHorizontal: space['space-3'],
                justifyContent: 'center',
                borderRadius: radius['radius-pill'],
                backgroundColor: c['surface-muted'],
              }}
            >
              <Text variant="label-sm">{formatINR(q, { decimals: false })}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Pick a day with ‹ › (between `min` and `max`), shown as "Fri 23/10/2026". */
export function DayStepper({
  value,
  onChange,
  max,
  min,
  label,
}: {
  value: string;
  onChange: (d: string) => void;
  max: string;
  min?: string;
  /** Spoken name of the field ("From", "To"). */
  label?: string;
}) {
  const { c } = useTheme();
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius['radius-sm'],
        backgroundColor: c['surface-muted'],
      }}
    >
      <IconButton
        label={label ? `${label}: ${t('mobile.today.prevDay')}` : t('mobile.today.prevDay')}
        disabled={!!min && value <= min}
        onPress={() => onChange(addDays(value, -1))}
        icon={<ChevronLeft size={22} color={c.ink} />}
      />
      <View style={{ flex: 1, alignItems: 'center' }} accessibilityLiveRegion="polite">
        <Text variant="label-sm">{`${days[weekday(value)]} ${formatDisplayDate(value)}`}</Text>
        {value === max && (
          <Text variant="caption" muted>
            {t('mobile.today.isToday')}
          </Text>
        )}
      </View>
      <IconButton
        label={label ? `${label}: ${t('mobile.today.nextDay')}` : t('mobile.today.nextDay')}
        disabled={value >= max}
        onPress={() => onChange(addDays(value, 1))}
        icon={<ChevronRight size={22} color={c.ink} />}
      />
    </View>
  );
}

/** Amber note with a warning icon (design: "days not marked", "past the limit"). */
export function Notice({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: space['space-3'],
        alignItems: 'flex-start',
        padding: space['space-3'],
        borderRadius: radius['radius-md'],
        backgroundColor: c['status-late-soft'],
      }}
    >
      <AlertTriangle size={20} color={c['status-late']} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label-sm">{title}</Text>
        {body ? (
          <Text variant="caption" muted>
            {body}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/** "Something went wrong / done" line under a form. */
export function FormMessage({ ok, text }: { ok: boolean; text: string }) {
  const { c } = useTheme();
  return (
    <View accessibilityLiveRegion="polite">
      <Text color={ok ? c['status-present'] : c.danger}>{text}</Text>
    </View>
  );
}

/** A fixed bar at the bottom of a screen for its main button(s). */
export function BottomBar({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        padding: space['space-4'],
        paddingTop: space['space-3'],
        gap: space['space-2'],
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      {children}
    </View>
  );
}
