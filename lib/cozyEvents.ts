import { parseLocalEndOfDay } from './dateUtils';

// The month's Cozy events (dance parties, author events, community events) —
// the month editor's event items, NOT Iris Live. /cozy/home?rows=scroll mixes
// them into `visual` (category "event"); ?view=full returns them separately in
// `events`. Each event has one date, `eventDate` (YYYY-MM-DD, the day it
// happens), and an optional `recordingLink`.

export type CozyEvent = {
  sk?: string;
  eventId?: string;
  category?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  eventDate?: string;
  recordingLink?: string;
};

export type EventStage = 'invited' | 'recording_soon' | 'recording';

type SectionsWithEvents = { visual?: unknown; events?: unknown } | null | undefined;

function asEvents(v: unknown): CozyEvent[] {
  return Array.isArray(v) ? (v as CozyEvent[]).filter((e) => e && typeof e.title === 'string') : [];
}

// Both places, without duplicates, earliest date first.
export function monthEvents(sections: SectionsWithEvents): CozyEvent[] {
  const fromVisual = asEvents(sections?.visual).filter((e) => e.category?.toLowerCase() === 'event');
  const all = [...asEvents(sections?.events), ...fromVisual];
  const seen = new Set<string>();
  const unique = all.filter((e) => {
    const key = e.eventId ?? e.sk ?? `${e.title}|${e.eventDate ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => (a.eventDate ?? '').localeCompare(b.eventDate ?? ''));
}

// The event's state:
// - recording link filled in            → "Watch the Recording"
// - until the end of the event's day    → "You're Invited" (also with no date)
// - after that, with no recording yet   → "Recording coming soon"
export function eventStage(event: CozyEvent, now: Date = new Date()): EventStage {
  if (event.recordingLink?.trim()) return 'recording';
  if (!event.eventDate) return 'invited';
  const end = parseLocalEndOfDay(event.eventDate);
  if (Number.isNaN(end.getTime())) return 'invited';
  return now <= end ? 'invited' : 'recording_soon';
}

export const EVENT_STAGE_LABELS: Record<EventStage, string> = {
  invited: "You're Invited",
  recording_soon: 'Recording coming soon',
  recording: 'Watch the Recording',
};
