import type { ImageSourcePropType } from 'react-native';
import type { Icon } from 'phosphor-react-native';
import type { TileKey } from '../../lib/cozyLayout';
import { BookOpen, ChatsCircle, Coffee, FilmSlate, Microphone, Sparkle } from '../icons';

// The six PlayRoom tiles, in display order (one wide card per row). The photo
// is fixed — the same every month — and carries no text or icons; the app
// draws the icon, the label (the Newbies label changes with the month) and the
// description beside it.
//
// `image` is null until the photos arrive; the photo area shows `placeholder`
// colour instead. Photos are 720 × 500 px JPGs, right edge fading to dark
// wine. Drop them in assets/playroom/ and set e.g.
//   image: require('../../assets/playroom/between-the-sheets.jpg'),
export type TileDef = {
  key: TileKey;
  label: string; // the Newbies label is replaced with "[Month]'s Newbies"
  description: string;
  icon: Icon;
  image: ImageSourcePropType | null;
  placeholder: string;
};

export const PLAYROOM_TILES: TileDef[] = [
  { key: 'betweenTheSheets', label: 'Between the Sheets', description: 'Themed Books',        icon: BookOpen,    image: null, placeholder: '#7A2240' },
  { key: 'watchMe',          label: 'Watch Me',           description: 'Movies & Series',     icon: FilmSlate,   image: null, placeholder: '#3B2A4A' },
  { key: 'aftercare',        label: 'Self Care',          description: 'Recipes & Finds',     icon: Coffee,      image: null, placeholder: '#A0526B' },
  { key: 'talkDirtyToMe',    label: 'Beyond the Cover',   description: 'Authors & Narrators', icon: Microphone,  image: null, placeholder: '#5C1F33' },
  { key: 'pillowTalk',       label: 'Pillow Talk',        description: 'The Community',       icon: ChatsCircle, image: null, placeholder: '#6B4A6E' },
  { key: 'newbies',          label: 'Newbies',            description: 'New Releases',        icon: Sparkle,     image: null, placeholder: '#B83255' },
];
