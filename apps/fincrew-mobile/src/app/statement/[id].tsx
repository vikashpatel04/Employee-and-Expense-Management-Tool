import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, FileDown, MessageCircle } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, formatINR, type Paise } from '@fincrew/core';
import {
  historyByMonth,
  historyRowText,
  loadStatement,
  STATEMENT_SUMMARY_KEYS,
  statementHeadline,
  statementMonthLine,
  statementMonthParts,
  type StatementKind,
  type StatementView,
} from '@fincrew/data';
import { FormMessage } from '@/components/form';
import { Button, Card, IconButton, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { monthLabel } from '@/lib/money';
import { useSession } from '@/lib/session';
import { sendStatementText, shareStatementPdf } from '@/lib/share-statement';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

const signed = (amount: Paise, plus = false) =>
  amount < 0 ? `−${formatINR(-amount)}` : `${plus ? '+' : ''}${formatINR(amount)}`;

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: space['space-3'],
        paddingVertical: 6,
      }}
    >
      <Text variant={strong ? 'label-sm' : 'body'} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant={strong ? 'money-md' : 'money-sm'}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space['space-2'] }}>
      <Text variant="label-sm" muted>
        {title}
      </Text>
      <Card style={{ padding: space['space-4'], gap: 2 }}>{children}</Card>
    </View>
  );
}

/**
 * What the shop owes one person (design "Staff · statement"): the Statement of what's open today,
 * or Historical, every line since they joined. Both end on the same total, and both go out as a
 * PDF or as text on WhatsApp. The person themself, or salary.view (`loadStatement`).
 */
