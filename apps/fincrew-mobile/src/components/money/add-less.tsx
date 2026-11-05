import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, Minus, Plus, X } from 'lucide-react-native';
import { formatINR, parseRupees } from '@fincrew/core';
import { SALARY_ENTRY_NAME_MAX, type SalaryEntry } from '@fincrew/data';
import { AmountField, Field, FormMessage } from '@/components/form';
import { Button, IconButton, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { radius, space, useTheme } from '@/lib/theme';

type Kind = SalaryEntry['kind'];
export type AddLessEntry = { id?: string; kind: Kind; name: string; amount: number };

/**
 * Add or less (design "Salary · add or less"): a drop-down button to add to this month's salary or
 * take something off, each with a name, as many as needed. `onAdd` and `onRemove` save at once and
 * give back an error to show, or null; entries can be removed until the salary is finalized.
 */
export function AddLess({
  entries,
  canEdit,
  onAdd,
  onRemove,
}: {
  entries: AddLessEntry[];
  canEdit: boolean;
  onAdd: (kind: Kind, name: string, amount: number) => Promise<string | null>;
  onRemove: (id: string) => Promise<string | null>;
}) {
  const { c } = useTheme();
  const a = 'salary.addLess';
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<Kind | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const closeForm = () => {
    setForm(null);
    setName('');
    setAmount('');
    setError(null);
  };

  const save = async () => {
    if (!form) return;
    if (!name.trim()) return setError(t(`${a}.needName`));
    if (name.trim().length > SALARY_ENTRY_NAME_MAX)
      return setError(t(`${a}.nameTooLong`, { max: SALARY_ENTRY_NAME_MAX }));
    const paise = parseRupees(amount);
    if (paise === null || paise <= 0) return setError(t(`${a}.needAmount`));
    setBusy(true);
    const failed = await onAdd(form, name, paise);
    setBusy(false);
    if (failed) setError(failed);
    else closeForm();
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(await onRemove(id));
    setBusy(false);
  };

  return (
    <View style={{ gap: space['space-2'] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space['space-2'],
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label-sm">{t(`${a}.title`)}</Text>
          {canEdit && (
            <Text variant="caption" muted>
              {t(`${a}.hint`)}
            </Text>
          )}
        </View>
        {canEdit && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: menu }}
            accessibilityLabel={t(`${a}.button`)}
            onPress={() => {
              setMenu(!menu);
              closeForm();
            }}
            style={({ pressed }) => ({
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: space['space-3'],
              borderRadius: radius['radius-md'],
              borderWidth: 1,
              borderColor: c['line-strong'],
              backgroundColor: pressed ? c['surface-pressed'] : c.surface,
            })}
          >
            <Plus size={18} color={c.ink} />
            <Text variant="label-sm">{t(`${a}.button`)}</Text>
            <ChevronDown size={18} color={c.ink} />
          </Pressable>
        )}
      </View>

      {menu && (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: radius['radius-md'],
            overflow: 'hidden',
          }}
        >
          {(['add', 'less'] as const).map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="menuitem"
              onPress={() => {
                setMenu(false);
                setForm(kind);
              }}
              style={({ pressed }) => ({
                minHeight: 56,
                justifyContent: 'center',
                paddingHorizontal: space['space-3'],
                backgroundColor: pressed ? c['surface-pressed'] : c.surface,
              })}
            >
              <Text variant="label-sm">{t(`${a}.${kind}`)}</Text>
              <Text variant="caption" muted>
                {t(`${a}.${kind}Hint`)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {form && (
        <View
          style={{
            gap: space['space-2'],
            padding: space['space-3'],
            borderRadius: radius['radius-md'],
            backgroundColor: c['surface-muted'],
          }}
        >
          <Text variant="label-sm">{t(`${a}.${form}`)}</Text>
          <Field
            label={t(`${a}.name`)}
            value={name}
            onChange={(v) => {
              setName(v);
              setError(null);
            }}
          />
          <AmountField
            label={t(`${a}.amount`)}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setError(null);
            }}
          />
          <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
            <View style={{ flex: 1 }}>
              <Button
                label={t(`${a}.cancel`)}
                variant="secondary"
                block
                disabled={busy}
                onPress={closeForm}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t(`${a}.save`)} busy={busy} block onPress={() => void save()} />
            </View>
          </View>
        </View>
      )}

      {error && <FormMessage ok={false} text={error} />}

      {entries.map((e, i) => {
        const add = e.kind === 'add';
        const tone = add ? c['status-present'] : c['status-absent'];
        return (
          <View
            key={e.id ?? i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space['space-2'],
              minHeight: 48,
              borderBottomWidth: 1,
              borderBottomColor: c.line,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: add ? c['status-present-soft'] : c['status-absent-soft'],
              }}
            >
              {add ? <Plus size={14} color={tone} /> : <Minus size={14} color={tone} />}
            </View>
            <Text style={{ flex: 1 }} numberOfLines={1}>
              {e.name}
            </Text>
            <Text variant="money-sm" color={tone}>
              {add ? '+' : '−'}
              {formatINR(e.amount)}
            </Text>
            {canEdit && e.id && (
              <IconButton
                label={t(`${a}.remove`, { name: e.name })}
                onPress={() => void remove(e.id!)}
                icon={<X size={18} color={c['ink-muted']} />}
              />
            )}
          </View>
        );
      })}
      {entries.length === 0 && !form && (
        <Text variant="caption" muted>
          {t(`${a}.none`)}
        </Text>
      )}
    </View>
  );
}
