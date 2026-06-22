import React, { useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { MotiView } from 'moti';

export type AnimatedProgressBarProps = {
  /** Progress from 0 to 1. */
  progress: number;
  /** Track height in px. */
  height?: number;
  /** Fill colour. */
  color?: string;
  /** Track (background) colour. */
  trackColor?: string;
  /** Animation duration (ms). */
  duration?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Horizontal progress bar whose fill animates to `progress`.
 * Measures its own width (onLayout) and animates an absolute px width so it
 * behaves identically on native and web.
 */
export function AnimatedProgressBar({
  progress,
  height = 8,
  color = '#6366F1',
  trackColor = 'rgba(255,255,255,0.12)',
  duration = 700,
  style,
}: AnimatedProgressBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const clamped = Math.max(0, Math.min(1, progress));

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={[
        { height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' },
        style,
      ]}
    >
      <MotiView
        animate={{ width: trackWidth * clamped }}
        transition={{ type: 'timing', duration }}
        style={{ height, borderRadius: height / 2, backgroundColor: color }}
      />
    </View>
  );
}

export default AnimatedProgressBar;
