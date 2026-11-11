import { StyleSheet } from 'react-native';
import { useActiveCozyLayout } from './cozyLayout';

// The tile pages' look in PlayRoom months (Between the Sheets, Watch Me,
// Self Care, Beyond the Cover, Keep Me Guessing, Newbies): Pillow Talk's
// light-card colors on a linen page. Each page lays these over its own styles
// only when usePlayroom() is true, so Classic months look as before.
export const PR = {
  pageBg: '#F0EDE4',
  heading: '#1A1A2E', // 14.6:1 on the page
  body: '#6A5550', // 5.9:1 on the page, 6.9:1 on white cards
  eyebrow: '#B83255', // labels, counts, section titles: 4.95:1 on the page
  rose: '#B83255', // buttons; white text on it is 5.8:1
  onRose: '#FFFFFF',
  cardBorder: '#DDD5C4',
  softButton: 'rgba(26,26,46,0.06)', // round back/filter buttons
  overlay: 'rgba(26,26,46,0.55)', // behind bottom sheets
} as const;

// True in PlayRoom months: the live month's layout switch.
export function usePlayroom(): boolean {
  return useActiveCozyLayout() === 'playroom';
}

// Color overrides laid over a page's own styles, e.g.
// `[styles.headerTitle, playroom && prStyles.heading]`.
export const prStyles = StyleSheet.create({
  page: { backgroundColor: PR.pageBg },
  softButton: { backgroundColor: PR.softButton },
  heading: { color: PR.heading },
  body: { color: PR.body },
  eyebrow: { color: PR.eyebrow },
  cardBorder: { borderColor: PR.cardBorder },
  roseOutline: { borderColor: PR.rose },
  roseFill: { backgroundColor: PR.rose },
  onRose: { color: PR.onRose },
  overlay: { backgroundColor: PR.overlay },
});
