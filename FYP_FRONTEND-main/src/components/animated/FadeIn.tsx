import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { MotiView } from 'moti';

export type FadeDirection = 'up' | 'down' | 'left' | 'right' | 'none';

export type FadeInProps = {
  children: React.ReactNode;
  /** Delay before the animation starts (ms). Use with an index to stagger lists. */
  delay?: number;
  /** Animation duration (ms). */
  duration?: number;
  /** Direction the content travels in from. */
  direction?: FadeDirection;
  /** Travel distance in px for the slide part of the fade. */
  distance?: number;
  style?: StyleProp<ViewStyle>;
};

function fromOffset(direction: FadeDirection, distance: number) {
  switch (direction) {
    case 'up':
      return { translateY: distance };
    case 'down':
      return { translateY: -distance };
    case 'left':
      return { translateX: distance };
    case 'right':
      return { translateX: -distance };
    default:
      return {};
  }
}

/**
 * Cross-platform fade/slide-in wrapper.
 *
 * Native (Android/iOS) + Expo web use this Moti/Reanimated implementation.
 * The web build additionally has a Framer Motion variant in `FadeIn.web.tsx`
 * (the bundler picks it automatically) so browser users get Framer Motion easing.
 */
export function FadeIn({
  children,
  delay = 0,
  duration = 420,
  direction = 'up',
  distance = 16,
  style,
}: FadeInProps) {
  return (
    <MotiView
      from={{ opacity: 0, translateX: 0, translateY: 0, ...fromOffset(direction, distance) }}
      animate={{ opacity: 1, translateX: 0, translateY: 0 }}
      transition={{ type: 'timing', duration, delay }}
      style={style}
    >
      {children}
    </MotiView>
  );
}

export default FadeIn;
