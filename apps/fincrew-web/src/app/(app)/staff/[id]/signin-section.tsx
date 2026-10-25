import { formatTimeOfDay, minutesOfDayIST, phoneKey } from '@fincrew/core';
import { loadStaffLogins } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { SignInCard, type SignInLabels } from './signin-card';

const time = (iso: string) => formatTimeOfDay(minutesOfDayIST(new Date(iso)));

/** The Staffora sign-in card on the staff Overview (staff.edit only). */
export async function SignInSection(props: {
  shopId: string;
  staffId: string;
  name: string;
  phone: string | null;
  active: boolean;
  selfAttendance: boolean;
}) {
  const login = (await loadStaffLogins(await createClient(), props.shopId)).get(props.staffId);
  const s = 'signin';
  const key = phoneKey(props.phone);
  const state: SignInLabels['state'] = login?.hasPin ? 'signedIn' : key ? 'waiting' : 'noPhone';
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
  } else if (state === 'waiting') {
    pill = t(`${s}.state.notSetUp`);
    tone = 'invited';
  } else {
    pill = t(`${s}.state.noPhone`);
    tone = 'none';
  }

  const labels: SignInLabels = {
    state,
    title: t(`${s}.title`),
    pill,
    pillTone: tone,
    body: t(`${s}.body.${state}`, { name }),
    phoneBound:
      state === 'signedIn' && !login?.phoneBound ? t(`${s}.body.phoneNotBound`) : undefined,
    userId: t(`${s}.userId`),
    phone: key ? `${key.slice(0, 5)} ${key.slice(5)}` : null,
    unlock: t(`${s}.unlock`),
    newPhone: t(`${s}.newPhone`),
    newPhoneHint: t(`${s}.newPhoneHint`, { name }),
    resetPin: t(`${s}.resetPin`),
    resetConfirm: t(`${s}.resetConfirm`, { name }),
    selfAttendance: t(`${s}.selfAttendance`),
  };
  return (
    <SignInCard
      staffId={props.staffId}
      labels={labels}
      active={props.active}
      selfAttendance={props.selfAttendance}
    />
  );
}
