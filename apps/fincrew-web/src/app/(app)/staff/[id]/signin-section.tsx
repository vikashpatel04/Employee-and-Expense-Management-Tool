import { formatTimeOfDay, minutesOfDayIST } from '@fincrew/core';
import { dateOfInstant, loadStaffLogins } from '@fincrew/data';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { SignInCard, type SignInLabels } from './signin-card';

const time = (iso: string) => formatTimeOfDay(minutesOfDayIST(new Date(iso)));

/** The Staffora sign-in card on the staff Overview (staff.edit only). */
export async function SignInSection(props: {
  shopId: string;
  shopName: string;
  staffId: string;
  name: string;
  phone: string | null;
  active: boolean;
  selfAttendance: boolean;
}) {
  const login = (await loadStaffLogins(await createClient(), props.shopId)).get(props.staffId);
  const s = 'signin';
  const state: 'none' | 'invited' | 'signedIn' = login?.hasPin
    ? 'signedIn'
    : login?.inviteExpiresAt
      ? 'invited'
      : 'none';
  const name = props.name;

  let pill: string;
  let tone: SignInLabels['pillTone'];
  if (state === 'signedIn' && login?.locked) {
    pill = t(`${s}.state.locked`);
    tone = 'locked';
  } else if (state === 'signedIn' && login?.waitUntil) {
    pill = t(`${s}.state.waiting`, { time: time(login.waitUntil) });
    tone = 'locked';
  } else if (state === 'signedIn') {
    pill = t(`${s}.state.signedIn`);
    tone = 'ok';
  } else if (state === 'invited') {
    pill = t(`${s}.state.invited`, {
      date: formatDate(dateOfInstant(login!.inviteExpiresAt!)),
      time: time(login!.inviteExpiresAt!),
    });
    tone = 'invited';
  } else {
    pill = t(`${s}.state.none`);
    tone = 'none';
  }

  const labels: SignInLabels = {
    title: t(`${s}.title`),
    pill,
    pillTone: tone,
    body: t(`${s}.body.${state}`, { name }),
    noPhone: state === 'signedIn' && !login?.phoneBound ? t(`${s}.body.noPhone`) : undefined,
    invite: t(`${s}.invite`),
    newLink: t(`${s}.newLink`),
    cancelInvite: t(`${s}.cancelInvite`),
    copy: t(`${s}.copy`),
    copied: t(`${s}.copied`),
    whatsapp: t(`${s}.whatsapp`),
    whatsappText: t(`${s}.whatsappText`, { name, shop: props.shopName, url: '{url}' }),
    linkOnce: t(`${s}.linkOnce`),
    unlock: t(`${s}.unlock`),
    newPhone: t(`${s}.newPhone`),
    newPhoneHint: t(`${s}.newPhoneHint`, { name }),
    resetPin: t(`${s}.resetPin`),
    selfAttendance: t(`${s}.selfAttendance`),
  };
  return (
    <SignInCard
      staffId={props.staffId}
      labels={labels}
      state={state}
      active={props.active}
      selfAttendance={props.selfAttendance}
      phone={props.phone}
    />
  );
}
