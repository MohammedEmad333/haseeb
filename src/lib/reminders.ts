/**
 * Payment-reminder deep links.
 *
 * These hand the message to WhatsApp or the SMS composer on the device; the
 * app itself sends nothing, which is what keeps reminders working with the
 * network off and keeps customer numbers off any third-party server.
 */

/**
 * Normalise a local Egyptian number to E.164 without the leading `+`, which
 * is the form wa.me expects. Numbers already in international form pass
 * through.
 */
export function toMsisdn(phone: string, countryCode = '20'): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith(countryCode) && digits.length > 10) return digits;
  if (digits.startsWith('0')) return countryCode + digits.slice(1);
  return digits;
}

export function whatsappHref(phone: string, message: string): string {
  return `https://wa.me/${toMsisdn(phone)}?text=${encodeURIComponent(message)}`;
}

export function smsHref(phone: string, message: string): string {
  // `?body=` is the iOS/Android convention; both accept it via the `?` form
  // used here, and a device that does not will simply open a blank composer.
  return `sms:${phone}?body=${encodeURIComponent(message)}`;
}
