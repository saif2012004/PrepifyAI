import React from 'react';
import { motion } from 'framer-motion';
import type { FadeInProps, FadeDirection } from './FadeIn';

function fromOffset(direction: FadeDirection, distance: number) {
  switch (direction) {
    case 'up':
      return { y: distance };
    case 'down':
      return { y: -distance };
    case 'left':
      return { x: distance };
    case 'right':
      return { x: -distance };
    default:
      return {};
  }
}

/**
 * Web (React DOM) variant of {@link FadeIn}, powered by Framer Motion.
 * Same public API as the native Moti implementation; the Expo/Metro bundler
 * resolves this `.web.tsx` file automatically for the web build.
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
    <motion.div
      initial={{ opacity: 0, ...fromOffset(direction, distance) }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: duration / 1000, delay: delay / 1000, ease: [0.22, 1, 0.36, 1] }}
      style={style as React.CSSProperties}
    >
      {children}
    </motion.div>
  );
}

export default FadeIn;
