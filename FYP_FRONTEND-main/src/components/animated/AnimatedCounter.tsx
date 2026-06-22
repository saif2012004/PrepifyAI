import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

export type AnimatedCounterProps = {
  /** Target value to count up (or down) to. */
  value: number;
  /** Animation duration (ms). */
  duration?: number;
  /** Decimal places to render. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
};

// Ease-out cubic for a lively-then-settling count.
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts a number up to `value` using requestAnimationFrame.
 * Works on native and web (both expose global rAF).
 */
export function AnimatedCounter({
  value,
  duration = 900,
  decimals = 0,
  prefix = '',
  suffix = '',
  style,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const start = Date.now();
    let raf = 0;

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / duration);
      const current = from + (to - from) * easeOut(progress);
      setDisplay(current);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <Text style={style}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </Text>
  );
}

export default AnimatedCounter;
