import type { ImageSourcePropType } from 'react-native';
import type { TileKey } from '../../lib/cozyLayout';

// The six PlayRoom tiles, in display order (three rows of two). The artwork is
// fixed — the same every month — and carries no text; the app draws the label
// (the Newbies label changes with the month).
//
// `image` is null until the artwork arrives; the tile shows `placeholder`
// colour instead. Drop the files in assets/playroom/ and set e.g.
//   image: require('../../assets/playroom/between-the-sheets.jpg'),
export type TileDef = {
  key: TileKey;
  label: string; // the Newbies label is replaced with "[Month]'s Newbies"
  image: ImageSourcePropType | null;
  placeholder: string;
};

export const PLAYROOM_TILES: TileDef[] = [
  { key: 'betweenTheSheets', label: 'Between the Sheets', image: null, placeholder: '#7A2240' },
  { key: 'watchMe',          label: 'Watch Me',           image: null, placeholder: '#3B2A4A' },
  { key: 'aftercare',        label: 'Aftercare',          image: null, placeholder: '#A0526B' },
  { key: 'talkDirtyToMe',    label: 'Talk Dirty to Me',   image: null, placeholder: '#5C1F33' },
  { key: 'pillowTalk',       label: 'Pillow Talk',        image: null, placeholder: '#6B4A6E' },
  { key: 'newbies',          label: 'Newbies',            image: null, placeholder: '#B83255' },
];
