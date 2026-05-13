// Visibility + label rules for retailer CTAs. Backed by the per-retailer
// *Url / *ValidationStatus / *IsExact fields written to BookCatalog rows by
// the bookshopUrlValidator pipeline. Unknown future status strings fall
// through to the normal label so the app never crashes on a new status.

export type RetailerKey = 'amazonKindle' | 'audible' | 'bookshop';

export type RetailerValidationStatus =
  | 'valid'
  | 'repaired'
  | 'fallback_isbn_search'
  | 'fallback_title_search'
  | 'no_match'
  | 'manual_broken'
  | 'check_failed';

export type RetailerCTAFields = {
  amazonKindleUrl?: string | null;
  amazonKindleValidationStatus?: RetailerValidationStatus | string | null;
  amazonKindleIsExact?: boolean | null;
  audibleUrl?: string | null;
  audibleValidationStatus?: RetailerValidationStatus | string | null;
  audibleIsExact?: boolean | null;
  bookshopUrl?: string | null;
  bookshopValidationStatus?: RetailerValidationStatus | string | null;
  bookshopIsExact?: boolean | null;
};

export type RetailerCTAState =
  | { visible: false }
  | {
      visible: true;
      url: string;
      label: string;
      isFallback: boolean;
      validationStatus: string | null;
    };

const LABELS: Record<RetailerKey, { normal: string; fallback: string }> = {
  amazonKindle: { normal: 'Buy on Amazon',     fallback: 'Find on Amazon' },
  audible:      { normal: 'Listen on Audible', fallback: 'Find on Audible' },
  bookshop:     { normal: 'Buy on Bookshop',   fallback: 'Buy on Bookshop' },
};

export const RETAILERS: RetailerKey[] = ['amazonKindle', 'audible', 'bookshop'];

// Maps the helper's retailer key to the short id stored in user
// profiles (preferredRetailer) and analytics — pre-existing profiles
// hold 'amazon', not 'amazonKindle'.
export const RETAILER_PROFILE_ID: Record<RetailerKey, string> = {
  amazonKindle: 'amazon',
  audible: 'audible',
  bookshop: 'bookshop',
};

export function getRetailerCTA(
  fields: RetailerCTAFields,
  retailer: RetailerKey,
): RetailerCTAState {
  const url = fields[`${retailer}Url`];
  const status = fields[`${retailer}ValidationStatus`] ?? null;

  if (!url) return { visible: false };
  if (status === 'no_match' || status === 'manual_broken') {
    return { visible: false };
  }

  const isFallback =
    status === 'fallback_isbn_search' || status === 'fallback_title_search';

  return {
    visible: true,
    url,
    label: isFallback ? LABELS[retailer].fallback : LABELS[retailer].normal,
    isFallback,
    validationStatus: status,
  };
}
