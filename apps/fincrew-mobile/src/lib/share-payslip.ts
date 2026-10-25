import { Linking, Share } from 'react-native';
import { phoneKey } from '@fincrew/core';
import { loadPayslipView, payslipShareText } from '@fincrew/data';
import { t } from './i18n';
import { monthLabel } from './money';
import { supabase } from './supabase';

/**
 * Send one payslip as text (`payslipShareText`, the same text Staffora shares): straight to the
 * person's WhatsApp when their phone number is saved, else through the phone's share sheet.
 * Loads the payslip fresh, so what was just paid is in it. False when it can't be read.
 */
export async function sharePayslip(payslipId: string, phone: string | null): Promise<boolean> {
  const slip = await loadPayslipView(supabase, payslipId);
  if (!slip) return false;
  const text = payslipShareText(slip, t, monthLabel(slip.year, slip.month));
  const key = phoneKey(phone);
  try {
    if (key) await Linking.openURL(`https://wa.me/91${key}?text=${encodeURIComponent(text)}`);
    else await Share.share({ message: text });
    return true;
  } catch {
    return false;
  }
}
