/**
 * Rough width of a line of text in ems, for the collapsed lock-screen card. Hangul and other
 * wide glyphs take a full em; Latin, digits, spaces and punctuation take less.
 */
export function ems(text: string) {
  let w = 0;
  for (const ch of text) {
    if (/[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch)) w += 1;
    else if (ch === " ") w += 0.3;
    else if (/[A-Z]/.test(ch)) w += 0.68;
    else if (/[a-z0-9]/.test(ch)) w += 0.56;
    else w += 0.36;
  }
  return w;
}

/**
 * The collapsed card holds two lines of 14sp text beside the O/X keys (about 146dp each on a
 * 411dp-wide phone). Korean wraps per character, so the total width is what matters.
 */
export const LOCK_LINE_EMS = 9.8;
export const fitsLockCard = (text: string) => ems(text) <= LOCK_LINE_EMS * 2;
