import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { spacing } from '../lib/theme';

// FTC §255 "clear and conspicuous" affiliate disclosure. Single source of
// truth for the wording so all three placements (cozy index, cozy items,
// book detail) stay aligned if/when copy needs to change.

const COPY = 'Between Covers may earn a commission from purchases made through these links.';

type Props = {
  style?: StyleProp<ViewStyle>;
};

export default function AffiliateDisclosure({ style }: Props) {
  return (
    <View style={[styles.container, style]} accessible accessibilityRole="text">
      <Text style={styles.text}>{COPY}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    fontSize: 11,
    lineHeight: 15,
    color: '#6A5550',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
