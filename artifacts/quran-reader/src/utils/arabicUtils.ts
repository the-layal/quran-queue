/**
 * Returns true if the string contains at least one Arabic letter codepoint.
 *
 * Arabic Unicode ranges checked:
 *   U+0621–U+065F  — Arabic letters (hamza through diacritics)
 *   U+0660–U+06AF  — Extended Arabic letters
 *
 * Waqf/pause marks (U+06D6–U+06DB: ۖ ۗ ۘ ۙ ۚ ۛ) fall above U+06AF and
 * contain NO Arabic letters, so this function returns false for them.
 */
export function hasArabicLetter(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x0621 && cp <= 0x065f) || (cp >= 0x0660 && cp <= 0x06af)) {
      return true;
    }
  }
  return false;
}
