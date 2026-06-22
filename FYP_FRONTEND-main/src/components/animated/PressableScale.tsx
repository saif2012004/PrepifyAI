import React, { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { MotiView } from 'moti';

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale applied while pressed (1 = no shrink). */
  scaleTo?: number;
};

/**
 * Pressable with a springy scale-down micro-interaction on press.
 * Cross-platform (native + web) via Moti; no hand-written worklets.
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.96,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <MotiView
        animate={{ scale: pressed ? scaleTo : 1 }}
        transition={{ type: 'timing', duration: 140 }}
        style={style}
      >
        {children}
      </MotiView>
    </Pressable>
  );
}

export default PressableScale;
