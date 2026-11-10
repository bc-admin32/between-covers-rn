// The PlayRoom home page's look: wine satin, champagne text, rose-gold and gold
// accents. Pillow Talk and the tile pages keep their own styles.

// Full-screen background, the same for every month. Hosted with the Cozy
// images on the CDN; until it's uploaded (or if it fails) the page shows WINE.
export const PLAYROOM_BACKGROUND_URL = 'https://cdn.betweencovers.app/playroom/background.jpg';

// Iris beside the theme banner, in a rose-gold circle: the PlayRoom portrait
// (3:4 head-and-shoulders PNG) on the CDN, cropped so her face fills the
// circle, so she can be swapped without an app update. A replacement needs
// the same framing. If it's missing or fails, the same circle shows the
// current avatar.
export const IRIS_PLAYROOM_URL = 'https://cdn.betweencovers.app/playroom/iris.png';
export const IRIS_AVATAR_URL = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png';

export const WINE = '#3D0C1C';
export const CHAMPAGNE = '#F7E7CE';
export const ROSE_GOLD = '#E3B096';
export const GOLD = '#D9B57A';

// Translucent wine cards with a thin rose-gold border.
export const CARD_FILL = 'rgba(58,10,26,0.62)';
export const CARD_BORDER = 'rgba(227,176,150,0.55)';
// Tile cards are solid; event cards keep CARD_FILL.
export const TILE_FILL = '#390B1C';

export const FONT_SCRIPT = 'GreatVibes_400Regular'; // "The PlayRoom" only
export const FONT_CAPS = 'Cormorant_600SemiBold'; // used in capitals, widely spaced
export const FONT_SERIF = 'Cormorant_700Bold';
export const FONT_THEME = 'Cormorant_400Regular_Italic'; // the month's theme title
export const FONT_TILE = 'Cormorant_600SemiBold'; // tile titles
export const FONT_BODY = 'Nunito_400Regular'; // month name, tagline, tile descriptions
