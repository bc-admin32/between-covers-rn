// Keeps a leading or trailing emoji on the same line as the word next to it,
// so a title like "Lavender Soak 🛁" never wraps with the emoji alone on a
// line. Swaps that one space for a non-breaking space; the text is unchanged.
// A token with no letters or digits is treated as the emoji (same rule as
// splitLeadingEmoji in PillowTalk).
const NBSP = ' ';
const HAS_WORD_CHAR = /[A-Za-z0-9À-ɏ]/;

export function keepEmojiAttached(raw: string): string {
  if (typeof raw !== 'string') return raw;
  let s = raw;
  const trailing = /^([\s\S]*\S)\s+(\S+)$/.exec(s);
  if (trailing && !HAS_WORD_CHAR.test(trailing[2])) s = `${trailing[1]}${NBSP}${trailing[2]}`;
  const leading = /^(\S+)\s+(\S[\s\S]*)$/.exec(s);
  if (leading && !HAS_WORD_CHAR.test(leading[1])) s = `${leading[1]}${NBSP}${leading[2]}`;
  return s;
}