export default function Statement() {
  const params = useLocalSearchParams<{ id: string; view?: string }>();
  const { me } = useSession();
  const { c } = useTheme();
  const [kind, setKind] = useState<StatementKind>(
    params.view === 'historical' ? 'historical' : 'statement',
  );
  const [data, setData] = useState<StatementView | null | undefined>(undefined);
  const [sharing, setSharing] = useState<'pdf' | 'text' | null>(null);
  const [failed, setFailed] = useState(false);
  const months = t('months.long', { returnObjects: true }) as unknown as string[];

  useEffect(() => {
    if (!me || !params.id) return;
    void loadStatement(supabase, me.shopId, params.id, businessDateOf(new Date())).then(setData);
  }, [me, params.id]);

  const share = async (how: 'pdf' | 'text') => {
    if (!data) return;
    setSharing(how);
    setFailed(false);
    const ok = await (how === 'pdf'
      ? shareStatementPdf(data, kind)
      : sendStatementText(data, kind));
    setSharing(null);
    setFailed(!ok);
  };

  const s = data?.statement;
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t('statement.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/staff'))}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t('statement.back')}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: space['space-4'],
          paddingTop: space['space-2'],
          gap: space['space-4'],
        }}
      >
        <Segmented
          label={t('statement.title')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'statement', label: t('statement.title') },
            { value: 'historical', label: t('statement.historical') },
          ]}
        />
        {data === undefined && (
          <View style={{ alignItems: 'center', gap: space['space-2'], padding: space['space-6'] }}>
            <ActivityIndicator color={c.accent} />
            <Text muted>{t('statement.loading')}</Text>
          </View>
        )}
        {data === null && <Text muted>{t('statement.unavailable')}</Text>}
        {data && s && (
          <>
            <View
              style={{
                gap: 4,
                padding: space['space-4'],
                borderRadius: radius['radius-lg'],
                backgroundColor: c['accent-soft'],
              }}
            >
              <Text variant="label-sm" color={c['accent-ink']}>
                {statementHeadline(data, kind, t)}
              </Text>
              <Text variant="money-hero">{formatINR(Math.abs(s.total))}</Text>
              <Text variant="caption" muted>
                {data.name} · {t('statement.asOnDate', { date: formatDisplayDate(data.today) })}
              </Text>
            </View>

            {kind === 'statement' ? (
              <>
                <Section title={t('statement.salaryLeft')}>
                  {s.months.map((m) => (
                    <View
                      key={`${m.year}-${m.month}`}
                      style={{
                        gap: 2,
                        paddingVertical: space['space-2'],
                        borderBottomWidth: 1,
                        borderBottomColor: c.line,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          gap: space['space-3'],
                        }}
                      >
                        <Text variant="label-sm" style={{ flex: 1 }}>
                          {monthLabel(m.year, m.month)}
                        </Text>
                        <Text variant="money-sm">{signed(m.left)}</Text>
                      </View>
                      <Text
                        variant="caption"
                        color={m.state === 'finalized' ? c['accent-ink'] : c['status-late']}
                      >
                        {t(`statement.state.${m.state}`)}
                      </Text>
                      <Text variant="caption" muted>
                        {statementMonthLine(m, t)}
                      </Text>
                      <Text variant="caption" muted>
                        {statementMonthParts(m, t)}
                      </Text>
                      {m.paid > 0 && (
                        <Text variant="caption" color={c['money-paid']}>
                          {t('statement.cols.paid')}: {formatINR(m.paid)}
                        </Text>
                      )}
                    </View>
                  ))}
                  <Line label={t('statement.salaryLeft')} value={signed(s.salaryLeft)} strong />
                </Section>

                {s.advances.length > 0 && (
                  <Section title={t('statement.advanceLeft')}>
                    {s.advances.map((a) => (
                      <Line
                        key={a.id}
                        label={`${formatDisplayDate(a.date)} · ${t('statement.advanceGiven')}`}
                        value={formatINR(a.left)}
                      />
                    ))}
                  </Section>
                )}
                {s.owed.length > 0 && (
                  <Section title={t('statement.expensesOwedShort')}>
                    {s.owed.map((e) => (
                      <Line
                        key={e.id}
                        label={[formatDisplayDate(e.date), e.note].filter(Boolean).join(' · ')}
                        value={formatINR(e.left)}
                      />
                    ))}
                  </Section>
                )}
                {s.charged.length > 0 && (
                  <Section title={t('statement.expensesChargedShort')}>
                    {s.charged.map((e) => (
                      <Line
                        key={e.id}
                        label={[formatDisplayDate(e.date), e.note].filter(Boolean).join(' · ')}
                        value={formatINR(e.left)}
                      />
                    ))}
                  </Section>
                )}

                <Section title={t('statement.addsUp')}>
                  <Line label={t('statement.salaryLeft')} value={signed(s.salaryLeft)} />
                  {s.advance > 0 && (
                    <Line label={t('statement.advanceLeft')} value={`−${formatINR(s.advance)}`} />
                  )}
                  {s.expenseOwed > 0 && (
                    <Line
                      label={t('statement.expensesOwedShort')}
                      value={`+${formatINR(s.expenseOwed)}`}
                    />
                  )}
                  {s.expenseCharged > 0 && (
                    <Line
                      label={t('statement.expensesChargedShort')}
                      value={`−${formatINR(s.expenseCharged)}`}
                    />
                  )}
                  {s.other !== 0 && (
                    <Line label={t('statement.other')} value={signed(s.other, true)} />
                  )}
                  <View
                    style={{ height: 1, backgroundColor: c['line-strong'], marginVertical: 4 }}
                  />
                  <Line
                    label={statementHeadline(data, 'statement', t)}
                    value={formatINR(Math.abs(s.total))}
                    strong
                  />
                </Section>
              </>
            ) : (
              <>
                <Section title={t('statement.everything')}>
                  {STATEMENT_SUMMARY_KEYS.filter((k) => data.history.summary[k] !== 0).map((k) => (
                    <Line
                      key={k}
                      label={t(`statement.summary.${k}`)}
                      value={signed(data.history.summary[k], k === 'additions' || k === 'expenses')}
                    />
                  ))}
                </Section>
                {historyByMonth(data.history.rows, months).map((group) => (
                  <Section key={group.key} title={group.title}>
                    {group.rows.map((row) => {
                      const { title, detail } = historyRowText(row, t, months, data.name);
                      return (
                        <View
                          key={row.id}
                          style={{
                            flexDirection: 'row',
                            gap: space['space-3'],
                            paddingVertical: space['space-2'],
                            borderBottomWidth: 1,
                            borderBottomColor: c.line,
                          }}
                        >
                          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Text variant="label-sm">{title}</Text>
                            <Text variant="caption" muted>
                              {[formatDisplayDate(row.date), detail].filter(Boolean).join(' · ')}
                            </Text>
                            {row.state !== 'final' && (
                              <Text variant="caption" color={c['status-late']}>
                                {t(`statement.state.${row.state}`)}
                              </Text>
                            )}
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 2 }}>
                            <Text variant="money-sm">{signed(row.amount, true)}</Text>
                            <Text variant="caption" muted>
                              {signed(row.balance)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </Section>
                ))}
              </>
            )}

            {failed && <FormMessage ok={false} text={t('statement.unavailable')} />}
            <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('statement.whatsapp')}
                  icon={MessageCircle}
                  variant="secondary"
                  block
                  busy={sharing === 'text'}
                  disabled={sharing !== null}
                  onPress={() => void share('text')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('statement.sharePdf')}
                  icon={FileDown}
                  block
                  busy={sharing === 'pdf'}
                  disabled={sharing !== null}
                  onPress={() => void share('pdf')}
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
