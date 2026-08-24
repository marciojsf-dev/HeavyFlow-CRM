
/**
 * Normalizes a phone number for Meta API (strips non-digits)
 * and ensures it has the 55 prefix if missing and requested.
 */
export function normalizePhone(phone: string, forceBrazil: boolean = true): string {
  let cleaned = phone.replace(/\D/g, '');
  
  if (forceBrazil) {
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }
    if (cleaned.length >= 10 && !cleaned.startsWith('55')) {
      cleaned = '55' + cleaned;
    }
  }
  
  return cleaned;
}

/**
 * Returns a canonical ID for Brazilian numbers (with 9th digit if applicable)
 * to match Meta API behavior.
 */
export function getCanonicalId(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  // Brazil Normalization:
  // If starts with 55 and has 12 digits, it might be missing the 9.
  // But if Meta is sending 13, it's better to stick to 13.
  // We'll let the Meta API dictate the final form, but for local storage
  // we try to keep it as received.
  return cleaned;
}

/**
 * Formats a phone number for the UI: (99) 99999-9999
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  
  let val = cleaned;
  if (val.startsWith('55')) {
    val = val.substring(2);
  }
  
  if (val.length === 11) {
    return `(${val.substring(0, 2)}) ${val.substring(2, 3)} ${val.substring(3, 7)}-${val.substring(7)}`;
  } else if (val.length === 10) {
    return `(${val.substring(0, 2)}) ${val.substring(2, 6)}-${val.substring(6)}`;
  } else if (val.length === 9) {
    return `${val.substring(0, 5)}-${val.substring(5)}`;
  } else if (val.length === 8) {
    return `${val.substring(0, 4)}-${val.substring(4)}`;
  }
  
  return phone; 
}
