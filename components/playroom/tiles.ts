import type { Icon } from 'phosphor-react-native';
import type { TileKey } from '../../lib/cozyLayout';
import { BookOpen, ChatsCircle, Coffee, FilmSlate, Microphone, Sparkle } from '../icons';

// The six PlayRoom tiles, in display order (one wide card per row). The photo
// is fixed — the same every month — and carries no text or icons; the app
// draws the icon, the label (the Newbies label changes with the month) and the
// description beside it.
//
// Photos are 720 × 500 px JPGs (right edge fading to dark wine) on the CDN at
// playroom/tiles/<file>, so they can be swapped without an app update. A
// missing photo shows the `placeholder` colour instead.
export type TileDef = {
  key: TileKey;
  label: string; // the Newbies label is replaced with "[Month]'s Newbies"
  description: string;
  icon: Icon;
  file: string; // under TILE_IMAGE_BASE
  placeholder: string;
};

export const TILE_IMAGE_BASE = 'https://cdn.betweencovers.app/playroom/tiles/';

export const PLAYROOM_TILES: TileDef[] = [
  { key: 'betweenTheSheets', label: 'Between the Sheets', description: 'Themed Books',        icon: BookOpen,    file: 'between-the-sheets.jpg', placeholder: '#7A2240' },
  { key: 'watchMe',          label: 'Watch Me',           description: 'Movies & Series',     icon: FilmSlate,   file: 'watch-me.jpg',           placeholder: '#3B2A4A' },
  { key: 'aftercare',        label: 'Self Care',          description: 'Recipes & Finds',     icon: Coffee,      file: 'self-care.jpg',          placeholder: '#A0526B' },
  { key: 'talkDirtyToMe',    label: 'Beyond the Cover',   description: 'Authors & Narrators', icon: Microphone,  file: 'beyond-the-cover.jpg',   placeholder: '#5C1F33' },
  { key: 'pillowTalk',       label: 'Pillow Talk',        description: 'The Community',       icon: ChatsCircle, file: 'pillow-talk.jpg',        placeholder: '#6B4A6E' },
  { key: 'newbies',          label: 'Newbies',            description: 'New Releases',        icon: Sparkle,     file: 'newbies.jpg',            placeholder: '#B83255' },
];
