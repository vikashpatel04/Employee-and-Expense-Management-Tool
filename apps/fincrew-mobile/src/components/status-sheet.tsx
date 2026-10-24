import { Pressable } from 'react-native';
import { Check, Eraser } from 'lucide-react-native';
import { SETTABLE_STATUSES, type AttendanceWriteResult, type SettableStatus } from '@fincrew/data';
import { statusTokens } from '@fincrew/ui';
import { t } from '@/lib/i18n';
import { radius, space, useTheme } from '@/lib/theme';
import { Sheet } from './sheet';
import { Button, STATUS_ICONS, Text } from './ui';

/** Shared write result → the app's wording (same strings as the website). */
export function attendanceError(r: Exclude<AttendanceWriteResult, { ok: true }>) {
  switch (r.reason) {
    case 'no_permission':
      return t('attendance.readOnly');
    case 'future':
      return t('attendance.errors.future');
    case 'past':
      return t('attendance.errors.past');
    case 'leave':
      return t('attendance.errors.leave', { name: r.name, left: r.left });
    case 'failed':
      return t('attendance.errors.failed', { reason: r.message });
    default:
      return t('attendance.errors.failed', { reason: 'invalid request' });
  }
}

/**
 * Pick a day's status for one person (design system StatusPicker in a bottom sheet): the five
 * settable statuses, "Not marked" to clear a mark, Cancel.
 */
export function StatusSheet({
  open,
  onClose,
  name,
  dateLabel,
  current,
  marked,
  busy,
  error,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  dateLabel: string;
  current: string | null;
  marked: boolean;
  busy: boolean;
  error: string | null;
  onPick: (status: SettableStatus | 'clear') => void;
}) {
  const { c } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} title={name} subtitle={dateLabel}>
      {SETTABLE_STATUSES.map((s) => {
        const tok = statusTokens(s);
        const Icon = STATUS_ICONS[s]!;
        const on = current === s;
        return (
          <Pressable
            key={s}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: busy }}
            disabled={busy}
            onPress={() => onPick(s)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space['space-3'],
              minHeight: 56,
              paddingHorizontal: space['space-4'],
              borderRadius: radius['radius-md'],
              backgroundColor: c[tok.bg!],
              borderWidth: on ? 2 : 0,
              borderColor: c[tok.fg],
            }}
          >
            <Icon size={22} color={c[tok.fg]} strokeWidth={2.6} />
            <Text variant="label" color={c[tok.fg]} style={{ flex: 1 }}>
              {t(`status.${s}`)}
            </Text>
            {on && <Check size={20} color={c[tok.fg]} />}
          </Pressable>
        );
      })}
      {marked && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onPick('clear')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['space-3'],
            minHeight: 56,
            paddingHorizontal: space['space-4'],
            borderRadius: radius['radius-md'],
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: c['line-strong'],
          }}
        >
          <Eraser size={20} color={c['status-unmarked']} />
          <Text variant="label-sm" color={c['status-unmarked']}>
            {t('mobile.today.sheet.clear')}
          </Text>
        </Pressable>
      )}
      {error && <Text color={c.danger}>{error}</Text>}
      <Button label={t('mobile.today.sheet.cancel')} variant="secondary" block onPress={onClose} />
    </Sheet>
  );
}
