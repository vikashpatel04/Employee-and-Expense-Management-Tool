import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { businessDateOf, formatDisplayDate, formatINR, formatTimeOfDay } from '@fincrew/core';
import { loadPay } from '@fincrew/data';
import { Card, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

type Pay = Awaited<ReturnType<typeof loadPay>>;

function Row({ label, detail, value }: { label: string; detail?: string; value: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space['space-3'],
        minHeight: 56,
        paddingHorizontal: space['space-4'],
        paddingVertical: space['space-2'],
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label-sm">{label}</Text>
        {detail ? (
          <Text variant="caption" muted>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text variant="money-sm" style={{ textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

/** Staff detail · Pay (design: Staff detail · Pay): read-only for now; changes on the website. */
export function PaySection({ staffId }: { staffId: string }) {
  const [pay, setPay] = useState<Pay | null>(null);
  useEffect(() => {
    void loadPay(supabase, staffId, businessDateOf(new Date())).then(setPay);
  }, [staffId]);
  if (!pay) return null;
  const p = 'staffDetail.pay';
  const cur = pay.current;

  return (
    <View style={{ gap: space['space-4'] }}>
      {!cur ? (
        <Text muted>{t(`${p}.none`)}</Text>
      ) : (
        <View style={{ gap: space['space-2'] }}>
          <Text variant="title-md">{t(`${p}.current`)}</Text>
          <Card>
            <Row
              label={t(`${p}.amount.${cur.payType}`)}
              detail={`${t(`${p}.types.${cur.payType}`)} · ${t(`${p}.since`, { date: formatDisplayDate(cur.since) })}`}
              value={formatINR(cur.amount)}
            />
            {cur.overtime != null && (
              <Row label={t(`${p}.overtime`)} value={formatINR(cur.overtime)} />
            )}
            <Row
              label={t(`${p}.shift`)}
              detail={cur.shiftStart != null ? t(`${p}.grace`, { minutes: cur.grace }) : undefined}
              value={
                cur.shiftStart != null && cur.shiftEnd != null
                  ? `${formatTimeOfDay(cur.shiftStart)} – ${formatTimeOfDay(cur.shiftEnd)}`
                  : t(`${p}.noShift`)
              }
            />
            <Row
              label={t(`${p}.template`)}
              detail={
                pay.template
                  ? t(`${p}.templateSince`, { date: formatDisplayDate(pay.template.since) })
                  : undefined
              }
              value={pay.template?.name ?? t(`${p}.noTemplate`)}
            />
            <Row
              label={t('staffDetail.rules.label')}
              value={
                cur.ownRules > 0
                  ? t('mobile.staff.ownRules', { count: cur.ownRules })
                  : t('mobile.staff.shopRules')
              }
            />
          </Card>
        </View>
      )}

      {(
        [
          [t(`${p}.allowances`), pay.allowances],
          [t(`${p}.deductions`), pay.deductions],
        ] as const
      ).map(
        ([title, items]) =>
          items.length > 0 && (
            <View key={title} style={{ gap: space['space-2'] }}>
              <Text variant="title-md">{title}</Text>
              <Card>
                {items.map((a) => (
                  <Row
                    key={a.id}
                    label={a.ended ? `${a.name} · ${t('mobile.staff.ended')}` : a.name}
                    detail={[
                      a.prorated ? t(`${p}.prorated`) : t(`${p}.fixed`),
                      t(`${p}.since`, { date: formatDisplayDate(a.from) }),
                      a.to ? t('mobile.staff.until', { date: formatDisplayDate(a.to) }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    value={formatINR(a.amount)}
                  />
                ))}
              </Card>
            </View>
          ),
      )}

      {pay.history.length > 0 && (
        <View style={{ gap: space['space-2'] }}>
          <Text variant="title-md">{t(`${p}.history`)}</Text>
          <Card>
            {pay.history.map((h) => (
              <Row
                key={h.id}
                label={t(`${p}.since`, { date: formatDisplayDate(h.since) })}
                detail={t(`${p}.types.${h.payType}`)}
                value={formatINR(h.amount)}
              />
            ))}
          </Card>
        </View>
      )}
      <Text variant="caption" muted>
        {t('mobile.staff.changeOnWebsite')}
      </Text>
    </View>
  );
}
