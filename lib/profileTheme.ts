// Profile's own cool palette (Profile, Account & Settings, Share Feedback,
// Legal). Never the PlayRoom colors or the monthly theme. Contrast ratios are
// against the card (#F0EDE4) and the page (#E8EEF2), which are equally light.
export const PF = {
  page: '#E8EEF2', // very pale #D7E2E9
  header: '#BCCEDD', // softened #A9C0D4
  card: '#F0EDE4', // cards and surfaces
  border: 'rgba(169,192,212,0.6)', // card edges and row dividers (a tint of #A9C0D4)
  text: '#0F2A48', // 12.4:1; 9.0:1 on the header
  secondary: '#6A5969', // 5.5:1
  accent: '#B83255', // 4.95:1; white on it 5.8:1
  accentOnHeader: '#9E2A49', // 4.5:1 on the header (Founding Member)
  label: '#48627A', // darker #A9C0D4 family: 5.4:1; 4.8:1 on pills
  icon: '#48627A',
  pill: '#D7E2E9', // genre pills, navy text 11.0:1
  placeholder: '#5B7084', // 5.1:1 on white inputs
  inputBorder: '#7F97AC', // 3.0:1 on white
  switchOff: '#6F879C', // 3.2:1 on the card
  success: '#237A50', // 4.5:1
  readOnly: '#E3E9EE', // read-only field background; label text on it 4.6:1
} as const;
