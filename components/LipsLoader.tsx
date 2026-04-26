// LipsLoader — BC-branded loading indicator
// Use for any non-rating loading state (page transitions, API fetches, Suspense fallbacks)
// Do NOT use for chef's kiss ratings — that's a separate component

import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

const SIZE_MAP = { sm: 32, md: 64, lg: 96, xl: 128 } as const;

type SizeToken = keyof typeof SIZE_MAP;
type Props = { size?: number | SizeToken };

export default function LipsLoader({ size = 64 }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.06,
            duration: 700,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.quad),
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.quad),
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 700,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.quad),
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.quad),
          }),
        ]),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const px = typeof size === 'number' ? size : SIZE_MAP[size];

  return (
    <Animated.Image
      source={require('../assets/lips-loader.png')}
      style={{
        width: px,
        height: px,
        opacity,
        transform: [{ scale }],
      }}
      resizeMode="contain"
    />
  );
}
