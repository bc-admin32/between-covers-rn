// Library reading statuses, in the order the status buttons show them.
// DNF = did not finish: still in the user's library (and in "All"), with its
// own filter pill. Only FINISHED opens the rating popup and the store-review
// prompt; DNF does neither.

export type LibraryStatus = 'WANT_TO_READ' | 'CURRENTLY_READING' | 'FINISHED' | 'DNF';

export const LIBRARY_STATUSES: readonly LibraryStatus[] = ['WANT_TO_READ', 'CURRENTLY_READING', 'FINISHED', 'DNF'];

export const LIBRARY_STATUS_LABELS: Record<LibraryStatus, string> = {
  WANT_TO_READ: 'Wishlist',
  CURRENTLY_READING: 'Reading',
  FINISHED: 'Finished',
  DNF: 'DNF',
};
