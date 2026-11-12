// BC member rating summary, as returned by book detail (libraryDetailGet),
// movie detail (cozyGetMovie) and both rate endpoints. null at 0 ratings.
// breakdown entries may be missing for verdicts nobody picked, so anything
// that reads them must guard.
export type RatingSummary = {
  totalRatings: number;
  topVerdict: string;
  topPct: number;
  breakdown?: Partial<Record<string, { count: number; pct: number }>>;
};

const VERDICT_LINE: Record<string, { emoji: string; label: string }> = {
  trash:      { emoji: '🗑️', label: 'Trash' },
  meh:        { emoji: '😐', label: 'Meh' },
  cute:       { emoji: '😊', label: 'Cute' },
  obsessed:   { emoji: '😍', label: 'Obsessed' },
  chefs_kiss: { emoji: '💋', label: "Chef's Kiss" },
};

// "😍 72% Obsessed · 14 ratings", or null when there's nothing to show
// (no ratings yet, or an unknown verdict), so callers show the empty prompt.
export function ratingSummaryLine(summary: RatingSummary | null | undefined): string | null {
  const total = summary?.totalRatings;
  if (!summary || typeof total !== 'number' || total < 1) return null;
  const verdict = VERDICT_LINE[summary.topVerdict];
  if (!verdict) return null;
  const pct = Math.round(Number(summary.topPct) || 0);
  return `${verdict.emoji} ${pct}% ${verdict.label} · ${total} ${total === 1 ? 'rating' : 'ratings'}`;
}
