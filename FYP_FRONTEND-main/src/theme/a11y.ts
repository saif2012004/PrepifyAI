/**
 * Accessibility helpers — use on icon-only TouchableOpacity / Pressable.
 * Pair every visual-only control with accessibilityLabel (+ accessibilityHint when helpful).
 */

import type { AccessibilityProps } from 'react-native';

export function a11yIconButton(
  label: string,
  hint?: string
): Pick<AccessibilityProps, 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityHint'> {
  return {
    accessibilityRole: 'button',
    accessibilityLabel: label,
    ...(hint ? { accessibilityHint: hint } : {}),
  };
}

/** Prefer minimum touch target ~44pt (enforce via padding in styles). */
export const MIN_TOUCH_TARGET = 44;
