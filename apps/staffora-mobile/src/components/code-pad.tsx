import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Delete } from 'lucide-react-native';
import { t } from '@/lib/i18n';
import { radius, space, useTheme } from '@/lib/theme';
import { Text } from './ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'delete'] as const;

/**
 * Design system CodePad: digit boxes and a big number pad (no phone keyboard), for the PIN and
 * the attendance code. Calls `onComplete` when the last digit is typed; `resetKey` empties it.
 */
export function CodePad({
  length,
  title,
  hint,
  error,
  busy,
  secret,
  onComplete,
  onChange,
  resetKey,
}: {
  length: number;
  title?: string;
  hint?: string;
  error?: string | null;
  busy?: boolean;
  /** Show dots instead of digits (PINs). */
  secret?: boolean;
  onComplete: (value: string) => void;
  onChange?: (value: string) => void;
  resetKey?: unknown;
}) {
  const { c } = useTheme();
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue('');
  }, [resetKey]);

  const press = (k: (typeof KEYS)[number]) => {
    if (busy) return;
    let next = value;
    if (k === 'clear') next = '';
    else if (k === 'delete') next = value.slice(0, -1);
    else if (value.length < length) next = value + k;
    setValue(next);
    onChange?.(next);
    if (next.length === length && next !== value) onComplete(next);
  };

  return (
    <View style={{ gap: space['space-4'] }}>
      {title ? (
        <Text variant="title-md" style={{ textAlign: 'center' }}>
          {title}
        </Text>
      ) : null}
      <View
        accessible
        accessibilityLabel={t('staffora.pad.digits', { count: value.length, total: length })}
        accessibilityLiveRegion="polite"
        style={{ flexDirection: 'row', justifyContent: 'center', gap: space['space-2'] }}
      >
        {Array.from({ length }, (_, i) => {
          const d = value[i];
          const current = i === value.length;
          return (
            <View
              key={i}
              style={{
                width: length > 4 ? 46 : 56,
                height: 60,
                borderRadius: radius['radius-md'],
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.surface,
                borderWidth: current || error ? 2 : 1,
                borderColor: error ? c.danger : current ? c.accent : c['line-strong'],
              }}
            >
              <Text variant="code-digits">{d === undefined ? '' : secret ? '•' : d}</Text>
            </View>
          );
        })}
      </View>
      {error ? (
        <View accessibilityLiveRegion="assertive">
          <Text color={c.danger} style={{ textAlign: 'center' }}>
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" muted style={{ textAlign: 'center' }}>
          {hint}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['space-2'] }}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={
              k === 'clear'
                ? t('staffora.pad.clear')
                : k === 'delete'
                  ? t('staffora.pad.delete')
                  : k
            }
            disabled={busy}
            onPress={() => press(k)}
            style={({ pressed }) => ({
              width: '31.5%',
              flexGrow: 1,
              minHeight: 60,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius['radius-md'],
              backgroundColor: pressed
                ? c['surface-pressed']
                : k === 'clear' || k === 'delete'
                  ? 'transparent'
                  : c.surface,
            })}
          >
            {k === 'delete' ? (
              <Delete size={26} color={c.ink} />
            ) : (
              <Text variant={k === 'clear' ? 'label-sm' : 'money-lg'} muted={k === 'clear'}>
                {k === 'clear' ? t('staffora.pad.clear') : k}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
