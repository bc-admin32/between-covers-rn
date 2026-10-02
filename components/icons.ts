// icons — the phosphor icons the app uses, imported one module per icon.
// Importing from 'phosphor-react-native' itself pulls all ~1,500 icons in six
// weights into the bundle (~10 MB of JS); these per-icon paths pull only what's
// listed. Add new icons here rather than importing from the package root.
// Paths match the package's "react-native" entry (src/), so the code is the
// same Metro bundled before.

/* eslint-disable @typescript-eslint/no-require-imports */
import type { Icon } from 'phosphor-react-native';

export const ArrowRight: Icon = require('phosphor-react-native/src/icons/ArrowRight').default;
export const Book: Icon = require('phosphor-react-native/src/icons/Book').default;
export const CaretDown: Icon = require('phosphor-react-native/src/icons/CaretDown').default;
export const CaretLeft: Icon = require('phosphor-react-native/src/icons/CaretLeft').default;
export const Chats: Icon = require('phosphor-react-native/src/icons/Chats').default;
export const Check: Icon = require('phosphor-react-native/src/icons/Check').default;
export const Copy: Icon = require('phosphor-react-native/src/icons/Copy').default;
export const Funnel: Icon = require('phosphor-react-native/src/icons/Funnel').default;
export const HeartStraight: Icon = require('phosphor-react-native/src/icons/HeartStraight').default;
export const HouseSimple: Icon = require('phosphor-react-native/src/icons/HouseSimple').default;
export const User: Icon = require('phosphor-react-native/src/icons/User').default;
export const Warning: Icon = require('phosphor-react-native/src/icons/Warning').default;
export const X: Icon = require('phosphor-react-native/src/icons/X').default;
