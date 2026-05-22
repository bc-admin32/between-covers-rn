// User-facing taxonomy for the Tag-this-book modal. Source of truth for
// v1.0.0. v1.0.1+ will swap in a Lambda-backed taxonomy fetch while
// keeping this shape so existing imports continue to compile.

export type SpiceKey = 'NONE' | 'LIGHT' | 'WARM' | 'HOT' | 'VERY_HOT';

export type TriggerKey =
  | 'cheating' | 'abuse' | 'mentalHealthTrauma' | 'violence'
  | 'pregnancyLoss' | 'addiction' | 'heavyHeartbreak' | 'illness';

export type TropeKey =
  | 'ENEMIES_TO_LOVERS' | 'FRIENDS_TO_LOVERS' | 'FAKE_DATING'
  | 'SECOND_CHANCE' | 'FORCED_PROXIMITY' | 'GRUMPY_SUNSHINE'
  | 'SLOW_BURN' | 'BROTHERS_BEST_FRIEND' | 'ARRANGED_MARRIAGE'
  | 'AGE_GAP' | 'SMALL_TOWN' | 'FATED_MATES'
  | 'WORKPLACE_ROMANCE' | 'FORBIDDEN_LOVE';

export type RatingKey =
  | 'TRASH' | 'MEH' | 'CUTE' | 'OBSESSED' | 'CHEFS_KISS';

export const SPICE_LEVELS: Array<{ key: SpiceKey; label: string; emoji: string }> = [
  { key: 'NONE',     label: 'Clean & cozy',         emoji: '🫖' },
  { key: 'LIGHT',    label: 'Keep it cute',         emoji: '😇' },
  { key: 'WARM',     label: 'A little kick',        emoji: '🍹' },
  { key: 'HOT',      label: "We're day drinking",   emoji: '🥂' },
  { key: 'VERY_HOT', label: 'Absolutely unhinged',  emoji: '🥵' },
];

export const TRIGGERS: Array<{ key: TriggerKey; label: string; emoji: string }> = [
  { key: 'cheating',           label: 'Cheating / Infidelity',            emoji: '🚫' },
  { key: 'abuse',              label: 'Emotional or physical abuse',      emoji: '🖤' },
  { key: 'mentalHealthTrauma', label: 'Mental health trauma / self-harm', emoji: '🧠' },
  { key: 'violence',           label: 'Violence or graphic injury',       emoji: '🩸' },
  { key: 'pregnancyLoss',      label: 'Pregnancy loss / fertility',       emoji: '👶' },
  { key: 'addiction',          label: 'Drug or addiction themes',         emoji: '🧪' },
  { key: 'heavyHeartbreak',    label: 'Heavy emotional heartbreak',       emoji: '😢' },
  { key: 'illness',            label: 'Illness or injury',                emoji: '😰' },
];

export const TROPES: Array<{ key: TropeKey; label: string; emoji: string }> = [
  { key: 'ENEMIES_TO_LOVERS',    label: 'Enemies to Lovers',     emoji: '⚔️' },
  { key: 'FRIENDS_TO_LOVERS',    label: 'Friends to Lovers',     emoji: '🤝' },
  { key: 'FAKE_DATING',          label: 'Fake Dating',           emoji: '💍' },
  { key: 'SECOND_CHANCE',        label: 'Second Chance',         emoji: '🔁' },
  { key: 'FORCED_PROXIMITY',     label: 'Forced Proximity',      emoji: '🚪' },
  { key: 'GRUMPY_SUNSHINE',      label: 'Grumpy / Sunshine',     emoji: '☀️' },
  { key: 'SLOW_BURN',            label: 'Slow Burn',             emoji: '🐢' },
  { key: 'BROTHERS_BEST_FRIEND', label: "Brother's Best Friend", emoji: '👬' },
  { key: 'ARRANGED_MARRIAGE',    label: 'Arranged Marriage',     emoji: '🕊️' },
  { key: 'AGE_GAP',              label: 'Age Gap',               emoji: '⏳' },
  { key: 'SMALL_TOWN',           label: 'Small Town',            emoji: '🏘️' },
  { key: 'FATED_MATES',          label: 'Fated Mates',           emoji: '🌙' },
  { key: 'WORKPLACE_ROMANCE',    label: 'Workplace Romance',     emoji: '🏢' },
  { key: 'FORBIDDEN_LOVE',       label: 'Forbidden Love',        emoji: '🚫' },
];

// Verdict ratings match what VerdictRating component already uses,
// re-exported here as a const for the tag modal.
export const RATINGS: Array<{ key: RatingKey; emoji: string; label: string }> = [
  { key: 'TRASH',      emoji: '🗑️', label: 'Trash'      },
  { key: 'MEH',        emoji: '😐', label: 'Meh'        },
  { key: 'CUTE',       emoji: '😊', label: 'Cute'       },
  { key: 'OBSESSED',   emoji: '😍', label: 'Obsessed'   },
  { key: 'CHEFS_KISS', emoji: '💋', label: "Chef's Kiss"},
];
